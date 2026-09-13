import { Link } from "react-router";
import type { Route } from "./+types/about";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";

export const meta: Route.MetaFunction = () => [
  { title: "About KOMA://PLAY" },
  {
    name: "description",
    content:
      "KOMA://PLAY is a community-created monthly publication for gaming, anime and manga.",
  },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com/about" },
];

export default function About() {
  return (
    <main className="editorial-page about-page">
      <Masthead />
      <IssueNavigation />
      <article className="op-workspace about-document">
        <p className="op-eyebrow editorial-marker">PUBLICATION NOTES</p>
        <h1>ABOUT KOMA://PLAY</h1>
        <p className="published-dek">
          KOMA://PLAY is a community-created online monthly publication: a
          space where everyone can access and contribute to coverage of the best
          entertainment in gaming, anime and manga.
        </p>

        <section>
          <h2>HOW IT WORKS</h2>
          <p>
            Editors spark the conversation and set the topics, but the work does
            not end there. KOMA://PLAY gives the community room to expand and
            shape articles as they grow. Top contributions can take many forms:
            screenshots, clips, corrections, essays, observations, even memes.
            If they make the piece stronger, they can become part of the
            packaged article.
          </p>
          <p>
            Our cadence is simple: weekly articles are gathered into monthly
            editions. Once the month is up, the issue closes. The finished
            edition is archived and remains available for new readers to
            discover. The idea is not endless scrolling. You can read an issue,
            finish it, and feel satisfied with what you found: love, care and
            boundless enthusiasm from people who cherish these art forms as much
            as you do.
          </p>
          <p>
            Open Panel is the space around a feature where members bring
            corrections, sources, strategies, clips and lived knowledge. Accepted
            contributions can be edited into the Community Edition and credited
            with a permanent Panel Citation.
          </p>
        </section>

        <section>
          <h2>WAYS TO JOIN IN</h2>
          <p>
            We believe many minds are better than one. That is why we are
            building this format of forumised content creation. None of us are
            pretending to be the final authority. We are passionate, curious and
            willing to learn every day. We want to listen, and we want to
            encourage participation, but participation is not mandatory. There
            are multiple ways to engage with KOMA://PLAY, and they are all free.
          </p>
          <div className="about-roles" aria-label="Ways to join KOMA://PLAY">
            <section>
              <h3>Reader</h3>
              <p>
                Read the monthly issue, follow the archive, and take a break
                from algorithm-driven noise without needing to post.
              </p>
            </section>
            <section>
              <h3>Contributing member</h3>
              <p>
                Add corrections, sources, screenshots, clips, memories,
                strategies and counterpoints through feature-specific Workshops.
              </p>
            </section>
            <section>
              <h3>Approved editor</h3>
              <p>
                Create features, prepare revisions and help shape the editorial
                queue when trusted by the moderation team.
              </p>
            </section>
          </div>
        </section>

        <section>
          <h2>WHY WE BUILT THIS</h2>
          <p>
            Your involvement and enthusiasm will be recognised here. Build your
            community without fear of your contribution being buried or
            uncredited. Every contribution should remain accountable first to the
            person who made it. We believe that approach can keep building
            something greater than the sum of its parts.
          </p>
          <p>
            So if you want carefully considered, non-algorithm-driven, curated
            coverage that gives you real agency and a break from the tireless
            wave of slop on the biggest platforms, KOMA://PLAY may be the
            underground shot of peak entertainment coverage you are looking for.
          </p>
          <p>
            Let’s leave every issue better than when it started, and build a
            culture we can be proud of for years to come.
          </p>
        </section>

        <section className="documents-callout">
          <p className="editorial-marker">SITE DOCUMENTS</p>
          <h2>Read the public documents</h2>
          <p>
            The Community Handbook and Pocket Guide explain contribution,
            credit, conduct and member expectations.
          </p>
          <Link className="op-button action-primary" to="/documents">
            OPEN DOCUMENTS →
          </Link>
        </section>

        <footer className="about-signoff">
          <p>Love,</p>
          <p>Team KOMA://PLAY</p>
        </footer>
      </article>
    </main>
  );
}
