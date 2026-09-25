export const coverPresets = ["minimal", "feature-heavy", "interview-special", "archive-classic"] as const;
export const coverLinePositions = ["top-kicker", "left-rail", "right-rail", "bottom-strip"] as const;
export type CoverPreset = typeof coverPresets[number];
export type CoverLinePosition = typeof coverLinePositions[number];
export type CoverLine = { position: CoverLinePosition; headline: string };

export type CoverDraft = {
  issue_id: string; issue_number: string; slug: string; title: string; year: string; month: string;
  cover_art: string; cover_art_alt: string; cover_art_credit: string; lead_feature_id: string;
  lead_headline: string; cover_theme: string; secondary_cover_lines: CoverLine[];
  editor_note_teaser: string; featuring_line: string; cover_preset: CoverPreset;
};

export function coverErrors(draft: CoverDraft, publishedPanelIds: string[]) {
  const errors: Record<string,string> = {};
  if (!draft.title.trim()) errors.title="Add an issue title.";
  if (!/^\d+$/.test(draft.issue_number) || Number(draft.issue_number)<0) errors.issue_number="Add an issue number.";
  if (!/^[a-z0-9-]{3,80}$/.test(draft.slug)) errors.slug="Use lowercase letters, numbers and hyphens.";
  if (!draft.cover_art.trim()) errors.cover_art="Choose cover artwork.";
  if (!draft.cover_art_alt.trim()) errors.cover_art_alt="Add cover alt text so the issue is accessible.";
  if (!draft.lead_feature_id || !publishedPanelIds.includes(draft.lead_feature_id)) errors.lead_feature_id="Choose a published panel from this issue.";
  if (!draft.lead_headline.trim()) errors.lead_headline="Add a lead headline or use the lead panel title.";
  if (!publishedPanelIds.length) errors.lead_feature_id="Choose at least one published panel before archiving this issue.";
  if (draft.lead_headline.length>120) errors.lead_headline="This headline is too long for the selected cover slot.";
  draft.secondary_cover_lines.forEach((line,index)=>{if(line.headline.length>80)errors[`secondary_${index}`]="This headline is too long for the selected cover slot.";});
  return errors;
}
