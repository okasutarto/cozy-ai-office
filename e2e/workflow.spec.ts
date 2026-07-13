import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { completeSetup } from "./helpers/setup";
import { resetTestServer } from "./helpers/reset";

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

test.describe("Cozy Agent Office Workflow E2E", () => {
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
    page.on("response", (res) => {
      if (res.status() >= 400) {
        console.error(`[BROWSER RESPONSE ERROR]: ${res.url()} - Status ${res.status()}`);
      }
    });
    await resetTestServer(baseURL!);
  });

  test("runs the full three-worker parallel execution to fast-forward apply", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    // 1. Open with session fragment
    const launchUrl = `/#session=e2e-session-token-0000000000000000000000000001`;
    await page.goto(launchUrl);

    // 2. Fragment disappears
    await expect(page).toHaveURL(/^(?!.*#session=)/);

    // 3. Paste project repository path
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    // 7. Onboarding completes -> main dashboard appears. Enter discussion.
    await expect(page.locator("text=Cozy Agent Office")).toBeVisible();

    await page.fill(
      'textarea[aria-label="Composer input"]',
      "Implement greeting, farewell, and punctuation constants",
    );
    await page.click('button:has-text("Send")');

    // Wait for and select the message checkbox to enable "Send to Manager"
    const checkbox = page.locator('input[type="checkbox"][aria-label*="Select message"]');
    await expect(checkbox).toBeVisible();
    await checkbox.check();

    await page.click('button:has-text("Send to Manager")');

    // 8. Review draft in ConversationDock
    await page.click('button:has-text("Draft Task")');
    await expect(page.locator("text=Draft Task Editor")).toBeVisible();

    // Trigger Start Execution
    await page.click('button:has-text("Review execution")');

    // Confirm dialog with concurrency selector
    await expect(page.locator("text=Start Run Execution")).toBeVisible();
    // Select concurrency=3
    await page.selectOption("#confirm-concurrency", "3");
    await page.click('dialog button:has-text("Start Execution")');
    await expect(page.getByText(/Plan \(/).first()).toBeVisible();

    // 9. Now running. Release planning barrier first
    await releaseBarrier(baseURL!, "planning");

    // The manager generates the plan, then passes to advisor reviews
    await releaseBarrier(baseURL!, "reviewing");

    // Now workers are dispatched in parallel. Since concurrency=3, all three workers (worker-1, worker-2, worker-3) run.
    // Release their barriers to write code.
    await releaseBarrier(baseURL!, "worker-1");
    await releaseBarrier(baseURL!, "worker-2");
    await releaseBarrier(baseURL!, "worker-3");

    // Next is QA tests
    await releaseBarrier(baseURL!, "testing");

    // Finally, Advisor delivery review
    await releaseBarrier(baseURL!, "reviewing-delivery");

    // Reach ready_to_apply through the live subscription, then reload to prove
    // the completed projection rehydrates deterministically without a transition race.
    const readyToApply = page.getByText(/ready to apply/i).first();
    await expect(readyToApply).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await expect(page.locator("text=Cozy Agent Office")).toBeVisible();
    await expect(readyToApply).toBeVisible();

    // Verify none of the three files exist on root branch yet
    expect(fs.existsSync(path.join(projectPath, "src/greeting.ts"))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, "src/farewell.ts"))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, "src/punctuation.ts"))).toBe(false);

    // 12. Open diff evidence
    await page.getByRole("button", { name: "Evidence" }).click();
    const evidenceDialog = page.getByRole("dialog");
    await expect(evidenceDialog.getByText("Run Evidence & Diffs")).toBeVisible();
    await expect(evidenceDialog).toContainText("greeting.ts");
    await evidenceDialog.getByRole("button", { name: "Close" }).click();

    // 13. Apply run integration
    await page.getByRole("button", { name: "Apply Changes" }).click();
    await expect(page.locator("text=Apply Integration Branch")).toBeVisible();
    await page.click('dialog button:has-text("Apply")');

    // 14. Wait for applied state and verify files are integrated
    await expect(page.locator("text=APPLIED")).toBeVisible();

    expect(fs.readFileSync(path.join(projectPath, "src/greeting.ts"), "utf8")).toContain(
      'export const greeting = "hello";',
    );
    expect(fs.readFileSync(path.join(projectPath, "src/farewell.ts"), "utf8")).toContain(
      'export const farewell = "goodbye";',
    );
    expect(fs.readFileSync(path.join(projectPath, "src/punctuation.ts"), "utf8")).toContain(
      'export const punctuation = "!";',
    );

    // 15. Reload and check history remains
    await page.reload();
    await expect(page.locator("text=APPLIED")).toBeVisible();
  });

  test("runs sequential concurrency=1, pauses, resumes, and cancels run", async ({
    page,
    baseURL,
  }) => {
    // 1. Onboard project
    await page.goto(`/#session=e2e-session-token-0000000000000000000000000001`);
    const { projectPath } = await getTestStatus(baseURL!);
    await completeSetup(page, projectPath);

    await page.fill(
      'textarea[aria-label="Composer input"]',
      "Implement greeting, farewell, and punctuation constants",
    );
    await page.click('button:has-text("Send")');

    // Wait for and select the message checkbox to enable "Send to Manager"
    const checkbox = page.locator('input[type="checkbox"][aria-label*="Select message"]');
    await expect(checkbox).toBeVisible();
    await checkbox.check();

    await page.click('button:has-text("Send to Manager")');

    // Start Execution with Concurrency=1
    await page.click('button:has-text("Draft Task")');
    await page.click('button:has-text("Review execution")');
    await page.selectOption("#confirm-concurrency", "1");
    await page.click('dialog button:has-text("Start Execution")');
    await expect(page.getByText(/Plan \(/).first()).toBeVisible();

    // Release planning & advisor preflight
    await releaseBarrier(baseURL!, "planning");
    await releaseBarrier(baseURL!, "reviewing");

    // Hold worker-1 barrier, but click Pause
    await page.click('button:has-text("Pause")');
    // Confirm dispatchPaused is visible/applied
    await expect(page.locator("text=Resume")).toBeVisible();

    // Release worker-1. Since concurrency=1 and paused, worker-2 won't start dispatching
    await releaseBarrier(baseURL!, "worker-1");

    // Confirm no next task is running (only worker-1 gets completed)
    // Resume run
    await page.click('button:has-text("Resume")');
    await expect(page.locator("text=Pause")).toBeVisible();

    // Now running next task. Cancel execution instead of completing.
    await page.click('button:has-text("Cancel")');
    await expect(page.locator("text=Cancel Run Execution")).toBeVisible();
    await page.click('dialog button:has-text("Cancel Run")');

    // The worker completion event can race the first cancel request. Once the
    // realtime snapshot settles, retry against the fresh expectedUpdatedAt.
    const cancelledState = page.locator("text=CANCELLED");
    const cancelDialog = page.getByRole("dialog");
    if (!(await cancelledState.isVisible().catch(() => false))) {
      const dismiss = cancelDialog.getByRole("button", { name: "Cancel", exact: true });
      if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click({ timeout: 1_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(500);
      const retryCancel = page.getByRole("button", { name: "Cancel", exact: true });
      if (await retryCancel.isVisible().catch(() => false)) {
        await retryCancel.click();
        await page.getByRole("dialog").getByRole("button", { name: "Cancel Run" }).click();
      }
    }

    // Verify terminal cancel state and that no files were integrated into main repo
    await expect(cancelledState).toBeVisible();
    expect(fs.existsSync(path.join(projectPath, "src/greeting.ts"))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, "src/farewell.ts"))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, "src/punctuation.ts"))).toBe(false);
  });
});
