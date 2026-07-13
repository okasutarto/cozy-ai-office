import { test, expect } from "@playwright/test";
import { completeSetup } from "./helpers/setup";

async function resetTestServer(baseURL: string) {
  const res = await fetch(`${baseURL}/__test/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`E2E reset failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getTestStatus(baseURL: string) {
  const res = await fetch(`${baseURL}/__test/status`);
  return res.json();
}

test.describe("Cozy Agent Office Canvas Lifecycle & PixiJS 8 Integrity", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error(`[BROWSER EXCEPTION]: ${err.message}`);
    });
    page.on("requestfailed", (req) => {
      console.error(
        `[BROWSER REQUEST FAILED]: ${req.url()} - ${req.failure()?.errorText || "404"}`,
      );
    });
    await resetTestServer(baseURL!);
  });

  test("loads characters atlas and verifies diagnostics attributes", async ({ page, baseURL }) => {
    // Navigate and complete onboarding to enter the office stage where canvas resides
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    // Wait for the office canvas container to be ready
    const container = page.locator(".office-canvas-container");
    await expect(container).toBeVisible();

    // Check data-pixi attributes
    await expect(container).toHaveAttribute("data-pixi-ready", "true");
    await expect(container).toHaveAttribute("data-pixi-antialias", "false");
    await expect(container).toHaveAttribute("data-pixi-scale-mode", "nearest");
    await expect(container).toHaveAttribute("data-pixi-scene-count", "1");
    await expect(container).toHaveAttribute("data-office-map", "768x288");
    await expect(container).toHaveAttribute("data-office-perimeter", "true");

    // Check that exactly one canvas is appended
    const canvasCount = await container.locator("canvas").count();
    expect(canvasCount).toBe(1);
  });

  test("places and persists furniture from the layout editor", async ({ page, baseURL }) => {
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    await page.getByRole("button", { name: "Layout", exact: true }).click();
    const canvas = page.locator(".office-canvas-container canvas");
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error("office canvas is not visible");
    const paintX = canvasBox.x + canvasBox.width - 24;
    await page.mouse.click(paintX, canvasBox.y + 5);
    await page.mouse.click(paintX, canvasBox.y + canvasBox.height - 5);
    const furnitureTarget = {
      x: Math.max(24, canvasBox.width - 24),
      y: Math.min(130, canvasBox.height - 24),
    };
    await page
      .getByRole("button", { name: "desk mahogany small front", exact: true })
      .dragTo(canvas, {
        targetPosition: furnitureTarget,
      });
    await page.getByRole("button", { name: "Monitor1 F", exact: true }).dragTo(canvas, {
      targetPosition: furnitureTarget,
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const token = sessionStorage.getItem("cozy-session");
          const headers = { authorization: `Bearer ${token}` };
          const bootstrap = await fetch("/api/bootstrap", { headers }).then((response) =>
            response.json(),
          );
          const layout = await fetch(`/api/projects/${bootstrap.projects[0].id}/office-layout`, {
            headers,
          }).then((response) => response.json());
          const floorKeys = Object.keys(layout.floors);
          const desk = layout.furniture.find((item) => item.kind.includes("desk"));
          const monitor = layout.furniture.find((item) => item.kind.includes("monitor"));
          return {
            furniture: layout.furniture.length,
            floors: floorKeys.length,
            monitorOnDesk: Boolean(desk && monitor && desk.x === monitor.x && desk.y === monitor.y),
            paintedOutsideMap: floorKeys.some((key) => {
              const y = Number(key.split(":")[1]);
              return y < 0 || y >= 288;
            }),
          };
        }),
      )
      .toEqual({ furniture: 2, floors: 2, monitorOnDesk: true, paintedOutsideMap: true });

    await page.locator(".office-scene-wrapper").press("Delete");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const token = sessionStorage.getItem("cozy-session");
          const headers = { authorization: `Bearer ${token}` };
          const bootstrap = await fetch("/api/bootstrap", { headers }).then((response) =>
            response.json(),
          );
          return fetch(`/api/projects/${bootstrap.projects[0].id}/office-layout`, { headers })
            .then((response) => response.json())
            .then((layout) => ({
              furniture: layout.furniture.length,
              monitor: layout.furniture.some((item) => item.kind.includes("monitor")),
            }));
        }),
      )
      .toEqual({ furniture: 1, monitor: false });
  });

  test("keeps the renderer full-bleed at supported viewport sizes", async ({ page, baseURL }) => {
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    for (const viewport of [
      { width: 1180, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 1300, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      const container = page.locator(".office-canvas-container");
      const canvas = container.locator("canvas");
      await expect(container).toHaveAttribute("data-pixi-ready", "true");
      await expect
        .poll(async () => {
          const [containerBox, canvasBox] = await Promise.all([
            container.boundingBox(),
            canvas.boundingBox(),
          ]);
          if (!containerBox || !canvasBox) return false;
          return (
            Math.abs(containerBox.width - canvasBox.width) <= 1 &&
            Math.abs(containerBox.height - canvasBox.height) <= 1
          );
        })
        .toBe(true);
    }
  });

  test("resists crashes on unmount under React StrictMode double effect simulations", async ({
    page,
    baseURL,
  }) => {
    // Navigate and complete onboarding
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    // Wait for canvas
    const container = page.locator(".office-canvas-container");
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute("data-pixi-ready", "true");

    // Reload the page twice to simulate navigate away and back
    await page.reload();
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute("data-pixi-ready", "true");
    expect(await container.locator("canvas").count()).toBe(1);

    await page.reload();
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute("data-pixi-ready", "true");
    expect(await container.locator("canvas").count()).toBe(1);
  });

  test("proves the disposed guard by destroying scene during delayed asset loading", async ({
    page,
    baseURL,
  }) => {
    // Setup route interception with 500ms delay for assets loading
    await page.route("**/office-atlas.json", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    // Immediately trigger reload (unmount) before assets delay completes
    await page.reload();

    const container = page.locator(".office-canvas-container");
    await expect(container).toBeVisible();
    // Wait for the final canvas render after reload completes
    await expect(container).toHaveAttribute("data-pixi-ready", "true");
    // Ensure there is exactly 1 canvas and no leaked duplicate canvases from the aborted mount
    expect(await container.locator("canvas").count()).toBe(1);
  });
});
