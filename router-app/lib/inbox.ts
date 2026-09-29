export type InboxEvent = {
  id: string;
  kind: string;
  feature_id: string;
  contribution_id: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
};
