import test from "node:test";
import assert from "node:assert/strict";
import { verifyEditorialChallenge } from "../../router-app/lib/turnstile.server";
import {
  imageDimensions,
  safeImageDimensions,
} from "../../router-app/lib/editorial-media.server";
import { privatePath, xmlEscape } from "../../router-app/lib/seo";

test("optional challenge fails closed, checks action/hostname, and rejects replay", async () => {
  const names = [
    "TURNSTILE_SECRET",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_HOSTNAMES",
  ] as const;
  const original = names.map((n) => process.env[n]);
  try {
    for (const n of names) delete process.env[n];
    const request = new Request("https://komaplay.com/editorial");
    assert.equal(await verifyEditorialChallenge(null, request), true);
    process.env.TURNSTILE_SECRET = "fixture";
    process.env.TURNSTILE_SITE_KEY = "fixture";
    assert.equal(await verifyEditorialChallenge("", request), false);
    let used = false;
    const service = async () =>
      new Response(
        JSON.stringify({
          success: !used && (used = true),
          action: "editorial-submit",
          hostname: "komaplay.com",
        }),
      );
    assert.equal(
      await verifyEditorialChallenge("fresh", request, service),
      true,
    );
    assert.equal(
      await verifyEditorialChallenge("fresh", request, service),
      false,
    );
    for (const result of [
      { success: false },
      { success: true, action: "other", hostname: "komaplay.com" },
      { success: true, action: "editorial-submit", hostname: "evil.test" },
    ])
      assert.equal(
        await verifyEditorialChallenge(
          "token",
          request,
          async () => new Response(JSON.stringify(result)),
        ),
        false,
      );
    assert.equal(
      await verifyEditorialChallenge("token", request, async () => {
        throw Error("private");
      }),
      false,
    );
  } finally {
    names.forEach((n, i) => {
      if (original[i] === undefined) delete process.env[n];
      else process.env[n] = original[i];
    });
  }
});
test("image dimensions reject malformed and oversized media", () => {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1280);
  view.setUint32(20, 720);
  assert.deepEqual(imageDimensions(bytes, "image/png"), {
    width: 1280,
    height: 720,
  });
  assert.equal(safeImageDimensions(imageDimensions(bytes, "image/png")), true);
  assert.equal(safeImageDimensions({ width: 8000, height: 8000 }), false);
  assert.equal(safeImageDimensions({ width: 0, height: 10 }), false);
  assert.equal(imageDimensions(new Uint8Array(1), "image/jpeg"), null);
});
test("private pages stay out of indexing and sitemap content is escaped", () => {
  for (const path of [
    "/editorial",
    "/profile/settings",
    "/features/tokon/workshop",
    "/moderation",
    "/auth/callback",
  ])
    assert.equal(privatePath(path), true);
  assert.equal(privatePath("/features/tokon"), false);
  assert.equal(xmlEscape('<&"'), "&lt;&amp;&quot;");
});
