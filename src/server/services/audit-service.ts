import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AuditLogInput {
  organizationId: string;
  userId?: string | null;
  action: string; // e.g. 'leave_request.submitted', 'leave_request.approved'
  entityType?: string | null; // e.g. 'leave_request', 'policy_rule', 'user'
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Well-known action constants — use these instead of raw strings
export const AUDIT_ACTIONS = {
  // Leave requests
  LEAVE_SUBMITTED: "leave_request.submitted",
  LEAVE_APPROVED: "leave_request.approved",
  LEAVE_DENIED: "leave_request.denied",
  LEAVE_CANCELLED: "leave_request.cancelled",
  LEAVE_ESCALATED: "leave_request.escalated",
  LEAVE_EXPIRED: "leave_request.expired",
  LEAVE_OVERRIDE_APPROVED: "leave_request.override_approved",

  // Policies
  POLICY_CREATED: "policy.created",
  POLICY_UPDATED: "policy.updated",
  POLICY_OVERRIDDEN: "policy.overridden",

  // Users
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DEACTIVATED: "user.deactivated",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_ACCOUNT_LOCKED: "user.account_locked",

  // Balance
  BALANCE_ADJUSTED: "balance.adjusted",
  BALANCE_ACCRUED: "balance.accrued",
  BALANCE_CARRIED_OVER: "balance.carried_over",
} as const;

// ---------------------------------------------------------------------------
// appendAuditLog — the only write path into audit_log.
// The table is append-only (enforced via RLS in Supabase).
// ---------------------------------------------------------------------------

export async function appendAuditLog(entry: AuditLogInput): Promise<void> {
  await db.insert(auditLog).values({
    organizationId: entry.organizationId,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    oldValues: entry.oldValues ?? null,
    newValues: entry.newValues ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    metadata: entry.metadata ?? null,
  });
}
