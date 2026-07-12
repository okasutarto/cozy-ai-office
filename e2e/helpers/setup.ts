import { expect, type Page } from "@playwright/test";

/** Complete the live repository/provider/context/role setup used by every E2E flow. */
export async function completeSetup(page: Page, projectPath: string) {
  await page.getByLabel(/Repository Absolute Path/).fill(projectPath);
  await page.getByRole("button", { name: /Verify Repository Path/ }).click();
  await expect(page.getByText("Clean").first()).toBeVisible();

  await page.getByRole("button", { name: /LLM Engines/ }).click();
  await page.getByRole("button", { name: /Probe official CLIs/ }).click();
  await expect(page.getByText(/Probe complete/i)).toBeVisible();

  await page.getByRole("button", { name: /Test Suites & Context/ }).click();
  const packageCandidate = page
    .locator("label.context-row")
    .filter({ hasText: "package.json" })
    .getByRole("checkbox");
  if (await packageCandidate.count()) {
    await packageCandidate.first().check();
  } else {
    await page.locator("label.context-row input[type=checkbox]").first().check();
  }

  const rolesStep = page.getByRole("button", { name: /Agent Roles/ });
  if (await rolesStep.isEnabled()) await rolesStep.click();
  const activate = page.getByRole("button", { name: /Activate Swarm Office/ });
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect(page.locator(".office-canvas-container")).toBeVisible();
}
