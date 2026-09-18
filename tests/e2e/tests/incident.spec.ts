import { expect, test, type Page } from "@playwright/test";

async function toTable(page: Page, incident = "Friday, 16:58") {
  await page.goto("/");
  const card = page.getByRole("article").filter({ hasText: incident });
  await card.getByRole("button", { name: "Take the shift" }).click();
  await expect(page.getByRole("heading", { name: "Jev", exact: true })).toBeVisible();
}

async function playEveryPlayableCard(page: Page) {
  for (let index = 0; index < 12; index += 1) {
    const enabled = page.locator("button.card-face:not([disabled])");
    if ((await enabled.count()) === 0) return;
    await enabled.first().click();
    await page.waitForTimeout(60);
  }
}

async function endRound(page: Page) {
  await page.getByRole("button", { name: "End round" }).click();
  await page.waitForTimeout(120);
}

async function greedyRun(page: Page, maxRounds = 16): Promise<"draft" | "finished" | "timeout"> {
  const draft = page.getByRole("dialog", { name: "Choose a card" });
  const finished = page.getByRole("dialog", { name: "Run finished" });
  for (let round = 0; round < maxRounds; round += 1) {
    if (await draft.isVisible().catch(() => false)) return "draft";
    if (await finished.isVisible().catch(() => false)) return "finished";
    await playEveryPlayableCard(page);
    if (await draft.isVisible().catch(() => false)) return "draft";
    if (await finished.isVisible().catch(() => false)) return "finished";
    await endRound(page);
  }
  return "timeout";
}

test("shift selection offers every authored incident", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Out-call the AI/ })).toBeVisible();
  await expect(page.getByText("Friday, 16:58")).toBeVisible();
  await expect(page.getByText("Saturday, 02:14")).toBeVisible();
  await expect(page.getByText("Monday, 09:12")).toBeVisible();
  await expect(page.getByText("friday-1658@1.0.0")).toBeVisible();
  await expect(page.getByRole("button", { name: "Take the shift" })).toHaveCount(3);
});

test("the table shows Jev, a telegraphed threat, and a hand", async ({ page }) => {
  await toTable(page);
  await expect(page.getByLabel(/Incoming threat:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "End round" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /— \d+ focus$/ })).toHaveCount(5);
  await expect(page.getByText(/round 1 \/ 10/)).toBeVisible();
});

test("playing a card spends focus and lands in the incident log", async ({ page }) => {
  await toTable(page);
  const firstCard = page.locator("button.card-face:not([disabled])").first();
  const label = (await firstCard.getAttribute("aria-label")) as string;
  const name = label.split(" — ")[0] as string;
  await firstCard.click();
  await expect(page.getByLabel("Focus 2 of 3").or(page.getByLabel("Focus 1 of 3"))).toBeVisible();
  await expect(page.locator("li.log-line", { hasText: name }).first()).toBeVisible();
});

test("ending the round resolves Jev's play and advances the round", async ({ page }) => {
  await toTable(page);
  const before = await page.getByLabel(/Incoming threat:/).getAttribute("aria-label");
  await endRound(page);
  await expect(page.getByText(/round 2 \/ 10/)).toBeVisible();
  await expect(page.locator("li.log-line").filter({ hasText: /lands|counters|fully countered/ }).first()).toBeVisible();
  expect(before).toBeTruthy();
});

test("a run resumes from the local checkpoint after reload", async ({ page }) => {
  await toTable(page);
  await playEveryPlayableCard(page);
  await expect(page.getByText(/round 1 \/ 10/)).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Jev", exact: true })).toBeVisible();
  await expect(page.getByText(/round 1 \/ 10/)).toBeVisible();
});

test("winning an incident opens the card draft and advances the shift", async ({ page }) => {
  test.setTimeout(120_000);
  await toTable(page);
  const result = await greedyRun(page);
  expect(result).toBe("draft");
  const draft = page.getByRole("dialog", { name: "Choose a card" });
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: "Take it" }).first().click();
  await expect(page.getByRole("heading", { name: "Saturday, 02:14" })).toBeVisible();
  await expect(page.getByText(/Incident 2 of 3/)).toBeVisible();
});

test("doing nothing loses the run and the debrief records it", async ({ page }) => {
  test.setTimeout(120_000);
  await toTable(page);
  for (let round = 0; round < 16; round += 1) {
    if (await page.getByRole("dialog", { name: "Run finished" }).isVisible().catch(() => false)) break;
    await endRound(page);
  }
  const finished = page.getByRole("dialog", { name: "Run finished" });
  await expect(finished).toBeVisible();
  await expect(finished.getByText("The outage wins")).toBeVisible();
  await finished.getByRole("button", { name: "Debrief" }).click();
  await expect(page.getByRole("heading", { name: "The outage won" })).toBeVisible();
  await expect(page.getByText("Run rank")).toBeVisible();
});
