import { and, eq, desc, sql, or } from "drizzle-orm";
import {
  notifyRequestSubmitted,
  notifyRequestCancelledByEmployee,
} from "@/server/services/notification-service";
import { db } from "@/server/db";
import {
  leaveBalances,
  leaveRequests,
} from "@/server/db/schema";
import { countBusinessDays, countCalendarDays, WorkSchedule } from "@/lib/date-utils";
import {
  runAllValidators,
  type ValidateRequestInput,
  type ValidationError,
  type ValidationWarning,
} from "@/server/services/policy-engine";
import type { LeaveStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// getLeaveBalances
// ---------------------------------------------------------------------------

export async function getLeaveBalances(userId: string, year?: number) {
  const targetYear = year ?? new Date().getFullYear();
  return db.query.leaveBalances.findMany({
    where: and(
      eq(leaveBalances.userId, userId),
      eq(leaveBalances.year, targetYear)
    ),
    with: { leaveType: true },
  });
}

// ---------------------------------------------------------------------------
// submitLeaveRequest
// ---------------------------------------------------------------------------

export interface SubmitLeaveInput {
  userId: string;
  organizationId: string;
  departmentId: string | null;
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason?: string;
  documentIds?: string[];
  workSchedule: WorkSchedule | null;
  holidays: string[] | null;
  forceSubmit?: boolean;
}

export type SubmitLeaveResult =
  | { success: true; request: Awaited<ReturnType<typeof insertLeaveRequest>>; warnings: ValidationWarning[] }
  | { success: false; errors: ValidationError[]; warnings: ValidationWarning[] };

async function insertLeaveRequest(params: {
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalBusinessDays: number;
  totalCalendarDays: number;
  reason?: string;
}) {
  const [request] = await db
    .insert(leaveRequests)
    .values({
      userId: params.userId,
      leaveTypeId: params.leaveTypeId,
      startDate: params.startDate,
      endDate: params.endDate,
      totalBusinessDays: params.totalBusinessDays.toFixed(2),
      totalCalendarDays: params.totalCalendarDays,
      status: "pending",
      reason: params.reason,
      submittedAt: new Date(),
    })
    .returning();
  return request;
}

export async function submitLeaveRequest(
  input: SubmitLeaveInput
): Promise<SubmitLeaveResult> {
  const totalCalendarDays = countCalendarDays(input.startDate, input.endDate);
  const totalBusinessDays = countBusinessDays(
    input.startDate,
    input.endDate,
    input.workSchedule,
    input.holidays
  );

  const validationInput: ValidateRequestInput = {
    userId: input.userId,
    organizationId: input.organizationId,
    departmentId: input.departmentId,
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    totalBusinessDays,
    totalCalendarDays,
    workSchedule: input.workSchedule,
    holidays: input.holidays,
  };

  const validation = await runAllValidators(validationInput);

  if (!validation.valid && !input.forceSubmit) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const policyViolations = !validation.valid && input.forceSubmit
    ? validation.errors.map((e) => ({ rule: e.validator, message: e.message }))
    : null;

  // Create the request and increment pending balance atomically
  const request = await db.transaction(async (tx) => {
    const [req] = await tx
      .insert(leaveRequests)
      .values({
        userId: input.userId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        totalBusinessDays: totalBusinessDays.toFixed(2),
        totalCalendarDays,
        status: "pending",
        reason: input.reason,
        submittedAt: new Date(),
        policyOverrideUsed: policyViolations !== null,
        policyViolations: policyViolations ?? undefined,
      })
      .returning();

    const year = new Date().getFullYear();
    await tx
      .update(leaveBalances)
      .set({
        pending: sql`${leaveBalances.pending} + ${totalBusinessDays}`,
      })
      .where(
        and(
          eq(leaveBalances.userId, input.userId),
          eq(leaveBalances.leaveTypeId, input.leaveTypeId),
          eq(leaveBalances.year, year)
        )
      );

    return req;
  });

  // Fire-and-forget — notification failure must not break request submission
  notifyRequestSubmitted(request.id).catch(console.error);

  return { success: true, request, warnings: validation.warnings };
}

// ---------------------------------------------------------------------------
// cancelLeaveRequest
// ---------------------------------------------------------------------------

export type CancelLeaveResult =
  | { success: true }
  | { success: false; error: string };

export async function cancelLeaveRequest(
  requestId: string,
  userId: string
): Promise<CancelLeaveResult> {
  const request = await db.query.leaveRequests.findFirst({
    where: and(
      eq(leaveRequests.id, requestId),
      eq(leaveRequests.userId, userId)
    ),
  });

  if (!request) {
    return { success: false, error: "Request not found." };
  }

  if (request.status !== "pending" && request.status !== "approved") {
    return {
      success: false,
      error: "Only pending or approved requests can be cancelled.",
    };
  }

  const year = parseInt(request.startDate.toString().substring(0, 4), 10);
  const days = parseFloat(request.totalBusinessDays);

  await db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, requestId));

    if (request.status === "pending") {
      // Restore the pending balance
      await tx
        .update(leaveBalances)
        .set({
          pending: sql`GREATEST(0, ${leaveBalances.pending} - ${days})`,
        })
        .where(
          and(
            eq(leaveBalances.userId, userId),
            eq(leaveBalances.leaveTypeId, request.leaveTypeId),
            eq(leaveBalances.year, year)
          )
        );
    } else {
      // Restore the used balance for approved requests
      await tx
        .update(leaveBalances)
        .set({
          used: sql`GREATEST(0, ${leaveBalances.used} - ${days})`,
        })
        .where(
          and(
            eq(leaveBalances.userId, userId),
            eq(leaveBalances.leaveTypeId, request.leaveTypeId),
            eq(leaveBalances.year, year)
          )
        );
    }
  });

  // Notify the approver if the request was approved (fire-and-forget)
  if (request.status === "approved") {
    notifyRequestCancelledByEmployee(requestId).catch(console.error);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// getMyRequests
// ---------------------------------------------------------------------------

export interface GetMyRequestsOptions {
  status?: LeaveStatus;
  page?: number;
  limit?: number;
}

export async function getMyRequests(
  userId: string,
  options?: GetMyRequestsOptions
) {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    db.query.leaveRequests.findMany({
      where: and(
        eq(leaveRequests.userId, userId),
        options?.status ? eq(leaveRequests.status, options.status) : undefined
      ),
      with: {
        leaveType: true,
        approvals: {
          with: { approver: { columns: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
      orderBy: [desc(leaveRequests.createdAt)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.userId, userId),
          options?.status ? eq(leaveRequests.status, options.status) : undefined
        )
      ),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// getRequestById
// ---------------------------------------------------------------------------

export async function getRequestById(requestId: string, userId: string) {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      leaveType: true,
      approvals: {
        with: {
          approver: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: (t, { asc }) => [asc(t.actedAt)],
      },
      documents: true,
    },
  });

  if (!request) return null;

  // Employees can only view their own requests.
  // Manager/admin scoping is enforced at the tRPC layer.
  if (request.userId !== userId) return null;

  return request;
}
