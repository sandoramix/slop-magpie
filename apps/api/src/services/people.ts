// Profiles, follows and blocks. Names are looked up case-insensitively; a suspended account or one
// that blocked the viewer does not exist as far as the viewer can tell.
import { blocks, type Database, follows, users } from "@magpie/db";
import type { BlockedResponse, PeopleResponse, PersonRef, Profile, UpdateProfileBody } from "@magpie/shared/api";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { notifyMany } from "./notifications.ts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

const notFound = () => new ApiError(404, "not_found", "Person not found");

const profileColumns = (viewerId: string) => ({
  id: users.id,
  name: users.name,
  displayName: users.displayName,
  bio: users.bio,
  joinedAt: users.createdAt,
  postCount: sql<number>`(select count(*)::int from items i where i.user_id = ${users.id} and i.visibility = 'public' and i.fetch_status = 'ready' and i.hidden_at is null)`,
  followerCount: sql<number>`(select count(*)::int from follows f where f.followee_id = ${users.id})`,
  followingCount: sql<number>`(select count(*)::int from follows f where f.follower_id = ${users.id})`,
  followedByMe: sql<boolean>`exists (select 1 from follows f where f.followee_id = ${users.id} and f.follower_id = ${viewerId}::uuid)`,
  blockedByMe: sql<boolean>`exists (select 1 from blocks b where b.blocked_id = ${users.id} and b.blocker_id = ${viewerId}::uuid)`,
});

type ProfileRow = Awaited<ReturnType<typeof selectProfiles>>[number];

const selectProfiles = (db: Db, viewerId: string) => db.select(profileColumns(viewerId)).from(users);

const toProfile = (viewerId: string, row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name,
  displayName: row.displayName,
  bio: row.bio,
  joinedAt: row.joinedAt.toISOString(),
  postCount: row.postCount,
  followerCount: row.followerCount,
  followingCount: row.followingCount,
  followedByMe: row.followedByMe,
  blockedByMe: row.blockedByMe,
  isMe: row.id === viewerId,
});

/** Not suspended and not blocking the viewer. */
const reachable = (viewerId: string) =>
  and(
    isNull(users.suspendedAt),
    sql`not exists (select 1 from blocks b where b.blocker_id = ${users.id} and b.blocked_id = ${viewerId}::uuid)`,
  );

export async function resolveName(db: Db, viewerId: string, name: string): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.name}) = ${name.toLowerCase()}`, reachable(viewerId)));
  if (!row) throw notFound();
  return row.id;
}

export async function getProfile(deps: ServiceDeps, name: string): Promise<Profile> {
  const [row] = await selectProfiles(deps.db, deps.userId).where(and(sql`lower(${users.name}) = ${name.toLowerCase()}`, reachable(deps.userId)));
  if (!row) throw notFound();
  return toProfile(deps.userId, row);
}

export async function searchPeople(deps: ServiceDeps, q: string): Promise<PeopleResponse> {
  const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await selectProfiles(deps.db, deps.userId)
    .where(and(reachable(deps.userId), or(sql`${users.name} ilike ${term}`, sql`${users.displayName} ilike ${term}`)))
    .orderBy(users.name)
    .limit(30);
  return { people: rows.map((r) => toProfile(deps.userId, r)) };
}

export async function updateBio(deps: ServiceDeps, body: UpdateProfileBody): Promise<void> {
  await deps.db.update(users).set({ bio: body.bio === "" ? null : body.bio }).where(eq(users.id, deps.userId));
}

export async function setFollow(deps: ServiceDeps, name: string, follow: boolean): Promise<Profile> {
  const targetId = await resolveName(deps.db, deps.userId, name);
  if (targetId === deps.userId) throw new ApiError(400, "bad_request", "You cannot follow yourself");
  if (follow) {
    await deps.db.transaction(async (tx) => {
      const rows = await tx.insert(follows).values({ followerId: deps.userId, followeeId: targetId }).onConflictDoNothing().returning({ f: follows.followerId });
      if (rows.length === 0) return;
      const [me] = await tx.select({ name: users.name }).from(users).where(eq(users.id, deps.userId));
      await notifyMany(tx, [{ userId: targetId, type: "new_follower", payload: { person: me?.name } }]);
    });
  } else {
    await deps.db.delete(follows).where(and(eq(follows.followerId, deps.userId), eq(follows.followeeId, targetId)));
  }
  return getProfile(deps, name);
}

export async function listBlocked(deps: ServiceDeps): Promise<BlockedResponse> {
  const rows = await deps.db
    .select({ id: users.id, name: users.name, displayName: users.displayName })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(eq(blocks.blockerId, deps.userId))
    .orderBy(users.name);
  return { people: rows satisfies PersonRef[] };
}

/** Blocking also ends any follow in either direction. */
export async function setBlock(deps: ServiceDeps, name: string, block: boolean): Promise<void> {
  const [target] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.name}) = ${name.toLowerCase()}`);
  if (!target) throw notFound();
  if (target.id === deps.userId) throw new ApiError(400, "bad_request", "You cannot block yourself");
  if (!block) {
    await deps.db.delete(blocks).where(and(eq(blocks.blockerId, deps.userId), eq(blocks.blockedId, target.id)));
    return;
  }
  await deps.db.transaction(async (tx) => {
    await tx.insert(blocks).values({ blockerId: deps.userId, blockedId: target.id }).onConflictDoNothing();
    await tx
      .delete(follows)
      .where(
        or(
          and(eq(follows.followerId, deps.userId), eq(follows.followeeId, target.id)),
          and(eq(follows.followerId, target.id), eq(follows.followeeId, deps.userId)),
        ),
      );
  });
}

/** Who follows this person, or whom they follow, newest follow first. Blocked and suspended accounts are left out. */
export async function listFollows(deps: ServiceDeps, name: string, kind: "followers" | "following"): Promise<PeopleResponse> {
  const targetId = await resolveName(deps.db, deps.userId, name);
  const rows =
    kind === "followers"
      ? await selectProfiles(deps.db, deps.userId)
          .innerJoin(follows, and(eq(follows.followerId, users.id), eq(follows.followeeId, targetId)))
          .where(reachable(deps.userId))
          .orderBy(desc(follows.createdAt))
          .limit(200)
      : await selectProfiles(deps.db, deps.userId)
          .innerJoin(follows, and(eq(follows.followeeId, users.id), eq(follows.followerId, targetId)))
          .where(reachable(deps.userId))
          .orderBy(desc(follows.createdAt))
          .limit(200);
  return { people: rows.map((r) => toProfile(deps.userId, r)) };
}