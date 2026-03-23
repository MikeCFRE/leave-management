import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { leaveRequestApprovals, leaveRequests } from "@/server/db/schema";
import {
  autoEscalateRequest,
} from "@/server/services/approval-service";
import { notifyApprovalReminder } from "@/server/services/notification-service";

// ---------------------------------------------------------------------------
// runAutoEscalation
// ---------------------------------------------------------------------------

/**
 * Processes all pending leave requests and:
 *   - Sends a 24-hour reminder to the current-tier approver (once, in the
 *     24–25 hour window after the last relevant action).
 *   - Auto-escalates requests that have been pending at the current tier for
 *     ≥ 48 hours with no approval action.
 *
 * Designed to be called every hour by a cron route.
 */
export async function runAutoEscalation(): Promise<{
  escalated: number;
  reminded: number;
  errors: number;
}> {
  const now = new Date();

  const pendingRequests = await db.query.leaveRequests.findMany({
    where: eq(leaveRequests.status, "pending"),
    with: {
      approvals: {
        orderBy: [desc(leaveRequestApprovals.actedAt)],
      },
      user: {
        columns: { organizationId: true },
      },
    },
  });

  let escalated = 0;
  let reminded = 0;
  let errors = 0;

  for (const req of pendingRequests) {
    if (!req.submittedAt) continue;

    // Reference time = last escalation action timestamp, or initial submission
    const lastEscalation = req.approvals.find((a) => a.action === "escalated");
    const refTime = lastEscalation
      ? new Date(lastEscalation.actedAt)
      : new Date(req.submittedAt);

    const hoursElapsed =
      (now.getTime() - refTime.getTime()) / (1000 * 60 * 60);

    if (hoursElapsed >= 48) {
      // Auto-escalate
      try {
        const result = await autoEscalateRequest(
          req.id,
          req.user.organizationId
        );
        if (result.success) {
          escalated++;
        }
        // If !result.success, the request may already be at max tier — skip silently
      } catch (err) {
        console.error(
          `[cron/auto-escalation] Failed to escalate request ${req.id}:`,
          err
        );
        errors++;
      }
    } else if (hoursElapsed >= 24 && hoursElapsed < 25) {
      // Send 24-hour reminder — the 1-hour window ensures it fires exactly once
      notifyApprovalReminder(req.id).catch((err) =>
        console.error(
          `[cron/auto-escalation] Failed to send reminder for ${req.id}:`,
          err
        )
      );
      reminded++;
    }
  }

  return { escalated, reminded, errors };
}
