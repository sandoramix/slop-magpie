import { describe, expect, it } from "vitest";
import { inviteLink, inviteMessage, inviteWebLink, parseInvite } from "./invite.ts";

const invite = { url: "https://magpie.example.com", username: "Alice Smith", token: "mgp_abc-_123" };

describe("invites", () => {
  it("round-trips through the app link", () => {
    expect(parseInvite(inviteLink(invite))).toEqual(invite);
  });

  it("round-trips through the shareable https link", () => {
    const link = inviteWebLink(invite);
    expect(link.startsWith("https://magpie.example.com/invite#")).toBe(true);
    expect(link).not.toMatch(/\s/);
    expect(parseInvite(link)).toEqual(invite);
  });

  it("builds the https link from a server address with a trailing slash", () => {
    expect(inviteWebLink({ ...invite, url: "http://192.168.1.5:3000/" }).startsWith("http://192.168.1.5:3000/invite#")).toBe(true);
  });

  it("is read back from the full message, link or not", () => {
    const message = inviteMessage(invite);
    expect(message).toContain("https://magpie.example.com/invite#");
    expect(parseInvite(message)).toEqual(invite);
    const withoutLink = message.split("\n").filter((l) => !l.includes("/invite#")).join("\n");
    expect(parseInvite(withoutLink)).toEqual(invite);
  });

  it("still reads messages made by older builds (app link only)", () => {
    const legacy = `You are invited to Magpie.\n\nOpen in the app: ${inviteLink(invite)}\n`;
    expect(parseInvite(legacy)).toEqual(invite);
  });

  it("rejects text without the details", () => {
    expect(parseInvite("hello there")).toBeNull();
    expect(parseInvite("Server: https://x.example")).toBeNull();
  });
});
