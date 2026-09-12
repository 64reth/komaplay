import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

type Audit = { applicationErrors: string[]; classifiedExternal: string[] };

function classifiedExternalWarning(message: ConsoleMessage) {
  const location = message.location().url;
  if (!location) return false;
  try {
    const host = new URL(location).hostname;
    return (
      ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(
        host,
      ) && message.text().includes("compute-pressure")
    );
  } catch {
    return false;
  }
}

function audit(page: Page): Audit {
  const result: Audit = { applicationErrors: [], classifiedExternal: [] };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (classifiedExternalWarning(message))
      result.classifiedExternal.push(message.text());
    else result.applicationErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) =>
    result.applicationErrors.push(`page: ${error.message}`),
  );
  page.on("requestfailed", (request) => {
    try {
      const current = new URL(page.url());
      if (new URL(request.url()).origin === current.origin) {
        result.applicationErrors.push(`request: ${request.url()}`);
      }
    } catch (error) {
      result.applicationErrors.push(`audit: ${String(error)}`);
    }
  });
  return result;
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

function expectClean(auditResult: Audit) {
  expect(auditResult.applicationErrors).toEqual([]);
  expect(
    auditResult.classifiedExternal.every((warning) =>
      warning.includes("compute-pressure"),
    ),
  ).toBe(true);
}

test("all public destinations are reachable through rendered controls", async ({
  page,
}) => {
  const errors = audit(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/archive$/);
  const archivedIssues = page.locator(".archive-issue");
  if (await archivedIssues.count()) {
    const issueHref = await archivedIssues.first().getAttribute("href");
    await archivedIssues.first().click();
    await expect(page).toHaveURL(new RegExp(`${issueHref}$`));
    const archivedFeature = page
      .locator('.feature-rail a[href^="/features/"]')
      .first();
    const featureHref = await archivedFeature.getAttribute("href");
    await archivedFeature.click();
    await expect(page).toHaveURL(new RegExp(`${featureHref}$`));
    await page.locator(`.op-footer a[href="${issueHref}"]`).click();
    await page.getByRole("link", { name: "Archive", exact: true }).click();
  } else {
    await expect(
      page.getByText("No archived issues match these filters."),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Current issue", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState("networkidle");
  await page.locator('.feature-rail a[href="/features/tokon"]').click();
  await expect(page).toHaveURL(/\/features\/tokon$/);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /First Ten Hours/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Issue Zero/, exact: false })
    .first()
    .click();
  await expect(page).toHaveURL(/\/issues\/issue-zero-september-2026$/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "KOMA://PLAY" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "COMMUNITY HANDBOOK" }).click();
  await expect(page).toHaveURL(/\/handbook$/);
  await page.getByRole("link", { name: /four-panel field guide/i }).click();
  await expect(
    page.getByRole("heading", { name: "ENTER THE PANEL" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "RETURN TO PUBLICATION" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "ENTER THE PANEL" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await noOverflow(page);
  expectClean(errors);
});

test("search and every public filter preserve URL state", async ({ page }) => {
  const errors = audit(page);
  await page.goto("/");
  await page.getByLabel("Search KOMA://PLAY").fill("Tōkon");
  await page.getByRole("button", { name: "Search ↗" }).click();
  await expect(page).toHaveURL(/\/search\?q=T%C5%8Dkon/);
  await expect(
    page.locator('.search-panel a[href="/features/tokon"]'),
  ).toBeVisible();

  await page.goto("/");
  for (const [name, value] of [
    ["Gaming", "gaming"],
    ["Anime + Manga", "anime-manga"],
    ["Guides", "guides"],
    ["Open Panels", "open"],
  ] as const) {
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`_.data?filter=${value}`) && response.ok(),
      ),
      page.getByRole("link", { name, exact: true }).last().click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`filter=${value}`));
  }
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/_.data") && response.ok(),
    ),
    page.getByRole("link", { name: "Latest", exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/search");
  const selections = [
    ["Category", "Gaming"],
    ["Format", "Guide"],
    ["Issue", "Issue Zero"],
    ["Panel status", "Open Panels"],
  ] as const;
  for (const [label, option] of selections) {
    await page
      .getByRole("combobox", { name: label, exact: true })
      .selectOption({ label: option });
  }
  const topic = page.getByRole("combobox", {
    name: "Series / topic",
    exact: true,
  });
  const topicValues = await topic
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean),
    );
  if (topicValues.length) await topic.selectOption(topicValues[0]);
  else {
    await expect(topic.locator("option")).toHaveCount(1);
    await expect(topic).toHaveValue("");
  }
  await page.getByRole("button", { name: "Apply filters →" }).click();
  await expect(page).toHaveURL(/category=gaming/);
  await expect(page).toHaveURL(/format=guide/);
  if (topicValues.length)
    await expect(page).toHaveURL(new RegExp(`tag=${topicValues[0]}`));
  await expect(
    page.locator('.search-panel a[href="/features/tokon"]'),
  ).toBeVisible();
  await page.goto("/search?q=no-such-panel");
  await expect(page.getByText("0 matching panels")).toBeVisible();
  await noOverflow(page);
  expectClean(errors);
});

