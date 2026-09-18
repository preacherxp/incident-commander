import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const base = "http://localhost:5173";
const out = "/tmp/ic-shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

await page.goto(base + "/");
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/1-shifts.png`, fullPage: true });

const card = page.getByRole("article").filter({ hasText: "Friday, 16:58" });
await card.getByRole("button", { name: "Take the shift" }).click();
await page.getByRole("heading", { name: "Jev", exact: true }).waitFor();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/2-table.png` });

const playable = page.locator("button.card-face:not([disabled])").first();
if (await playable.count()) await playable.click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/3-played.png` });

for (let round = 0; round < 16; round += 1) {
  if (await page.getByRole("dialog", { name: "Choose a card" }).isVisible().catch(() => false)) break;
  if (await page.getByRole("dialog", { name: "Run finished" }).isVisible().catch(() => false)) break;
  for (let index = 0; index < 12; index += 1) {
    const enabled = page.locator("button.card-face:not([disabled])");
    if ((await enabled.count()) === 0) break;
    await enabled.first().click();
    await page.waitForTimeout(50);
  }
  if (await page.getByRole("dialog", { name: "Choose a card" }).isVisible().catch(() => false)) break;
  await page.getByRole("button", { name: "End round" }).click();
  await page.waitForTimeout(120);
}

if (await page.getByRole("dialog", { name: "Choose a card" }).isVisible().catch(() => false)) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/4-draft.png` });
  await page.getByRole("dialog", { name: "Choose a card" }).getByRole("button", { name: "Take it" }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/5-saturday.png` });
}

await browser.close();
console.log("shots done");
