import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/server/config.js";

describe("server config", () => {
  it("uses an explicit session token from the environment", () => {
    expect(
      loadConfig({
        COZY_SESSION_TOKEN: "local-dev-session-token-000000000000",
      }).sessionToken,
    ).toBe("local-dev-session-token-000000000000");
  });

  it("rejects short explicit session tokens", () => {
    expect(() => loadConfig({ COZY_SESSION_TOKEN: "short" })).toThrow("Invalid COZY_SESSION_TOKEN");
  });
});
