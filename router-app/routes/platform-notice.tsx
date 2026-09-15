import { Link } from "react-router";
import { Masthead } from "../components/Masthead";
export const meta = () => [
  { title: "Privacy and platform information — KOMA://PLAY" },
  {
    name: "description",
    content:
      "How KOMA accounts, contributions, privacy and moderation work during Alpha.",
  },
  {
    tagName: "link",
    rel: "canonical",
    href: "https://komaplay.com/documents/platform-notice",
  },
];
export default function PlatformNotice() {
  return (
    <main className="editorial-page">
      <Masthead />
      <article className="op-workspace about-document">
        <p className="editorial-marker">
          ALPHA PLATFORM INFORMATION · 15 SEPTEMBER 2026
        </p>
        <h1>Privacy and platform information</h1>
        <p>
          This notice describes the current Alpha. Formal terms, the retention
          schedule, age policy and a dedicated privacy contact still need owner
          and legal review. Please avoid sharing sensitive personal information.
        </p>
        <h2>Accounts and privacy</h2>
        <p>
          Supabase handles email and Google authentication and stores membership
          profiles, Pocket Guide acceptance, contributions, editorial documents
          and images. Cloudflare serves the website and processes network
          requests. Signing in creates an authenticated account; it does not
          verify a person’s real-world identity. Google sign-in uses Google’s
          authentication service.
        </p>
        <p>
          Account details include your sign-in email, chosen display name,
          optional profile preferences and the records needed to manage your
          work. Private drafts are available to their author. Submitted work is
          shared with authorised editorial reviewers. Published work, its
          selected credits and revision history are public.
        </p>
        <h2>Cookies, embedded media and operational data</h2>
        <p>
          Sign-in uses browser cookies to maintain your session. This Alpha does
          not install advertising or audience-analytics trackers. Embedded
          YouTube and Twitch players contact those services and may process
          viewing and network information under their own policies. External
          links take you to independently operated sites.
        </p>
        <p>
          Cloudflare operational logs can contain request information. KOMA also
          keeps account-based action counters to limit repeated requests. These
          counters do not store an IP address or a device fingerprint.
          Moderation and editorial history record decisions and revisions. An
          optional Cloudflare Turnstile check can be enabled for submissions;
          when active, it processes browser and network information to
          distinguish legitimate requests from automation.
        </p>
        <h2>Your work and public credit</h2>
        <p>
          Follow the <Link to="/handbook">Community Handbook</Link> for
          contribution and credit guidance. Submit only material you have
          permission to share and identify the sources of borrowed information.
          Posting does not transfer ownership of your work. Detailed
          publication-licence terms remain subject to owner and legal review.
        </p>
        <h2>Moderation, corrections and takedown</h2>
        <p>
          Workshop contributions and editorial submissions pass through review.
          Reviewers can request changes; authorised moderators control
          publication and takedown. Use the correction link on a public panel to
          report an error or concern. Removing material from public view does
          not automatically erase its moderation or revision history.
        </p>
        <h2>Accessibility</h2>
        <p>
          The editor supports keyboard controls, associated error messages and
          descriptions for images. We are still testing the Alpha with assistive
          technologies and do not claim certified accessibility conformance. If
          a check or control prevents you from contributing, keep a local copy
          of your work and raise it with the KOMA team through the invitation
          channel you already use.
        </p>
        <h2>Editorial independence and safe participation</h2>
        <p>
          Contributions are reviewed editorially; submission does not guarantee
          publication. Do not impersonate others, publish someone else’s private
          information or use the platform for unsolicited promotion. Accounts
          may be restricted when participation is unsafe. The age and
          safeguarding policy needs owner approval before invitations are
          extended to children.
        </p>
        <p>
          For privacy, deletion or access requests during this limited Alpha,
          use your existing KOMA invitation contact. A public contact route and
          final legal documents must be approved before an unrestricted public
          launch.
        </p>
        <Link className="op-button" to="/documents">
          BACK TO DOCUMENTS
        </Link>
      </article>
    </main>
  );
}
