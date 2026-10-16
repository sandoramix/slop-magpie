import { describe, expect, it } from "vitest";
import { QUICK_SAVE_MARKER, shareModeFor } from "./share.ts";

describe("shareModeFor", () => {
  it("saves for later when the quick-save share entry was used, whatever the setting says", () => {
    expect(shareModeFor(QUICK_SAVE_MARKER, "organize")).toBe("later");
    expect(shareModeFor(QUICK_SAVE_MARKER, "ask")).toBe("later");
  });

  it("follows the setting for the normal share entry", () => {
    expect(shareModeFor(undefined, "organize")).toBe("organize");
    expect(shareModeFor("Some page title", "ask")).toBe("ask");
    expect(shareModeFor(undefined, "later")).toBe("later");
  });
});
