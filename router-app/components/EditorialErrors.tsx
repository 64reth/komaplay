import { issueTarget, type DocumentIssue } from "../lib/editorial-validation";
export function FieldErrors({ issues, sectionId = null, field }: { issues: DocumentIssue[]; sectionId?: string | null; field: string }) {
  const matches = issues.filter(issue => issue.sectionId === sectionId && issue.field === field);
  if (!matches.length) return null;
  return <div id={`${issueTarget({ sectionId, field })}-error`} className="field-error">{matches.map(issue => <p key={issue.key}>{issue.message}</p>)}</div>;
}
export function RequirementList({ issues }: { issues: DocumentIssue[] }) {
  return <ul>{issues.map(issue => <li key={issue.key}><a href={`#${issueTarget(issue)}`} onClick={event => {
    event.preventDefault(); const target = document.getElementById(issueTarget(issue)); target?.focus(); target?.scrollIntoView({ block: "center" });
  }}>{issue.message}</a></li>)}</ul>;
}
