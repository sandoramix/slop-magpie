import { itemSaves, items } from "@magpie/db";
import type {
  CreateItemResponse,
  CreateUserResponse,
  DashboardFeedbackResponse,
  DashboardProgress,
  FeedbackPromptsResponse,
  InviteResponse,
  ItemDetail,
  LoginResponse,
  NotificationListResponse,
  PostDetail,
  PostListResponse,
  Profile,
  ReportListResponse,
  SaveListResponse,
} from "@magpie/shared/api";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type IntegrationEnv, integrationEnv } from "./testing.ts";

const serverUrl = inject("databaseUrl");

describe.skipIf(!serverUrl)("social layer (integration)", () => {
  let env: IntegrationEnv;
  let alice: CreateUserResponse;
  let bob: CreateUserResponse;

  const json = async <T>(res: Response | Promise<Response>, status: number): Promise<T> => {
    const r = await res;
    const body: unknown = r.status === 204 ? null : await r.json();
    expect(r.status, JSON.stringify(body)).toBe(status);
    return body as T;
  };
  const as = (token: string, path: string, init: RequestInit & { json?: unknown } = {}) =>
    env.request(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });

  /** An imported item that finished downloading, so it can be published. */
  const importReady = async (token: string, url: string, title: string): Promise<string> => {
    const created = await json<CreateItemResponse>(as(token, "/items", { method: "POST", json: { url } }), 202);
    await env.deps.db.update(items).set({ fetchStatus: "ready", title }).where(eq(items.id, created.item.id));
    return created.item.id;
  };
  const publish = (token: string, id: string) => json<ItemDetail>(as(token, `/items/${id}`, { method: "PATCH", json: { visibility: "public" } }), 200);

  beforeAll(async () => {
    env = await integrationEnv(serverUrl, { signupLimit: 100 });
    alice = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "alice" } }), 201);
    bob = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "bob" } }), 201);
  });
  afterAll(async () => {
    await env.close();
  });

  it("publishes only finished items and shows them to others", async () => {
    const pending = await json<CreateItemResponse>(as(alice.token, "/items", { method: "POST", json: { url: "https://example.com/pending" } }), 202);
    expect((await as(alice.token, `/items/${pending.item.id}`, { method: "PATCH", json: { visibility: "public" } })).status).toBe(409);

    const id = await importReady(alice.token, "https://example.com/cake", "Lemon cake");
    expect((await publish(alice.token, id)).visibility).toBe("public");

    // private items are invisible to others, public ones are not
    const privateId = await importReady(alice.token, "https://example.com/private", "Secret");
    expect((await as(bob.token, `/posts/${privateId}`)).status).toBe(404);
    const post = await json<PostDetail>(as(bob.token, `/posts/${id}`), 200);
    expect(post).toMatchObject({ title: "Lemon cake", mine: false, owner: { name: "alice" } });

    const explore = await json<PostListResponse>(as(bob.token, "/explore"), 200);
    expect(explore.posts.map((p) => p.id)).toContain(id);
    expect(explore.posts.map((p) => p.id)).not.toContain(privateId);
  });

  it("saves are bookmarks that can be filed, and never count as imports", async () => {
    const id = await importReady(alice.token, "https://example.com/bread", "Sourdough");
    await publish(alice.token, id);

    const folder = await json<{ id: string }>(as(bob.token, "/folders", { method: "POST", json: { name: "Baking" } }), 201);
    const saved = await json<PostDetail>(as(bob.token, `/posts/${id}/save`, { method: "PUT" }), 200);
    expect(saved.savedByMe).toBe(true);
    await json<PostDetail>(as(bob.token, `/posts/${id}/save`, { method: "PATCH", json: { note: "try Sunday", folderIds: [folder.id] } }), 200);

    const list = await json<SaveListResponse>(as(bob.token, `/saves?folderId=${folder.id}`), 200);
    expect(list.saves).toHaveLength(1);
    expect(list.saves[0]).toMatchObject({ id, note: "try Sunday", folderIds: [folder.id] });

    // not part of Bob's own library
    const library = await json<{ items: { id: string }[] }>(as(bob.token, "/items"), 200);
    expect(library.items.map((i) => i.id)).not.toContain(id);
    expect((await as(alice.token, `/posts/${id}/save`, { method: "PUT" })).status).toBe(400);

    const savers = await json<{ count: number }>(as(alice.token, `/posts/${id}/savers`), 200);
    expect(savers.count).toBe(1);
  });

  it("removes the post for everyone when the owner deletes it and tells savers and likers", async () => {
    const id = await importReady(alice.token, "https://example.com/soup", "Pumpkin soup");
    await publish(alice.token, id);
    await json<PostDetail>(as(bob.token, `/posts/${id}/save`, { method: "PUT" }), 200);
    await json<PostDetail>(as(bob.token, `/posts/${id}/like`, { method: "PUT" }), 200);

    expect((await as(alice.token, `/items/${id}`, { method: "DELETE" })).status).toBe(204);

    expect((await as(bob.token, `/posts/${id}`)).status).toBe(404);
    const saves = await json<SaveListResponse>(as(bob.token, "/saves"), 200);
    expect(saves.saves.map((s) => s.id)).not.toContain(id);
    const inbox = await json<NotificationListResponse>(as(bob.token, "/notifications"), 200);
    expect(inbox.notifications.find((n) => n.type === "post_removed")?.payload).toMatchObject({ title: "Pumpkin soup", person: "alice" });
    expect(inbox.unreadCount).toBeGreaterThan(0);

    await as(bob.token, "/notifications/read", { method: "POST", json: {} });
    expect((await json<NotificationListResponse>(as(bob.token, "/notifications"), 200)).unreadCount).toBe(0);
  });

  it("un-publishing removes saves too, with a different notice", async () => {
    const id = await importReady(alice.token, "https://example.com/pie", "Apple pie");
    await publish(alice.token, id);
    await json<PostDetail>(as(bob.token, `/posts/${id}/save`, { method: "PUT" }), 200);
    await json<ItemDetail>(as(alice.token, `/items/${id}`, { method: "PATCH", json: { visibility: "private" } }), 200);

    expect((await as(bob.token, `/posts/${id}`)).status).toBe(404);
    // the owner's item is untouched
    expect((await as(alice.token, `/items/${id}`)).status).toBe(200);
    const inbox = await json<NotificationListResponse>(as(bob.token, "/notifications"), 200);
    expect(inbox.notifications.some((n) => n.type === "post_unshared" && n.payload.title === "Apple pie")).toBe(true);
  });

  it("follows build a feed, and blocks hide people both ways", async () => {
    const carol = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "carol" } }), 201);
    const id = await importReady(carol.token, "https://example.com/tacos", "Tacos");
    await publish(carol.token, id);

    expect((await json<PostListResponse>(as(bob.token, "/feed"), 200)).posts).toHaveLength(0);
    const profile = await json<Profile>(as(bob.token, "/profiles/carol/follow", { method: "PUT" }), 200);
    expect(profile).toMatchObject({ followedByMe: true, followerCount: 1, postCount: 1 });
    expect((await json<PostListResponse>(as(bob.token, "/feed"), 200)).posts.map((p) => p.id)).toEqual([id]);
    expect((await as(bob.token, "/profiles/bob/follow", { method: "PUT" })).status).toBe(400);

    await json<unknown>(as(carol.token, "/profiles/bob/block", { method: "PUT" }), 204);
    expect((await json<PostListResponse>(as(bob.token, "/feed"), 200)).posts).toHaveLength(0);
    expect((await as(bob.token, `/posts/${id}`)).status).toBe(404);
    expect((await as(bob.token, "/profiles/carol")).status).toBe(404);
  });

  it("lists followers and following, and unfollowing updates both lists", async () => {
    const dana = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "dana" } }), 201);
    const erin = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "erin2" } }), 201);
    await json<Profile>(as(dana.token, "/profiles/erin2/follow", { method: "PUT" }), 200);
    await json<Profile>(as(erin.token, "/profiles/dana/follow", { method: "PUT" }), 200);

    const followers = await json<{ people: Profile[] }>(as(erin.token, "/profiles/erin2/followers"), 200);
    expect(followers.people.map((p) => p.name)).toEqual(["dana"]);
    // erin follows dana back, so the row says so
    expect(followers.people[0]?.followedByMe).toBe(true);
    const following = await json<{ people: Profile[] }>(as(erin.token, "/profiles/erin2/following"), 200);
    expect(following.people.map((p) => p.name)).toEqual(["dana"]);

    // anyone can look at another person's lists
    expect((await json<{ people: Profile[] }>(as(bob.token, "/profiles/dana/following"), 200)).people.map((p) => p.name)).toEqual(["erin2"]);

    await json<Profile>(as(erin.token, "/profiles/dana/follow", { method: "DELETE" }), 200);
    expect((await json<{ people: Profile[] }>(as(erin.token, "/profiles/erin2/following"), 200)).people).toHaveLength(0);
    expect((await json<{ people: Profile[] }>(as(dana.token, "/profiles/dana/followers"), 200)).people).toHaveLength(0);
    expect((await as(erin.token, "/profiles/nobody/followers")).status).toBe(404);
  });

  it("collects quick feedback, prompts for it once, and feeds the dashboard", async () => {
    const id = await importReady(alice.token, "https://example.com/brownies", "Brownies");
    await publish(alice.token, id);
    await json<PostDetail>(as(bob.token, `/posts/${id}/save`, { method: "PUT" }), 200);

    // too early to ask
    expect((await json<FeedbackPromptsResponse>(as(bob.token, "/feedback/prompts"), 200)).prompts.map((p) => p.id)).not.toContain(id);
    await env.deps.db.update(itemSaves).set({ savedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) }).where(eq(itemSaves.itemId, id));
    expect((await json<FeedbackPromptsResponse>(as(bob.token, "/feedback/prompts"), 200)).prompts.map((p) => p.id)).toContain(id);

    // "not yet" snoozes
    await json<unknown>(as(bob.token, `/posts/${id}/feedback/snooze`, { method: "POST" }), 204);
    expect((await json<FeedbackPromptsResponse>(as(bob.token, "/feedback/prompts"), 200)).prompts.map((p) => p.id)).not.toContain(id);

    const rated = await json<PostDetail>(
      as(bob.token, `/posts/${id}/feedback`, { method: "PUT", json: { verdict: "worked", reasons: ["easy", "useful"] } }),
      200,
    );
    expect(rated.myFeedback).toMatchObject({ verdict: "worked", reasons: ["easy", "useful"] });
    expect(rated.feedback).toMatchObject({ total: 1, worked: 1 });
    // reasons are for the owner only
    expect(rated.feedback.reasons).toEqual({});
    const ownerView = await json<PostDetail>(as(alice.token, `/posts/${id}`), 200);
    expect(ownerView.feedback.reasons).toEqual({ easy: 1, useful: 1 });

    // changing the answer keeps one verdict per person
    await json<PostDetail>(as(bob.token, `/posts/${id}/feedback`, { method: "PUT", json: { verdict: "meh" } }), 200);
    expect((await json<PostDetail>(as(alice.token, `/posts/${id}`), 200)).feedback).toMatchObject({ total: 1, worked: 0, meh: 1 });

    const given = await json<DashboardFeedbackResponse>(as(bob.token, `/dashboard/feedback?tab=given&itemId=${id}`), 200);
    expect(given.entries).toHaveLength(1);
    expect(given.entries[0]).toMatchObject({ itemId: id, verdict: "meh", by: null });
    const received = await json<DashboardFeedbackResponse>(as(alice.token, `/dashboard/feedback?tab=received&verdict=meh`), 200);
    expect(received.entries.map((e) => e.itemId)).toContain(id);
    expect(received.entries[0]?.by).toMatchObject({ name: "bob" });
    expect((await json<DashboardFeedbackResponse>(as(alice.token, "/dashboard/feedback?tab=received&verdict=worked"), 200)).entries).toHaveLength(0);

    const progress = await json<DashboardProgress>(as(alice.token, "/dashboard/progress"), 200);
    expect(progress.publicItems).toBeGreaterThan(0);
    expect(progress.feedbackReceived).toBeGreaterThan(0);
    expect(progress.activeWeeks).toBeGreaterThanOrEqual(1);
  });

  it("'I tried it' puts the item straight into the prompts", async () => {
    const id = await importReady(alice.token, "https://example.com/granola", "Granola");
    await publish(alice.token, id);
    const tried = await json<PostDetail>(as(bob.token, `/posts/${id}/tried`, { method: "PUT" }), 200);
    expect(tried.triedByMe).toBe(true);
    expect((await json<FeedbackPromptsResponse>(as(bob.token, "/feedback/prompts"), 200)).prompts.map((p) => p.id)).toContain(id);
  });

  it("signup needs an invite while registration is invite-only and works freely when open", async () => {
    const signup = (body: unknown) => env.request("/auth/signup", { method: "POST", json: body });
    expect(await json<{ mode: string; providers: string[] }>(env.request("/auth/config"), 200)).toEqual({ mode: "invite", providers: [] });

    expect((await signup({ username: "dave", password: "correct horse battery" })).status).toBe(403);
    expect((await signup({ username: "dave", password: "correct horse battery", inviteCode: "mgi_nope" })).status).toBe(403);

    const invite = await json<InviteResponse>(env.request("/invites", { method: "POST" }), 201);
    expect((await as(alice.token, "/invites", { method: "POST" })).status).toBe(403);
    const created = await json<LoginResponse>(signup({ username: "dave", password: "correct horse battery", inviteCode: invite.code }), 201);
    expect(created.me.name).toBe("dave");
    // single use; a failed username claim does not burn a code either
    expect((await signup({ username: "erin", password: "correct horse battery", inviteCode: invite.code })).status).toBe(403);
    const second = await json<InviteResponse>(env.request("/invites", { method: "POST" }), 201);
    expect((await signup({ username: "dave", password: "correct horse battery", inviteCode: second.code })).status).toBe(409);
    await json<LoginResponse>(signup({ username: "erin", password: "correct horse battery", inviteCode: second.code }), 201);

    env.deps.registrationMode = "open";
    await json<LoginResponse>(signup({ username: "frank", password: "correct horse battery" }), 201);
    env.deps.registrationMode = "invite";
  });

  it("lets people delete their own account, which removes their posts for everyone", async () => {
    const leaver = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "leaver" } }), 201);
    const id = await importReady(leaver.token, "https://example.com/leaving", "Goodbye pie");
    await publish(leaver.token, id);
    await json<PostDetail>(as(bob.token, `/posts/${id}/save`, { method: "PUT" }), 200);

    // the username must be typed; the root admin cannot leave
    expect((await as(leaver.token, "/me", { method: "DELETE", json: { confirm: "nope" } })).status).toBe(400);
    expect((await env.request("/me", { method: "DELETE", json: { confirm: "admin" } })).status).toBe(400);
    expect((await as(leaver.token, "/me", { method: "DELETE", json: { confirm: "Leaver" } })).status).toBe(204);

    expect((await as(leaver.token, "/me")).status).toBe(401);
    expect((await as(bob.token, `/posts/${id}`)).status).toBe(404);
    const inbox = await json<NotificationListResponse>(as(bob.token, "/notifications"), 200);
    expect(inbox.notifications.some((n) => n.type === "post_removed" && n.payload.title === "Goodbye pie")).toBe(true);
  });

  it("reports reach the admin, who can hide an item or suspend an account", async () => {
    const id = await importReady(alice.token, "https://example.com/spam", "Totally legit");
    await publish(alice.token, id);
    expect((await as(bob.token, "/reports", { method: "POST", json: { target: "item", targetId: id, reason: "spam" } })).status).toBe(204);
    // a repeated open report is not duplicated
    await as(bob.token, "/reports", { method: "POST", json: { target: "item", targetId: id, reason: "spam" } });
    expect((await as(bob.token, "/moderation/reports")).status).toBe(403);

    const reports = await json<ReportListResponse>(env.request("/moderation/reports"), 200);
    const mine = reports.reports.filter((r) => r.itemId === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ reporter: "bob", reason: "spam", status: "open" });

    await json<unknown>(env.request(`/moderation/reports/${mine[0]?.id}`, { method: "POST", json: { action: "hide" } }), 204);
    expect((await as(bob.token, `/posts/${id}`)).status).toBe(404);
    // still the owner's
    expect((await as(alice.token, `/items/${id}`)).status).toBe(200);

    const victim = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "mallory" } }), 201);
    await json<unknown>(env.request(`/moderation/users/${victim.user.id}/suspend`, { method: "POST" }), 204);
    expect((await as(victim.token, "/me")).status).toBe(401);
    expect((await as(bob.token, "/profiles/mallory")).status).toBe(404);
    await json<unknown>(env.request(`/moderation/users/${victim.user.id}/unsuspend`, { method: "POST" }), 204);
    expect((await as(victim.token, "/me")).status).toBe(200);
  });
});
