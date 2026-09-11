import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import approved from "../data/handbook-v1.json";
import { handbookPanels, safeReturnPath } from "../lib/handbook/domain";
import { migrateLegacyStorageKey } from "../lib/browser-storage";
test("approved handbook copy is byte-for-byte protected and splits into four panels", async () => {
  const fixture = await readFile("tests/fixtures/approved-handbook.md", "utf8");
  assert.equal(approved.content, fixture);
  assert.equal(
    createHash("sha256").update(approved.content).digest("hex"),
    approved.content_hash,
  );
  const panels = handbookPanels(approved.content);
  assert.equal(panels?.length, 4);
  assert.match(panels?.[0] ?? "", /You are helping build it/);
  assert.match(panels?.[1] ?? "", /### Be human/);
  assert.match(panels?.[2] ?? "", /## PROTECT THE SPACE/);
  assert.match(panels?.[3] ?? "", /LEAVE THE PANEL BETTER THAN YOU FOUND IT/);
});
test("handbook return paths retain only safe internal destinations", () => {
  assert.equal(
    safeReturnPath("/features/tokon/workshop?x=discarded"),
    "/features/tokon/workshop",
  );
  assert.equal(safeReturnPath("/onboarding?returnTo=%2Fapi"), "/");
  assert.equal(safeReturnPath("//outside.example"), "/");
  assert.equal(safeReturnPath("/api/handbook/accept"), "/");
});
test("legacy editorial draft storage migrates once without overwriting a newer draft", () => {
  const values = new Map<string, string>([
    ["inkplay-editorial-tokon", "legacy"],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  assert.equal(
    migrateLegacyStorageKey(
      storage,
      "inkplay-editorial-tokon",
      "komaplay-editorial-tokon",
    ),
    "legacy",
  );
  assert.equal(values.get("komaplay-editorial-tokon"), "legacy");
  assert.equal(values.has("inkplay-editorial-tokon"), false);
  values.set("inkplay-editorial-tokon", "older");
  assert.equal(
    migrateLegacyStorageKey(
      storage,
      "inkplay-editorial-tokon",
      "komaplay-editorial-tokon",
    ),
    "legacy",
  );
  assert.equal(values.get("inkplay-editorial-tokon"), "older");
});

test("KOMA presentation handbook splits into exactly four ordered panels", () => {
  const panels = handbookPanels(approved.content);
  assert.equal(panels?.length, 4);
  assert.match(panels?.[0] ?? "", /WELCOME TO KOMA:\/\/PLAY/);
});

test("malformed handbook content remains a recoverable unavailable state", () => {
  assert.equal(handbookPanels("# WELCOME TO KOMA://PLAY\nIncomplete"), null);
});