test("every strip arrow and card uses the rendered interaction", async ({
  page,
}) => {
  const errors = audit(page);
  await page.goto("/");
  const rail = page.getByRole("group", { name: /Featured stories/ }).first();
  await page.getByRole("button", { name: "Next features" }).first().click();
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Previous features" }).first().click();
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeLessThan(2);

  for (const slug of ["time", "vice", "tokon", "afterimage"]) {
    const card = page
      .locator(`.feature-rail a[href="/features/${slug}"]`)
      .first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page).toHaveURL(/\/features\/(time|vice|tokon|afterimage)$/);
    await page.goBack();
  }
  expectClean(errors);
});

test("carousel is manual and public provenance never exposes private fields", async ({
  page,
}) => {
  const errors = audit(page);
  await page.goto("/features/tokon");
  const next = page.getByRole("button", { name: "Next image" });
  await next.click();
  await expect(page.locator(".carousel-controls output")).toContainText(
    "02 / 03",
  );
  await page.getByRole("region", { name: "Image gallery" }).press("ArrowRight");
  await expect(page.locator(".carousel-controls output")).toContainText(
    "03 / 03",
  );
  await expect(page.getByRole("button", { name: /Load video/ })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: /Load video/ }).click();
  await expect(page.locator("iframe")).toHaveCount(1);

  const citation = page.locator(".panel-citation summary").first();
  if ((await citation.count()) > 0) {
    await citation.click();
    await expect(page.getByText("Editorial change")).toBeVisible();
  } else {
    await expect(
      page.getByText("No published community credits yet."),
    ).toBeVisible();
    await expect(page.getByText("THIS PANEL IS OPEN")).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText(
    /member email|moderation note|rejected draft/i,
  );
  await noOverflow(page);
  expectClean(errors);
});

test("all public routes load directly and missing content returns HTTP 404", async ({
  page,
}) => {
  const errors = audit(page);
  await page.goto("/");
  const discovered = await page
    .locator('a[href^="/features/"], a[href^="/issues/"]')
    .evaluateAll((links) => [
      ...new Set(
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      ),
    ]);
  await page.goto("/archive");
  discovered.push(
    ...(await page
      .locator('a[href^="/issues/"]')
      .evaluateAll((links) => [
        ...new Set(
          links
            .map((link) => link.getAttribute("href"))
            .filter((href): href is string => Boolean(href)),
        ),
      ])),
  );
  for (const path of [
    "/",
    ...new Set(discovered),
    "/archive",
    "/search?q=panel",
    "/handbook",
    "/onboarding?returnTo=%2Ffeatures%2Ftokon%2Fworkshop",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await noOverflow(page);
  }
  expectClean(errors);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const path of ["/features/not-a-panel", "/not-a-public-route"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText("This panel is missing.")).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
});
