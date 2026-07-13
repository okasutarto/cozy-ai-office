import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { createTestDependencies, type TestDependencies } from "../helpers/test-dependencies.js";

describe("office layout routes", () => {
  let dependencies: TestDependencies;

  beforeEach(async () => {
    dependencies = await createTestDependencies();
    dependencies.db
      .prepare(
        "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("project-1", "Test", "C:/test", new Date().toISOString(), new Date().toISOString());
  });

  afterEach(async () => dependencies.close());

  it("persists a validated project layout", async () => {
    const app = await buildApp(dependencies);
    const headers = {
      authorization: `Bearer ${dependencies.config.sessionToken}`,
      origin: dependencies.config.publicOrigin,
    };
    const layout = {
      floors: { "16:-32": "floor2", "16:320": "floor2" },
      furniture: [{ id: "desk-1", kind: "desk", x: -16, y: 304 }],
    };

    expect(
      (
        await app.inject({ method: "GET", url: "/api/projects/project-1/office-layout", headers })
      ).json(),
    ).toEqual({ floors: {}, furniture: [] });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/projects/project-1/office-layout",
          headers,
          payload: layout,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: "GET", url: "/api/projects/project-1/office-layout", headers })
      ).json(),
    ).toEqual(layout);
    await app.close();
  });
});
