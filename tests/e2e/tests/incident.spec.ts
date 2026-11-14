import { expect, test, type Page } from "@playwright/test";
import { dismissBriefing } from "./_play";

async function toTable(page: Page, incident = "Friday, 16:58") {
  await page.goto("/");
  const card = page.getByRole("article").filter({ hasText: incident });
  await card.getByRole("button", { name: "Take the shift" }).click();
  await dismissBriefing(page);
  await expect(page.getByRole("heading", { name: "Jev", exact: true })).toBeVisible();
}

async function playEveryPlayableCard(page: Page) {
  for (let index = 0; index < 12; index += 1) {
    const enabled = page.locator('[data-hand="desktop"] button.card-face:not([disabled])');
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
  const begin = page.getByRole("button", { name: "Begin shift", exact: true });
  for (let round = 0; round < maxRounds; round += 1) {
    if (await draft.isVisible().catch(() => false)) return "draft";
    if (await finished.isVisible().catch(() => false)) return "finished";
    if (await begin.isVisible().catch(() => false)) await begin.click();
    await playEveryPlayableCard(page);
    if (await draft.isVisible().catch(() => false)) return "draft";
    if (await finished.isVisible().catch(() => false)) return "finished";
    await endRound(page);
  }
  return "timeout";
}

test("shift selection offers the Friday shift", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Out-call the AI/ })).toBeVisible();
  await expect(page.getByText("Friday, 16:58")).toBeVisible();
  await expect(page.getByText("Saturday, 02:14")).toHaveCount(0);
  await expect(page.getByText("Monday, 09:12")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Let’s play →" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take the shift" })).toHaveCount(1);
});

test("a leftover card can be held into the next round", async ({ page }) => {
  await toTable(page);
  const keep = page.locator("[data-hand='desktop'] .hold-toggle").first();
  const name = ((await page.locator("[data-hand='desktop'] button.card-face").first().getAttribute("aria-label")) ?? "").split(" — ")[0];
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await endRound(page);
  await expect(page.getByText(/round 2 \/ 9/)).toBeVisible();
  await page.locator("summary", { hasText: "Incident log" }).click();
  await expect(page.locator("li.log-line", { hasText: `Held ${name}` }).first()).toBeVisible();
});

test("the table shows Jev, a telegraphed threat, and a hand", async ({ page }) => {
  await toTable(page);
  await expect(page.getByLabel(/Incoming threat:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "End round" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /— \d+ focus$/ })).toHaveCount(5);
  await expect(page.getByText(/round 1 \/ 9/)).toBeVisible();
});

test("playing a card spends focus and lands in the incident log", async ({ page }) => {
  await toTable(page);
  const firstCard = page.locator('[data-hand="desktop"] button.card-face:not([disabled])').first();
  const label = (await firstCard.getAttribute("aria-label")) as string;
  const name = label.split(" — ")[0] as string;
  await firstCard.click();
  await expect(page.getByLabel("Focus 2 of 3").or(page.getByLabel("Focus 1 of 3")).first()).toBeVisible();
  await expect(page.getByRole("status")).toContainText(name);
  await page.locator("summary", { hasText: "Incident log" }).click();
  await expect(page.locator("li.log-line", { hasText: name }).first()).toBeVisible();
});

test("ending the round resolves Jev's play and advances the round", async ({ page }) => {
  await toTable(page);
  const before = await page.getByLabel(/Incoming threat:/).getAttribute("aria-label");
  await endRound(page);
  await expect(page.getByText(/round 2 \/ 9/)).toBeVisible();
  await page.locator("summary", { hasText: "Incident log" }).click();
  await expect(page.locator("li.log-line").filter({ hasText: /lands|counters|fully countered/ }).first()).toBeVisible();
  expect(before).toBeTruthy();
});

test("a run resumes from the local checkpoint after reload", async ({ page }) => {
  await toTable(page);
  await playEveryPlayableCard(page);
  await expect(page.getByText(/round 1 \/ 9/)).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Jev", exact: true })).toBeVisible();
  await expect(page.getByText(/round 1 \/ 9/)).toBeVisible();
});

test("winning the shift finishes the run", async ({ page }) => {
  test.setTimeout(120_000);
  await toTable(page);
  const result = await greedyRun(page);
  expect(result).toBe("finished");
  const finished = page.getByRole("dialog", { name: "Run finished" });
  await expect(finished).toBeVisible();
  await expect(finished.getByText("You held the line")).toBeVisible();
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

test("a legacy save on this device cannot break the shift screen", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const openRequest = indexedDB.open("incident-commander", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("runs", "readwrite");
      tx.objectStore("runs").put({
        runId: "11111111-2222-4333-8444-555555555555",
        guestId: null,
        scenarioId: "friday-1658",
        scenarioVersion: "0.5.0",
        engineVersion: 1,
        seed: 7,
        checkpoint: {
          tick: 100,
          throughSeq: 3,
          state: { seed: 7, tick: 100, throughSeq: 3, terminal: null, cumulative: { harm: 12 } },
        },
        inputs: [],
        lastAckedRevision: 0,
        lastSyncedSeq: 0,
        inFlight: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: /Out-call the AI/ })).toBeVisible();
  await expect(page.getByText("Incompatible saves", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
  await expect(page.getByText("No runs on this device yet.")).toBeVisible();
  const leftover = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const openRequest = indexedDB.open("incident-commander", 1);
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          const tx = db.transaction("runs", "readonly");
          const request = tx.objectStore("runs").getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result.length);
          };
          request.onerror = () => reject(request.error);
        };
        openRequest.onerror = () => reject(openRequest.error);
      }),
  );
  expect(leftover).toBe(0);
});
