import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  departments,
  leaveBalances,
  leaveRequestApprovals,
  leaveRequests,
  organizations,
  users,
} from "@/server/db/schema";
import { appendAuditLog, AUDIT_ACTIONS } from "@/server/services/audit-service";
import { runAllValidators } from "@/server/services/policy-engine";
import {
  notifyRequestApproved,
  notifyRequestDenied,
  notifyEscalation,
} from "@/server/services/notification-service";
import type { UserRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Roles that can act as approvers */
const APPROVER_ROLES: UserRole[] = ["manager", "admin", "super_admin"];

/**
 * Returns the current expected approval tier for a request by inspecting its
 * approval history.
 *   No history       → tier 1
 *   Last action = 'escalated' at tier N → tier N + 1
 *   Last action = 'approved' / 'denied' → request already resolved
 */
async function getCurrentTier(requestId: string): Promise<number> {
  const history = await db.query.leaveRequestApprovals.findMany({
    where: eq(leaveRequestApprovals.requestId, requestId),
    orderBy: [desc(leaveRequestApprovals.actedAt)],
  });

  if (!history.length) return 1;

  const last = history[0];
  if (last.action === "escalated") return last.tier + 1;
  return last.tier;
}

/**
 * Checks whether approverId is authorised to act on a request belonging to
 * requestUserId in organisationId.
 *
 * Rules:
 *  - admin / super_admin: can act on any pending request in their organisation.
 *  - manager: can act only on requests from their direct reports.
 *    After an escalation a manager at a higher tier in the chain can also act.
 */
async function assertCanApprove(
  approverId: string,
  approverRole: UserRole,
  organizationId: string,
  requestUserId: string
): Promise<void> {
  if (!APPROVER_ROLES.includes(approverRole)) {
    throw new Error("Only managers and admins can approve leave requests.");
  }

  if (approverRole === "admin" || approverRole === "super_admin") return;

  // For managers: verify the requester is somewhere in their reporting chain
  let currentUserId: string | null = requestUserId;
  let depth = 0;
  const MAX_CHAIN_DEPTH = 5;

  while (currentUserId && depth < MAX_CHAIN_DEPTH) {
    const u: { managerId: string | null } | undefined =
      await db.query.users.findFirst({
        where: and(
          eq(users.id, currentUserId),
          eq(users.organizationId, organizationId)
        ),
        columns: { managerId: true },
      });
    if (!u) break;
    if (u.managerId === approverId) return; // Found in chain
    currentUserId = u.managerId;
    depth++;
  }

  throw new Error("You are not authorised to act on this request.");
}

/** Update leave balance when a request is approved: used += days, pending -= days */
async function creditApprovedBalance(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  leaveTypeId: string,
  startDate: string,
  totalBusinessDays: string
): Promise<void> {
  const year = parseInt(startDate.toString().substring(0, 4), 10);
  const days = parseFloat(totalBusinessDays);

  await tx
    .update(leaveBalances)
    .set({
      used: sql`${leaveBalances.used} + ${days}`,
      pending: sql`GREATEST(0, ${leaveBalances.pending} - ${days})`,
    })
    .where(
      and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year)
      )
    );
}

/** Restore pending balance when a request is denied or cancelled */
async function restorePendingBalance(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  leaveTypeId: string,
  startDate: string,
  totalBusinessDays: string
): Promise<void> {
  const year = parseInt(startDate.toString().substring(0, 4), 10);
  const days = parseFloat(totalBusinessDays);

  await tx
    .update(leaveBalances)
    .set({
      pending: sql`GREATEST(0, ${leaveBalances.pending} - ${days})`,
    })
    .where(
      and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year)
      )
    );
}

// ---------------------------------------------------------------------------
// getPendingQueue
// ---------------------------------------------------------------------------

export interface PendingQueueItem {
  request: typeof leaveRequests.$inferSelect & {
    user: Pick<typeof users.$inferSelect, "id" | "firstName" | "lastName" | "departmentId">;
    leaveType: { id: string; name: string };
  };
  coveragePercent: number; // % of dept that would be absent on worst day
  policyCompliant: boolean; // false if override was used at submission
}

