import { expect, test } from "@playwright/test";
test("public navigation and authentication dialog remain responsive", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "KOMA://PLAY" })).toBeVisible();
  const next = page.getByRole("button", { name: "Next features" }).first();
  await next.click();
  await page.getByRole("link", { name: /Tōkon/i }).first().click();
  await expect(page).toHaveURL(/\/features\/tokon/);
  await page
    .getByRole("link", { name: /workshop|add to this editorial/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/features\/tokon\/workshop/);
  await page.getByRole("button", { name: "SIGN IN" }).first().click();
  await expect(page.getByRole("dialog", { name: "SIGN IN" })).toBeVisible();
  await page.getByRole("button", { name: "CREATE ACCOUNT" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "CREATE ACCOUNT" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close sign in" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
