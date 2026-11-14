import { expect, test } from "@playwright/test";
import { dismissBriefing } from "./_play";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test("a whole round is playable one-handed on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Out-call the AI/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take the shift" })).toHaveCount(1);

  await page
    .getByRole("article")
    .filter({ hasText: "Friday, 16:58" })
    .getByRole("button", { name: "Take the shift" })
    .tap();
  await dismissBriefing(page);
  await expect(page.getByRole("heading", { name: "Jev", exact: true })).toBeVisible();
  await expect(page.getByLabel(/Incoming threat:/)).toBeVisible();
  await expect(page.getByText(/round 1 \/ 9/)).toBeVisible();

  const cards = page.locator('[data-hand="mobile"] .hand-mini');
  await expect(cards).toHaveCount(5);
  const card = cards.first();
  const name = ((await card.getAttribute("aria-label")) as string).replace("Inspect ", "");
  const last = await cards.last().boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(390);
  await card.tap();
  await page.getByRole("button", { name: new RegExp(`Play ${name}`) }).tap();
  await expect(page.getByRole("status")).toContainText(name);
  await expect(page.locator("[data-mobile-bar]").getByLabel(/Focus \d of \d/)).toBeVisible();

  await page.getByRole("button", { name: /Keep .+ for next round/ }).tap();
  await expect(page.getByRole("button", { name: /Stop holding/ })).toBeVisible();
  await page.getByRole("button", { name: "End round" }).tap();
  await expect(page.getByText(/round 2 \/ 9/).first()).toBeVisible();

  await page.locator("summary", { hasText: "Incident log" }).tap();
  await expect(page.locator("li.log-line:visible", { hasText: name }).first()).toBeVisible();

  await page.locator("summary", { hasText: "Incident map" }).tap();
  await expect(page.getByRole("img", { name: /Live incident map/ })).toBeVisible();
});
