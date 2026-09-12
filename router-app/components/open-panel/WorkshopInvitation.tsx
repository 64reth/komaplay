import React from "react";
import { Link } from "react-router";
import { launchAuthentication } from "../AccountNav";

export function WorkshopInvitation({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  const returnTo = `/features/${slug}/workshop`;
  return (
    <section
      className="workshop-entry"
      aria-labelledby="workshop-entry-heading"
    >
      <p className="editorial-marker">ENTER THE WORKSHOP</p>
      <h2 id="workshop-entry-heading">You’re adding to “{title}”.</h2>
      <p>
        Sign in to submit knowledge, experience or evidence for its next
        revision.
      </p>
      <div className="op-actions">
        <button
          className="action-primary"
          onClick={() => launchAuthentication("sign-in", returnTo)}
        >
          SIGN IN
        </button>
        <button onClick={() => launchAuthentication("create", returnTo)}>
          CREATE ACCOUNT
        </button>
        <Link to={`/features/${slug}`}>RETURN TO COMMUNITY EDITION</Link>
      </div>
    </section>
  );
}
