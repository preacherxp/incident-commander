import { expect, test, type Page } from "@playwright/test";
import { dismissBriefing } from "./_play";

async function openArena(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Let’s play →" }).click();
  await expect(page).toHaveURL(/\/play\//);
  await dismissBriefing(page);
  await expect(page.getByRole("heading", { name: "Jev", exact: true })).toBeVisible();
  await expect(page.locator('.scene-canvas[data-scene="ready"]')).toBeVisible();
}

test("the 3D arena renders, orbits, and follows card plays without replacing its canvas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openArena(page);
  const canvas = page.locator(".scene-canvas canvas");
  await canvas.evaluate((element) => { element.dataset.instance = "original"; });
  await page.getByRole("button", { name: "Pause motion" }).click();
  const before = await canvas.screenshot();
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 25, { steps: 8 });
  await page.mouse.up();
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
  await page.getByRole("button", { name: "Reset arena camera" }).click();
  await page.locator('[data-hand="desktop"] button.card-face:not([disabled])').filter({ hasText: /Restart service|Roll back|Scale out|Fail over/ }).first().click();
  await expect(page.locator(".arena")).not.toHaveAttribute("data-recovery", "0");
  await expect(canvas).toHaveAttribute("data-instance", "original");
  await expect(page.getByRole("status")).toBeVisible();
  expect(errors).toEqual([]);
});

test("losing a WebGL context preserves play and the arena can be recreated", async ({ page }) => {
  await openArena(page);
  await page.locator(".scene-canvas canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Context loss extension unavailable in this test browser.");
    extension.loseContext();
  });
  await expect(page.getByText("Command link active")).toBeVisible();
  await page.locator('[data-hand="desktop"] button.card-face:not([disabled])').filter({ hasText: /Restart service|Roll back|Scale out|Fail over/ }).first().click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.getByRole("button", { name: "Retry 3D" }).click();
  await expect(page.locator('.scene-canvas[data-scene="ready"]')).toBeVisible();
  await expect(page.locator(".scene-canvas canvas")).toHaveCount(1);
  await expect(page.locator(".arena")).not.toHaveAttribute("data-recovery", "0");
});

test("the game remains playable when WebGL cannot start", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Let’s play →" }).click();
  await expect(page).toHaveURL(/\/play\//);
  await dismissBriefing(page);
  await expect(page.getByText("Command link active")).toBeVisible();
  await page.locator('[data-hand="desktop"] button.card-face:not([disabled])').first().click();
  await page.getByRole("button", { name: "End round" }).click();
  await expect(page.getByText(/round 2 \/ 10/)).toBeVisible();
});