export async function getPendingQueue(
  approverId: string,
  approverRole: UserRole,
  organizationId: string
): Promise<PendingQueueItem[]> {
  let requestRows: (typeof leaveRequests.$inferSelect & {
    user: Pick<typeof users.$inferSelect, "id" | "firstName" | "lastName" | "departmentId" | "managerId">;
    leaveType: { id: string; name: string };
  })[];

  if (approverRole === "admin" || approverRole === "super_admin") {
    // Admins see all pending requests in their organisation
    const orgUsers = await db.query.users.findMany({
      where: eq(users.organizationId, organizationId),
      columns: { id: true },
    });
    const userIds = orgUsers.map((u) => u.id);
    if (!userIds.length) return [];

    requestRows = await db.query.leaveRequests.findMany({
      where: and(
        inArray(leaveRequests.userId, userIds),
        eq(leaveRequests.status, "pending")
      ),
      with: {
        user: { columns: { id: true, firstName: true, lastName: true, departmentId: true, managerId: true } },
        leaveType: { columns: { id: true, name: true } },
      },
      orderBy: [leaveRequests.startDate],
    }) as typeof requestRows;
  } else {
    // Managers see pending requests from direct reports only
    const directReports = await db.query.users.findMany({
      where: and(
        eq(users.managerId, approverId),
        eq(users.organizationId, organizationId)
      ),
      columns: { id: true },
    });
    const reportIds = directReports.map((u) => u.id);
    if (!reportIds.length) return [];

    requestRows = await db.query.leaveRequests.findMany({
      where: and(
        inArray(leaveRequests.userId, reportIds),
        eq(leaveRequests.status, "pending")
      ),
      with: {
        user: { columns: { id: true, firstName: true, lastName: true, departmentId: true, managerId: true } },
        leaveType: { columns: { id: true, name: true } },
      },
      orderBy: [leaveRequests.startDate],
    }) as typeof requestRows;
  }

  // Enrich each request with coverage impact
  const result: PendingQueueItem[] = [];

  for (const row of requestRows) {
    let coveragePercent = 0;

    if (row.user.departmentId) {
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, row.user.departmentId),
      });

      if (dept?.totalHeadcount) {
        const deptUserIds = (
          await db.query.users.findMany({
            where: and(
              eq(users.departmentId, row.user.departmentId!),
              eq(users.employmentStatus, "active")
            ),
            columns: { id: true },
          })
        ).map((u) => u.id);

        const overlapping =
          deptUserIds.length > 0
            ? await db.query.leaveRequests.findMany({
                where: and(
                  eq(leaveRequests.status, "approved"),
                  inArray(leaveRequests.userId, deptUserIds),
                  lte(leaveRequests.startDate, row.endDate),
                  gte(leaveRequests.endDate, row.startDate)
                ),
              })
            : [];

        // Count distinct employees already on approved leave during this range
        const uniqueOnLeave = new Set(overlapping.map((r) => r.userId)).size;
        // +1 for the requester if approved
        coveragePercent = Math.round(
          ((uniqueOnLeave + 1) / dept.totalHeadcount) * 100
        );
      }
    }

    result.push({
      request: row as PendingQueueItem["request"],
      coveragePercent,
      policyCompliant: !row.policyOverrideUsed,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// approveRequest
// ---------------------------------------------------------------------------

export async function approveRequest(
  requestId: string,
  approverId: string,
  approverRole: UserRole,
  organizationId: string,
  comment?: string
): Promise<{ success: true }> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") {
    throw new Error(`Cannot approve a request with status '${request.status}'.`);
  }

  await assertCanApprove(approverId, approverRole, organizationId, request.userId);

  const tier = await getCurrentTier(requestId);

  await db.transaction(async (tx) => {
    // Record the approval action
    await tx.insert(leaveRequestApprovals).values({
      requestId,
      approverId,
      tier,
      action: "approved",
      comment: comment ?? null,
      autoEscalated: false,
      actedAt: new Date(),
    });

    // Finalise the request
    await tx
      .update(leaveRequests)
      .set({ status: "approved", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(leaveRequests.id, requestId));

    // Move balance from pending → used
    await creditApprovedBalance(
      tx,
      request.userId,
      request.leaveTypeId,
      request.startDate,
      request.totalBusinessDays
    );
  });

  await appendAuditLog({
    organizationId,
    userId: approverId,
    action: AUDIT_ACTIONS.LEAVE_APPROVED,
    entityType: "leave_request",
    entityId: requestId,
    newValues: { status: "approved", tier, comment: comment ?? null },
  });

  notifyRequestApproved(requestId, approverId, comment).catch(console.error);

  return { success: true };
}

// ---------------------------------------------------------------------------
// denyRequest
// ---------------------------------------------------------------------------

export async function denyRequest(
  requestId: string,
  approverId: string,
  approverRole: UserRole,
  organizationId: string,
  comment: string
): Promise<{ success: true }> {
  if (!comment?.trim()) {
    throw new Error("A reason is required when denying a request.");
  }

  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") {
    throw new Error(`Cannot deny a request with status '${request.status}'.`);
  }

  await assertCanApprove(approverId, approverRole, organizationId, request.userId);

  const tier = await getCurrentTier(requestId);

  await db.transaction(async (tx) => {
    await tx.insert(leaveRequestApprovals).values({
      requestId,
      approverId,
      tier,
      action: "denied",
      comment,
      autoEscalated: false,
      actedAt: new Date(),
    });

    await tx
      .update(leaveRequests)
      .set({ status: "denied", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(leaveRequests.id, requestId));

    // Restore pending balance
    await restorePendingBalance(
      tx,
      request.userId,
      request.leaveTypeId,
      request.startDate,
      request.totalBusinessDays
    );
  });

  await appendAuditLog({
    organizationId,
    userId: approverId,
    action: AUDIT_ACTIONS.LEAVE_DENIED,
    entityType: "leave_request",
    entityId: requestId,
    newValues: { status: "denied", tier, comment },
  });

  notifyRequestDenied(requestId, approverId, comment).catch(console.error);

  return { success: true };
}

// ---------------------------------------------------------------------------
// escalateRequest
// ---------------------------------------------------------------------------

export async function escalateRequest(
  requestId: string,
  escalatorId: string,
  escalatorRole: UserRole,
  organizationId: string
): Promise<{ success: true; nextTier: number }> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") {
    throw new Error(`Cannot escalate a request with status '${request.status}'.`);
  }

  await assertCanApprove(escalatorId, escalatorRole, organizationId, request.userId);

  const currentTier = await getCurrentTier(requestId);
  if (currentTier >= 3) {
    throw new Error("Request is already at the highest approval tier.");
  }

  await db.insert(leaveRequestApprovals).values({
    requestId,
    approverId: escalatorId,
    tier: currentTier,
    action: "escalated",
    comment: null,
    autoEscalated: false,
    actedAt: new Date(),
  });

  await appendAuditLog({
    organizationId,
    userId: escalatorId,
    action: AUDIT_ACTIONS.LEAVE_ESCALATED,
    entityType: "leave_request",
    entityId: requestId,
    newValues: { fromTier: currentTier, toTier: currentTier + 1 },
  });

  // Find next approver: escalator's manager, or fall back to an org admin
  const escalator = await db.query.users.findFirst({
    where: eq(users.id, escalatorId),
    columns: { managerId: true, firstName: true, lastName: true },
  });
  const nextApproverId =
    escalator?.managerId ??
    (
      await db.query.users.findFirst({
        where: and(eq(users.organizationId, organizationId), eq(users.role, "admin")),
        columns: { id: true },
      })
    )?.id;

  if (nextApproverId && escalator) {
    const escalatorName = `${escalator.firstName} ${escalator.lastName}`;
    notifyEscalation(
      requestId,
      nextApproverId,
      escalatorName,
      false,
      currentTier + 1
    ).catch(console.error);
  }

  return { success: true, nextTier: currentTier + 1 };
}

