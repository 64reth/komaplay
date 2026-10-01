import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import Profile from "../../router-app/routes/profile";
import { filterInbox, type InboxEvent } from "../../router-app/lib/inbox";
import { canEdit } from "../../router-app/lib/open-panel";
test("My Inbox filters remain finite, stable, private-event based and non-mutating", () => {
  const events = [
    { id: "a", kind: "cited", read_at: null },
    { id: "c", kind: "response", read_at: "read" },
    { id: "b", kind: "incorporated", read_at: null },
  ].map((e) => ({
    ...e,
    feature_id: "feature",
    contribution_id: null,
    message: "Editorial update",
    created_at: "2026-10-01T00:00:00Z",
  })) as InboxEvent[];
  assert.deepEqual(
    filterInbox(events, "all").map((e) => e.id),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    filterInbox(events, "unread").map((e) => e.id),
    ["b", "a"],
  );
  assert.deepEqual(
    filterInbox(events, "citations").map((e) => e.id),
    ["b", "a"],
  );
  assert.deepEqual(
    filterInbox(events, "editorial").map((e) => e.id),
    ["c"],
  );
  assert.equal(events[0].id, "a");
});
test("only pending and returned submissions offer in-place correction", () => {
  assert.equal(canEdit("Submitted"), true);
  assert.equal(canEdit("Changes Requested"), true);
  for (const status of ["In Review", "Accepted", "Rejected"])
    assert.equal(canEdit(status), false);
});
test("private Profile identifies retained submissions even when their Panel is no longer public", () => {
  const result = {
    state: "accepted",
    profile: { display_name: "Member", created_at: "2026-09-01", bio: "" },
    capabilities: { editorial: false, moderation: false },
    publication: [{ contribution_id: "own", published: false, cited: false }],
    drafts: [],
    saved: [],
    inbox: [],
    features: [],
    issues: [],
    authored: [],
    citations: 0,
    citationHistory: [],
    editorialWork: [],
    nextPanels: [],
    contributions: [
      {
        id: "own",
        title: "My missing submission",
        body: "My original writing remains recoverable.",
        feature: null,
        feature_id: "hidden",
        status: "Submitted",
        created_at: "2026-09-12",
        incorporated_at: null,
      },
    ],
  };
  const router = createMemoryRouter(
    [{ path: "/profile", element: <Profile />, loader: () => null }],
    {
      initialEntries: ["/profile"],
      hydrationData: { loaderData: { "0": result } },
    },
  );
  const html = renderToStaticMarkup(<RouterProvider router={router} />);
  assert.match(html, /My missing submission/);
  assert.match(html, /My original writing remains recoverable/);
  assert.match(html, /SUBMITTED/);
  assert.match(html, /Panel not currently public/);
  assert.match(html, /VIEW MY INBOX/);
  assert.doesNotMatch(
    html,
    /MARK READ|YOUR KOMA BRIEFING|href="\/features\/hidden/,
  );
});
