import { expect, test, type Page } from "@playwright/test";

function audit(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => { if (new URL(request.url()).origin === new URL(page.url() || "http://local").origin) errors.push(`request: ${request.url()}`); });
  return errors;
}

test("public vertical slice navigates through the rendered feature card", async ({ page }) => {
  const errors = audit(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "KOMA://PLAY" })).toBeVisible();
  const rail = page.getByRole("group", { name: /Featured stories/ });
  const before = await rail.evaluate((element) => element.scrollLeft);
  await page.getByRole("button", { name: "Next features" }).click();
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  const tokon = page.getByRole("link", { name: /PLAYER ONE: DON’T MASH/ });
  await tokon.scrollIntoViewIfNeeded();
  await tokon.click();
  await expect(page).toHaveURL(/\/features\/tokon$/);
  await expect(page.getByRole("heading", { name: /First Ten Hours/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/features\/tokon$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: /First Ten Hours/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
  expect(errors).toEqual([]);
});

test("strip supports keyboard and horizontal scrolling", async ({ page }) => {
  const errors = audit(page);
  await page.goto("/");
  const rail = page.getByRole("group", { name: /Featured stories/ });
  await rail.focus();
  await expect(rail).toBeFocused();
  const outline = await rail.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
  await rail.press("End");
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await rail.evaluate((element) => element.scrollTo({ left: 120, behavior: "instant" }));
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
