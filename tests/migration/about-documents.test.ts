import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routes = readFileSync("router-app/routes.ts", "utf8");
const about = readFileSync("router-app/routes/about.tsx", "utf8");
const documents = readFileSync("router-app/routes/documents.tsx", "utf8");
const masthead = readFileSync("router-app/components/Masthead.tsx", "utf8");
const issueNavigation = readFileSync("router-app/components/IssueNavigation.tsx", "utf8");
const home = readFileSync("router-app/routes/home.tsx", "utf8");

test("about route renders the public KOMA PLAY publication model", () => {
  assert.match(routes, /route\("about", "routes\/about\.tsx"\)/);
  assert.match(about, /ABOUT KOMA:\/\/PLAY/);
  assert.match(about, /community-created online monthly publication/);
  assert.match(about, /HOW IT WORKS/);
  assert.match(about, /WAYS TO JOIN IN/);
  assert.match(about, /Reader/);
  assert.match(about, /Contributing member/);
  assert.match(about, /Approved editor/);
  assert.match(about, /Open Panel/);
  assert.match(about, /Panel Citation/);
  assert.match(about, /all free/);
  assert.match(about, /anti-slop|slop/);
  assert.match(about, /Love,/);
  assert.match(about, /Team KOMA:\/\/PLAY/);
});

test("documents hub links signed-out readers to available public documents", () => {
  assert.match(routes, /route\("documents", "routes\/documents\.tsx"\)/);
  assert.match(documents, /Community Handbook \/ Pocket Guide/);
  assert.match(documents, /to="\/handbook"/);
  assert.match(documents, /to="\/onboarding"/);
  assert.match(documents, /to="\/about"/);
  assert.match(documents, /COMING NEXT/);
  assert.doesNotMatch(documents, /privacy policy[^\n]*effective/i);
  assert.doesNotMatch(documents, /terms of service[^\n]*agreement/i);
});

test("public navigation exposes About and Documents without dead ends", () => {
  assert.match(masthead, /to="\/about"/);
  assert.match(masthead, />\s*ABOUT\s*</);
  assert.match(issueNavigation, /to="\/about"/);
  assert.match(home, /to="\/about"/);
  assert.match(home, /to="\/documents"/);
  assert.match(about, /to="\/documents"/);
  assert.match(documents, /to="\/"/);
  assert.match(documents, /to="\/about"/);
});
