import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 667 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    await page.goto(base);
    await page.getByRole("heading", { name: /Out-call the AI/ }).waitFor();
    await page.locator('.scene-canvas[data-scene="ready"]').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/ic-shifts-${viewport.width}.png`, fullPage: true });
    await page.getByRole("article").first().getByRole("button", { name: "Take the shift" }).click();
    await page.waitForURL(/\/play\//);
    await page.getByRole("heading", { name: "Jev", exact: true }).waitFor();
    await page.locator('.scene-canvas[data-scene="ready"]').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/ic-table-${viewport.width}.png`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("Desktop and phone screenshots written to /tmp/ic-*.png");
