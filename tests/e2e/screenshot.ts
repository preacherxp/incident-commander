import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5173";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });

await page.goto(base + "/");
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/ic-shift.png", fullPage: true });

await page.getByRole("button", { name: "Start incident" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/ic-briefing.png", fullPage: true });

await page.getByRole("button", { name: "Start incident" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/ic-active.png", fullPage: true });

await page.getByRole("textbox", { name: "Message Jev" }).fill("why is checkout failing?");
await page.getByRole("button", { name: "Ask" }).click();
await page.getByText("Jev sees").waitFor({ timeout: 30_000 });
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/ic-jev.png", fullPage: true });

await browser.close();
console.log("screenshots written");
