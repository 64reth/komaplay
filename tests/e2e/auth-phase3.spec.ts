import { expect, test } from "@playwright/test";

test("masthead opens one shared authentication dialog and switches modes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "SIGN IN" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SIGN IN" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
  await expect(
    page.getByRole("heading", { name: "CREATE ACCOUNT" }),
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeVisible();
  await page.getByRole("button", { name: "Close account dialog" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("invalid email is stopped locally without an authentication request", async ({
  page,
}) => {
  await page.goto("/features/tokon");
  await page.getByRole("button", { name: "SIGN IN" }).click();
  const email = page.getByLabel("Email");
  await email.fill("not-an-email");
  expect(
    await email.evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(false);
  await page.getByRole("button", { name: "SEND SIGN-IN LINK" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/features\/tokon$/);
});

test("an invalid callback returns safely without a generic error page", async ({
  page,
}) => {
  const response = await page.goto(
    "/auth/callback?code=invalid&returnTo=%2Farchive",
  );
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/archive\?auth_error=expired$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("invalid or expired", { exact: false }),
  ).toBeVisible();
});
