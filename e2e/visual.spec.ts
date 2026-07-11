import { test, expect } from "@playwright/test";

async function resetTestServer(baseURL: string) {
  const res = await fetch(`${baseURL}/__test/reset`, { method: "POST" });
  return res.json();
}

async function getTestStatus(baseURL: string) {
  const res = await fetch(`${baseURL}/__test/status`);
  return res.json();
}

async function releaseBarrier(baseURL: string, barrier: string) {
  const res = await fetch(`${baseURL}/__test/release/${barrier}`, { method: "POST" });
  return res.json();
}

async function setScenario(baseURL: string, scenario: string) {
  const res = await fetch(`${baseURL}/__test/scenario/${scenario}`, { method: "POST" });
  return res.json();
}

test.describe("Cozy Agent Office Visual Snapshot Generator", () => {
  // Only capture snapshots on Linux as requested to avoid cross-platform font/renderer mismatches
  test.skip(process.platform !== "linux", "Visual screenshot baseline tests run on Linux only");

  test("captures all workflow visual states in sequence", async ({ page, baseURL }) => {
    // 1. Initial State: Onboard to main office dashboard
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

    const wrapper = page.locator(".office-scene-wrapper");
    await expect(wrapper).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    // Take office-idle screenshot
    await page.screenshot({
      path: "test-results/office-idle.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });

    // 2. Planning State
    await page.fill('textarea[placeholder*="Type a message..."]', "Implement greeting, farewell, and punctuation constants");
    await page.click('button:has-text("Send")');

    // Wait for and select the message checkbox to enable "Send to Manager"
    const checkbox1 = page.locator('input[type="checkbox"][aria-label*="Select message"]');
    await expect(checkbox1).toBeVisible();
    await checkbox1.check();

    await page.click('button:has-text("Send to Manager")');
    await page.click('button:has-text("Draft Task")');
    await page.click('button:has-text("Start Execution")');
    await page.click('dialog button:has-text("Start Execution")');

    await expect(page.locator("text=PLANNED")).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-planning.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });

    // 3. Parallel Workers State
    await releaseBarrier(baseURL!, "planning");
    await releaseBarrier(baseURL!, "reviewing");
    await expect(page.locator("text=WORKING")).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-parallel-workers.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });

    // 4. QA State
    await releaseBarrier(baseURL!, "worker-1");
    await releaseBarrier(baseURL!, "worker-2");
    await releaseBarrier(baseURL!, "worker-3");
    await expect(page.locator("text=TESTING")).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-qa.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });

    // 5. Advisor Review State
    await releaseBarrier(baseURL!, "testing");
    await expect(page.locator("text=ADVISOR_DELIVERY")).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-advisor-review.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });

    // 6. Ready State
    await releaseBarrier(baseURL!, "reviewing");
    await expect(page.locator("text=Ready to Apply")).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-ready.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });

    // 7. Applied (Done) State
    await page.click('button:has-text("Apply")');
    await page.click('dialog button:has-text("Apply")');
    await expect(page.locator("text=APPLIED")).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-done.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });
  });

  test("captures worker_error state", async ({ page, baseURL }) => {
    await setScenario(baseURL!, "worker_error");

    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

    await page.fill('textarea[placeholder*="Type a message..."]', "Implement greeting, farewell, and punctuation constants");
    await page.click('button:has-text("Send")');

    // Wait for and select the message checkbox to enable "Send to Manager"
    const checkbox2 = page.locator('input[type="checkbox"][aria-label*="Select message"]');
    await expect(checkbox2).toBeVisible();
    await checkbox2.check();

    await page.click('button:has-text("Send to Manager")');
    await page.click('button:has-text("Draft Task")');
    await page.click('button:has-text("Start Execution")');
    await page.click('dialog button:has-text("Start Execution")');

    // Run planning
    await releaseBarrier(baseURL!, "planning");
    await releaseBarrier(baseURL!, "reviewing");

    // Release worker-1 & worker-2 & worker-3. worker-2 (add-farewell) fails once.
    await releaseBarrier(baseURL!, "worker-1");
    await releaseBarrier(baseURL!, "worker-2");
    await releaseBarrier(baseURL!, "worker-3");

    // It transitions to worker fallback/error retry prompt or block
    await expect(page.locator("text=failed").first()).toBeVisible();
    const wrapper = page.locator(".office-scene-wrapper");
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-error.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });
  });

  test("captures advisor_blocked state", async ({ page, baseURL }) => {
    await setScenario(baseURL!, "advisor_blocked");

    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

    await page.fill('textarea[placeholder*="Type a message..."]', "Implement greeting, farewell, and punctuation constants");
    await page.click('button:has-text("Send")');

    // Wait for and select the message checkbox to enable "Send to Manager"
    const checkbox3 = page.locator('input[type="checkbox"][aria-label*="Select message"]');
    await expect(checkbox3).toBeVisible();
    await checkbox3.check();

    await page.click('button:has-text("Send to Manager")');
    await page.click('button:has-text("Draft Task")');
    await page.click('button:has-text("Start Execution")');
    await page.click('dialog button:has-text("Start Execution")');

    // Planning and preflight review (rejected)
    await releaseBarrier(baseURL!, "planning");
    await releaseBarrier(baseURL!, "reviewing");

    await expect(page.locator("text=BLOCKED")).toBeVisible();
    const wrapper = page.locator(".office-scene-wrapper");
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");

    await page.screenshot({
      path: "test-results/office-blocked.png",
      mask: [page.locator(".timestamp"), page.locator(".duration"), page.locator(".commit-sha")],
    });
  });

  test("runs without snapshots in reduced motion mode", async ({ page, baseURL }) => {
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await page.fill('input[type="text"]', projectPath);
    await page.click('button:has-text("Verify Repository Path")');
    await expect(page.locator("text=Clean root")).toBeVisible();
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Complete Onboarding")');

    // Toggle reduce-motion locally or verify state transitions instantly
    const wrapper = page.locator(".office-scene-wrapper");
    await expect(wrapper).toBeVisible();
    await expect(wrapper).toHaveAttribute("data-motion-state", "settled");
  });
});
