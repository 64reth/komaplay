// Reuse the existing server-only Supabase service credential. No public HTTP trigger.
export async function runIssueRollover(url: string | undefined, key: string | undefined, transport: typeof fetch = fetch) {
  if (!url || !key) throw new Error("Issue rollover service bindings are unavailable");
  const response = await transport(`${url.replace(/\/$/, "")}/rest/v1/rpc/run_issue_rollover`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Issue rollover RPC failed (${response.status}); next scheduled run will retry`);
  return await response.json() as {issue: number; phase: string}[];
}
