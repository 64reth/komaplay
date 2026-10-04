export type IssueCloseState = {
 status: string; lifecycle_state?: string; reason: string; issueId?: string;
 issueSlug?: string; issueTitle?: string; includedPanelCount?: number;
};
export function issueCloseFeedback(value: unknown): {success:string}|{error:string} {
 const result=value as Partial<IssueCloseState>|null;
 if(!result||typeof result.status!=="string"||typeof result.reason!=="string")return {error:"The closure response was unavailable. Refresh the Issue state before retrying."};
 if(result.status==="ARCHIVED"||result.status==="ALREADY_ARCHIVED")return {success:result.reason};
 return {error:result.reason};
}
