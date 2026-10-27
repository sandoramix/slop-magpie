import { describe, expect, it } from "vitest";
import { RegistrationConfig, SetFeedbackBody, SignupBody, UpdateSaveBody } from "./social.ts";

describe("social contract", () => {
  it("defaults feedback reasons to none and rejects unknown ones", () => {
    expect(SetFeedbackBody.parse({ verdict: "worked" })).toEqual({ verdict: "worked", reasons: [] });
    expect(SetFeedbackBody.safeParse({ verdict: "worked", reasons: ["delicious"] }).success).toBe(false);
    expect(SetFeedbackBody.safeParse({ verdict: "great" }).success).toBe(false);
  });

  it("validates signup usernames and passwords", () => {
    const ok = { username: "sunny.day_1", password: "correct horse battery" };
    expect(SignupBody.safeParse(ok).success).toBe(true);
    expect(SignupBody.safeParse({ ...ok, username: "no spaces" }).success).toBe(false);
    expect(SignupBody.safeParse({ ...ok, username: "ab" }).success).toBe(false);
    expect(SignupBody.safeParse({ ...ok, password: "short" }).success).toBe(false);
  });

  it("treats the provider list as optional so older servers still parse", () => {
    expect(RegistrationConfig.parse({ mode: "invite" })).toEqual({ mode: "invite", providers: [] });
    expect(RegistrationConfig.safeParse({ mode: "invite", providers: ["myspace"] }).success).toBe(false);
  });

  it("updates a save partially", () => {
    expect(UpdateSaveBody.parse({})).toEqual({});
    expect(UpdateSaveBody.parse({ note: null })).toEqual({ note: null });
  });
});
