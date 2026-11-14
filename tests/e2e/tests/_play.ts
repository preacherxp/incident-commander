import { expect, type Page } from "@playwright/test";

export async function dismissBriefing(page: Page) {
  const begin = page.getByRole("button", { name: "Begin shift", exact: true });
  await expect(begin).toBeVisible();
  await begin.click();
  await expect(begin).toBeHidden();
}
