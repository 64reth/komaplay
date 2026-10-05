import {filterFeatures,orderedDrops,stripItems,type Catalogue,type DiscoveryFilters,type Issue} from './publication';

// Compose Home from the public catalogue. No inferred Issue or fallback to archived content.
export function homePublication(data:Catalogue,filters:DiscoveryFilters={}) {
 const issue=data.issues.find(i=>i.status==='current')??data.issues.find(i=>i.status==='finalising');
 const published=issue?data.features.filter(f=>f.issue_id===issue.id&&f.status==='published'&&!['draft','archived','taken_down'].includes(f.lifecycle_status)):[];
 const features=issue?filterFeatures({...data,features:published},{...filters,issue:issue.slug}):[];
 const drops=issue?orderedDrops(data.drops.filter(d=>d.issue_id===issue.id&&d.status==='published'&&d.week_number>=1&&d.week_number<=4&&features.some(f=>f.weekly_drop_id===d.id))):[];
 return {issue,features,drops,publishedPanelCount:published.length,stripItemCount:drops.reduce((n,d)=>n+stripItems(data,d,features).length,0),hasArchive:data.issues.some(i=>i.status==='archived')};
}
export function homeIssueLabel(issue?:Issue) {
 return issue?`ISSUE ${String(issue.issue_number).padStart(2,'0')} / ${new Date(Date.UTC(issue.year,issue.month-1)).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).toUpperCase()}`:'OPEN PANEL / GAMES · MANGA · ANIME';
}
