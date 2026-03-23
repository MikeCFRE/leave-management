import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { leaveRequests, leaveRequestApprovals, users } from "@/server/db/schema";
import { sendOverrideDigest } from "@/server/services/notification-service";
import type { OverrideDigestEntry } from "@/lib/email-templates/override-digest";

// ---------------------------------------------------------------------------
// runOverrideDigest
// ---------------------------------------------------------------------------

/**
 * Collects all policy-override approvals from the past 7 days and sends a
 * digest email to every active super_admin in each affected organization.
 *
 * Designed to be called weekly (e.g. every Monday at 08:00).
 * Always sends — even if there are zero overrides — so admins have a
 * confirmation that the digest ran.
 */
export async function runOverrideDigest(now?: Date): Promise<{
  digestsSent: number;
  errors: number;
}> {
  const end = now ?? new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = end.toISOString().slice(0, 10);

  // Find all approved override requests decided in the window
  const overrideRequests = await db.query.leaveRequests.findMany({
    where: and(
      eq(leaveRequests.status, "approved"),
      eq(leaveRequests.policyOverrideUsed, true),
      gte(leaveRequests.decidedAt, start)
    ),
    with: {
      user: {
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          organizationId: true,
        },
      },
      leaveType: { columns: { id: true, name: true } },
      approvals: {
        with: {
          approver: {
            columns: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  // Group by organization
  const byOrg = new Map<
    string,
    { entries: OverrideDigestEntry[] }
  >();

  for (const req of overrideRequests) {
    const orgId = req.user.organizationId;
    if (!byOrg.has(orgId)) byOrg.set(orgId, { entries: [] });

    // Find the approver who performed the override (action = "approved")
    const overrideApproval = req.approvals.find((a) => a.action === "approved");
    const approverName = overrideApproval
      ? `${overrideApproval.approver.firstName} ${overrideApproval.approver.lastName}`
      : "Unknown";

    // Extract override reason from the approval comment (format: "POLICY OVERRIDE: <reason>")
    const rawComment = overrideApproval?.comment ?? "";
    const overrideReason = rawComment.startsWith("POLICY OVERRIDE: ")
      ? rawComment.slice("POLICY OVERRIDE: ".length)
      : rawComment;

    byOrg.get(orgId)!.entries.push({
      employeeName: `${req.user.firstName} ${req.user.lastName}`,
      leaveType: req.leaveType.name,
      startDate: req.startDate.toString(),
      endDate: req.endDate.toString(),
      totalDays: parseFloat(req.totalBusinessDays),
      approvedBy: approverName,
      overrideReason,
      approvedAt: req.decidedAt?.toISOString() ?? "",
    });
  }

  // Find all super_admins across all organizations
  const superAdmins = await db.query.users.findMany({
    where: and(
      eq(users.role, "super_admin"),
      eq(users.employmentStatus, "active"),
      isNull(users.deletedAt)
    ),
    columns: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      organizationId: true,
    },
  });

  let digestsSent = 0;
  let errors = 0;

  for (const admin of superAdmins) {
    const orgEntries = byOrg.get(admin.organizationId)?.entries ?? [];

    try {
      await sendOverrideDigest(
        admin.email,
        `${admin.firstName} ${admin.lastName}`,
        orgEntries,
        weekStart,
        weekEnd
      );
      digestsSent++;
    } catch (err) {
      console.error(
        `[cron/override-digest] Failed to send digest to ${admin.email}:`,
        err
      );
      errors++;
    }
  }

  return { digestsSent, errors };
}