// ---------------------------------------------------------------------------
// overrideRequest — approve despite policy violations
// ---------------------------------------------------------------------------

export interface PolicyViolation {
  validator: string;
  message: string;
}

export async function overrideRequest(
  requestId: string,
  approverId: string,
  approverRole: UserRole,
  organizationId: string,
  reason: string
): Promise<{ success: true; violations: PolicyViolation[] }> {
  if (!APPROVER_ROLES.includes(approverRole)) {
    throw new Error("Only managers and admins can override policy violations.");
  }
  if (reason.trim().length < 20) {
    throw new Error("Override reason must be at least 20 characters.");
  }

  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
  });

  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") {
    throw new Error(`Cannot override a request with status '${request.status}'.`);
  }

  await assertCanApprove(approverId, approverRole, organizationId, request.userId);

  // Re-run validators to record the actual violations at override time
  const requester = await db.query.users.findFirst({
    where: eq(users.id, request.userId),
    columns: { organizationId: true, departmentId: true },
  });

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  const workSchedule = org?.workSchedule as { workDays: number[] } | null;
  const holidayCalendar = org?.holidayCalendar as { holidays: { date: string; name: string }[] } | null;

  const validation = await runAllValidators({
    userId: request.userId,
    organizationId,
    departmentId: requester?.departmentId ?? null,
    leaveTypeId: request.leaveTypeId,
    startDate: request.startDate,
    endDate: request.endDate,
    totalBusinessDays: parseFloat(request.totalBusinessDays),
    totalCalendarDays: request.totalCalendarDays,
    workSchedule: workSchedule ?? null,
    holidays: holidayCalendar?.holidays?.map((h) => h.date) ?? null,
    excludeRequestId: requestId,
  });

  const violations: PolicyViolation[] = validation.errors;
  const tier = await getCurrentTier(requestId);

  await db.transaction(async (tx) => {
    await tx.insert(leaveRequestApprovals).values({
      requestId,
      approverId,
      tier,
      action: "approved",
      comment: `POLICY OVERRIDE: ${reason}`,
      autoEscalated: false,
      actedAt: new Date(),
    });

    await tx
      .update(leaveRequests)
      .set({
        status: "approved",
        decidedAt: new Date(),
        updatedAt: new Date(),
        policyOverrideUsed: true,
        policyViolations: violations,
      })
      .where(eq(leaveRequests.id, requestId));

    await creditApprovedBalance(
      tx,
      request.userId,
      request.leaveTypeId,
      request.startDate,
      request.totalBusinessDays
    );
  });

  await appendAuditLog({
    organizationId,
    userId: approverId,
    action: AUDIT_ACTIONS.LEAVE_OVERRIDE_APPROVED,
    entityType: "leave_request",
    entityId: requestId,
    newValues: { status: "approved", tier, reason, violations },
    metadata: { overrideReason: reason, violationsCount: violations.length },
  });

  await appendAuditLog({
    organizationId,
    userId: approverId,
    action: AUDIT_ACTIONS.POLICY_OVERRIDDEN,
    entityType: "leave_request",
    entityId: requestId,
    newValues: { violations, reason },
  });

  notifyRequestApproved(requestId, approverId, `Policy override approved. Reason: ${reason}`).catch(console.error);

  return { success: true, violations };
}

