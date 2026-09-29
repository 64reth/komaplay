export function contributionState(item:{status:string;incorporated_at?:string|null},published=false,cited=false){
 if(published)return cited?"PUBLISHED · CITED":"PUBLISHED";
 if(item.incorporated_at)return "INCORPORATED · NOT CURRENTLY PUBLIC";
 if(item.status==="Accepted")return "ACCEPTED · AWAITING INCORPORATION";
 return item.status==="Rejected"?"DECLINED":item.status.toUpperCase();
}
