export type AuditListQuery = { limit?: number; cursor?: string };
export type AuditListResponse = {
  items: {
    id: string;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, unknown>;
    created_at: string;
  }[];
  nextCursor: string | null;
};
