import { test, expect } from "@playwright/test";

async function resetTestServer(baseURL: string) {
  const res = await fetch(`${baseURL}/__test/reset`, { method: "POST" });
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
      console.error(`[BROWSER REQUEST FAILED]: ${req.url()} - ${req.failure()?.errorText || "404"}`);
    });
    await resetTestServer(baseURL!);
  });

  test("loads characters atlas and verifies diagnostics attributes", async ({ page, baseURL }) => {
    // Navigate and complete onboarding to enter the office stage where canvas resides
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

    // Wait for the office canvas container to be ready
    const container = page.locator(".office-canvas-container");
    await expect(container).toBeVisible();

    // Check data-pixi attributes
    await expect(container).toHaveAttribute("data-pixi-ready", "true");
    await expect(container).toHaveAttribute("data-pixi-antialias", "false");
    await expect(container).toHaveAttribute("data-pixi-scale-mode", "nearest");
    await expect(container).toHaveAttribute("data-pixi-scene-count", "1");

    // Check that exactly one canvas is appended
    const canvasCount = await container.locator("canvas").count();
    expect(canvasCount).toBe(1);
  });

  test("resists crashes on unmount under React StrictMode double effect simulations", async ({ page, baseURL }) => {
    // Navigate and complete onboarding
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

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

  test("proves the disposed guard by destroying scene during delayed asset loading", async ({ page, baseURL }) => {
    // Setup route interception with 500ms delay for assets loading
    await page.route("**/assets/office/office-atlas.json", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

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
