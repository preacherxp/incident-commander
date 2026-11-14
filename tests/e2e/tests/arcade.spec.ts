import { expect, test } from "@playwright/test";
import { dismissBriefing } from "./_play";

test("briefing, setup, counters, sound, and surprise forecast are visible through real play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("article").filter({ hasText: "Friday, 16:58" }).getByRole("button", { name: "Take the shift" }).click();
  await expect(page).toHaveURL(/\/play\//);
  const briefing = page.getByRole("dialog", { name: "Shift briefing" });
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText("Matching counters");
  await expect(briefing).toContainText("Keep one card");
  await dismissBriefing(page);
  await expect(page.getByText("Surprise risk", { exact: true })).toBeVisible();
  await expect(page.locator(".round-forecast")).toContainText("up to");
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sound on", exact: true })).toHaveAttribute("aria-pressed", "true");
  const counter = page.getByRole("button", { name: /— \d+ focus$/ }).filter({ hasText: /Perfect counter/ });
  if (await counter.count()) {
    await counter.first().click();
    await expect(page.getByRole("status")).toContainText("Perfect counter");
  }
  const runbook = page.getByRole("button", { name: "Open the runbook — 1 focus", exact: true });
  if (await runbook.isEnabled().catch(() => false)) {
    await runbook.click();
    await expect(page.getByText("Next contain +12", { exact: true })).toBeVisible();
    const contain = page.locator("[data-hand='desktop'] button.card-face:not([disabled])").filter({ hasText: /Restart service|Roll back|Scale out|Fail over/ }).first();
    if (await contain.count()) {
      await contain.click();
      await expect(page.getByRole("status")).toContainText("Combo!");
    }
  }
  await page.getByRole("button", { name: "End round", exact: true }).click();
  const impacts = page.getByRole("region", { name: "Last round impacts" });
  await expect(impacts.locator("p").first()).toBeVisible();
  await expect(page.locator(".battle-intel > p")).toHaveText("saved");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sound on", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(impacts.locator("p").first()).toBeVisible();
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sound off", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".hand-overview")).toBeVisible();
});
