import type { CoverDraft } from "../lib/cover-editor";

export function CoverPreview({ draft, imageUrl, panelCount, contributorCount=0 }: { draft: CoverDraft; imageUrl: string; panelCount: number; contributorCount?: number }) {
  const lines=Object.fromEntries(draft.secondary_cover_lines.map(line=>[line.position,line.headline]));
  return <article className={`cover-preview cover-${draft.cover_preset}`} aria-label="Issue cover preview">
    <div className="cover-preview-art">{imageUrl ? <img src={imageUrl} alt={draft.cover_art_alt || "Cover artwork preview"}/> : <span>CHOOSE COVER ART</span>}</div>
    <header><strong>KOMA://PLAY</strong><span>ISSUE {String(draft.issue_number || "—").padStart(2,"0")} / {draft.month || "—"}.{draft.year || "—"}</span></header>
    {draft.cover_theme && <p className="cover-theme">{draft.cover_theme}</p>}
    {lines["top-kicker"] && <p className="cover-line cover-top">{lines["top-kicker"]}</p>}
    {lines["left-rail"] && <p className="cover-line cover-left">{lines["left-rail"]}</p>}
    {lines["right-rail"] && <p className="cover-line cover-right">{lines["right-rail"]}</p>}
    <h2>{draft.lead_headline || "Lead headline"}</h2>
    {lines["bottom-strip"] && <p className="cover-line cover-bottom">{lines["bottom-strip"]}</p>}
    <footer><span>{draft.featuring_line || `${panelCount} PANELS${contributorCount ? ` / ${contributorCount} CONTRIBUTORS` : ""}`}</span><b>READ THE ISSUE →</b></footer>
  </article>;
}
