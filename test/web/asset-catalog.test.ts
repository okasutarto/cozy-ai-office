import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalog } from "../../src/web/office/asset-catalog.js";

afterEach(() => vi.unstubAllGlobals());

describe("office asset catalog", () => {
  it("uses bundled editing assets when optional local assets are absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(loadCatalog()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "fallback-floor", floor: true }),
        expect.objectContaining({ id: "fallback-desk", floor: false }),
        expect.objectContaining({ id: "fallback-monitor", floor: false }),
      ]),
    );
  });

  it("rejects a malformed catalog response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "not a catalog" })));

    await expect(loadCatalog()).rejects.toThrow("Invalid asset catalog");
  });
});
