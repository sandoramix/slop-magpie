import { describe, expect, it } from "vitest";
import { inviteLink, inviteMessage, parseInvite } from "./invite.ts";

const invite = { url: "https://magpie.example.com", username: "Alice Smith", token: "mgp_abc-_123" };

describe("invites", () => {
  it("round-trips through the app link", () => {
    expect(parseInvite(inviteLink(invite))).toEqual(invite);
  });

  it("is read back from the full message, link or not", () => {
    const message = inviteMessage(invite);
    expect(parseInvite(message)).toEqual(invite);
    const withoutLink = message.split("\n").filter((l) => !l.includes("magpie://")).join("\n");
    expect(parseInvite(withoutLink)).toEqual(invite);
  });

  it("rejects text without the details", () => {
    expect(parseInvite("hello there")).toBeNull();
    expect(parseInvite("Server: https://x.example")).toBeNull();
  });
});