// ---------------------------------------------------------------------------
// autoEscalateRequest — system-initiated (no authorization check)
// ---------------------------------------------------------------------------

/**
 * Auto-escalate a pending request on behalf of the system (cron job).
 * Bypasses assertCanApprove; sets autoEscalated = true on the record.
 * Returns { success: false, reason } if the request cannot be escalated.
 */
export async function autoEscalateRequest(
  requestId: string,
  organizationId: string
): Promise<{ success: true; nextTier: number } | { success: false; reason: string }> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: {
        columns: { id: true, managerId: true, firstName: true, lastName: true },
      },
    },
  });

  if (!request) return { success: false, reason: "Request not found." };
  if (request.status !== "pending") {
    return { success: false, reason: `Status is '${request.status}'.` };
  }

  const currentTier = await getCurrentTier(requestId);
  if (currentTier >= 3) {
    return { success: false, reason: "Already at highest approval tier." };
  }

  // The acting user for the approval record is the party who *should* have acted.
  // For tier 1: the direct manager. Fallback: an org admin.
  let actingUserId: string | undefined =
    request.user.managerId ?? undefined;

  if (!actingUserId) {
    const admin = await db.query.users.findFirst({
      where: and(
        eq(users.organizationId, organizationId),
        or(eq(users.role, "admin"), eq(users.role, "super_admin"))
      ),
      columns: { id: true },
    });
    actingUserId = admin?.id;
  }

  if (!actingUserId) {
    return { success: false, reason: "No eligible approver found in org." };
  }

  await db.insert(leaveRequestApprovals).values({
    requestId,
    approverId: actingUserId,
    tier: currentTier,
    action: "escalated",
    comment: "Automatically escalated after 48 hours of inactivity.",
    autoEscalated: true,
    actedAt: new Date(),
  });

  await appendAuditLog({
    organizationId,
    userId: null,
    action: AUDIT_ACTIONS.LEAVE_ESCALATED,
    entityType: "leave_request",
    entityId: requestId,
    newValues: { fromTier: currentTier, toTier: currentTier + 1, autoEscalated: true },
    metadata: { trigger: "auto_escalation_cron" },
  });

  // Notify the next-tier approver: acting user's manager, or another admin
  const actingUser = await db.query.users.findFirst({
    where: eq(users.id, actingUserId),
    columns: { managerId: true },
  });

  const nextApproverId =
    actingUser?.managerId ??
    (
      await db.query.users.findFirst({
        where: and(
          eq(users.organizationId, organizationId),
          or(eq(users.role, "admin"), eq(users.role, "super_admin"))
        ),
        columns: { id: true },
      })
    )?.id;

  if (nextApproverId) {
    notifyEscalation(
      requestId,
      nextApproverId,
      "auto-escalation",
      true,
      currentTier + 1
    ).catch(console.error);
  }

  return { success: true, nextTier: currentTier + 1 };
}
