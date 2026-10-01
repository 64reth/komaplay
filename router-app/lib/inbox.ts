export type InboxEvent = {
  id: string;
  kind: string;
  feature_id: string;
  contribution_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
};
export function filterInbox(events: InboxEvent[], filter: string) {
  return [...events]
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )
    .filter((e) =>
      filter === "unread"
        ? !e.read_at
        : filter === "citations"
          ? ["cited", "incorporated"].includes(e.kind)
          : filter === "editorial"
            ? ["status", "response", "editorial", "published"].includes(e.kind)
            : true,
    );
}
