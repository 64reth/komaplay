import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MembershipOnboardingLayer } from "../../router-app/components/handbook/GlobalMembershipGate";
import { OnboardingFlow } from "../../router-app/components/handbook/OnboardingFlow";
import approved from "../../router-app/data/handbook-v1.json";
import {
  handbookPanels,
  needsOnboarding,
  type HandbookVersion,
} from "../../router-app/lib/handbook";
import {
  mayLoadMemberData,
  membershipAccess,
} from "../../router-app/lib/membership";

const version: HandbookVersion = {
  ...approved,
  id: "00000000-0000-4000-8000-000000000001",
  active: true,
  published_at: "2026-09-10T00:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
  created_by: null,
};

test("membership state blocks private reads until the active handbook is accepted", () => {
  assert.equal(membershipAccess("signed-out"), "public");
  assert.equal(
    membershipAccess("authenticated", "active", "required"),
    "required",
  );
  assert.equal(
    membershipAccess("authenticated", "active", "accepted"),
    "accepted",
  );
  assert.equal(
    membershipAccess("authenticated", "restricted", "accepted"),
    "restricted",
  );
  assert.equal(
    membershipAccess("authenticated", "suspended", "accepted"),
    "suspended",
  );
  assert.equal(membershipAccess("profile-unavailable"), "unavailable");
  assert.equal(mayLoadMemberData("required"), false);
  assert.equal(mayLoadMemberData("accepted"), true);
});

test("compact-v1 and compatible acceptance semantics remain exact", () => {
  assert.equal(version.statement_version, "compact-v1");
  assert.equal(needsOnboarding(version, null), true);
  assert.equal(
    needsOnboarding(version, {
      user_id: "member",
      handbook_version_id: version.id,
      accepted_at: "2026-09-12T00:00:00Z",
      statement_version: "compact-v1",
    }),
    false,
  );
  assert.equal(handbookPanels(version.content)?.length, 4);
});

test("mandatory onboarding uses a separate backdrop and a four-panel flow", () => {
  const layer = renderToStaticMarkup(
    <MembershipOnboardingLayer>
      <p>Guide</p>
    </MembershipOnboardingLayer>,
  );
  assert.match(layer, /membership-onboarding-backdrop/);
  assert.match(layer, /membership-onboarding-panel/);
  assert.ok(
    layer.indexOf("membership-onboarding-backdrop") <
      layer.indexOf("membership-onboarding-panel"),
  );

  const guide = renderToStaticMarkup(
    <MemoryRouter>
      <OnboardingFlow version={version} onAccepted={() => undefined} />
    </MemoryRouter>,
  );
  assert.match(guide, /PANEL 01 \/ 04/);
  assert.equal((guide.match(/aria-current="step"/g) ?? []).length, 1);
  assert.match(guide, /Welcome to the Panel/);
});

test("malformed handbook copy remains recoverable and cannot be accepted", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <OnboardingFlow
        version={{ ...version, content: "malformed" }}
        onAccepted={() => undefined}
      />
    </MemoryRouter>,
  );
  assert.match(html, /cannot be displayed as four panels/);
  assert.match(html, /READ THE COMPLETE HANDBOOK/);
  assert.doesNotMatch(html, /ACCEPT THE COMPACT/);
});

test("membership backdrop, inert cleanup and member navigation remain explicit", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile("router-app/app.css", "utf8");
  const gate = await readFile(
    "router-app/components/handbook/GlobalMembershipGate.tsx",
    "utf8",
  );
  const profile = await readFile("router-app/routes/profile.tsx", "utf8");
  const settings = await readFile(
    "router-app/routes/profile-settings.tsx",
    "utf8",
  );
  assert.match(css, /\.membership-onboarding-backdrop[\s\S]*position: fixed/);
  assert.match(css, /backdrop-filter: blur\(6px\)/);
  assert.match(css, /-webkit-backdrop-filter: blur\(6px\)/);
  assert.match(gate, /setAttribute\("inert", ""\)/);
  assert.match(gate, /removeAttribute\("inert"\)/);
  assert.match(gate, /SIGN OUT AND CONTINUE READING/);
  assert.match(profile, /← RETURN TO PUBLICATION/);
  assert.match(profile, /to="\/profile\/settings"/);
  assert.match(settings, /← RETURN TO PROFILE/);
  assert.match(settings, /RETURN TO PUBLICATION/);
});
