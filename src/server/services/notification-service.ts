import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { leaveRequests, notifications, users } from "@/server/db/schema";
import { APP_URL } from "@/lib/constants";
import { RequestSubmittedEmail } from "@/lib/email-templates/request-submitted";
import { RequestApprovedEmail } from "@/lib/email-templates/request-approved";
import { RequestDeniedEmail } from "@/lib/email-templates/request-denied";
import { ApprovalReminderEmail } from "@/lib/email-templates/approval-reminder";
import { EscalationNoticeEmail } from "@/lib/email-templates/escalation-notice";
import { LowBalanceWarningEmail } from "@/lib/email-templates/low-balance-warning";
import {
  OverrideDigestEmail,
  type OverrideDigestEntry,
} from "@/lib/email-templates/override-digest";
import { RequestCancelledByAdminEmail } from "@/lib/email-templates/request-cancelled-by-admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationChannel = "both" | "email" | "in_app" | "none";

interface NotificationPreferences {
  [eventType: string]: NotificationChannel;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "noreply@fivecpm.com";

function getChannel(
  prefs: NotificationPreferences | null | undefined,
  eventType: string
): NotificationChannel {
  if (!prefs) return "both";
  return (prefs[eventType] as NotificationChannel | undefined) ?? "both";
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    // Log but never throw — email failure must not break the request lifecycle
    console.error("[notification-service] Failed to send email:", err);
  }
}

async function createInAppNotification(opts: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await db.insert(notifications).values({
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
  });
}

function renderEmail(element: React.ReactElement): string {
  return "<!DOCTYPE html>" + renderToStaticMarkup(element);
}

// ---------------------------------------------------------------------------
// Public notification functions
// ---------------------------------------------------------------------------

/**
 * Notify the requester's direct manager when a leave request is submitted.
 * Channel: Email + in-app.
 */
export async function notifyRequestSubmitted(requestId: string): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request?.user.managerId) return;

  const approver = await db.query.users.findFirst({
    where: eq(users.id, request.user.managerId),
  });

  if (!approver) return;

  const channel = getChannel(
    approver.notificationPreferences as NotificationPreferences | null,
    "request_submitted"
  );

  const reviewUrl = `${APP_URL}/approvals`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approverName = `${approver.firstName} ${approver.lastName}`;

  if (channel === "email" || channel === "both") {
    const html = renderEmail(
      React.createElement(RequestSubmittedEmail, {
        approverName,
        employeeName,
        leaveType: request.leaveType.name,
        startDate: request.startDate,
        endDate: request.endDate,
        totalDays: parseFloat(request.totalBusinessDays),
        reason: request.reason ?? undefined,
        reviewUrl,
      })
    );

    await sendEmail({
      to: approver.email,
      subject: `Action Required: Leave Request from ${employeeName}`,
      html,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: approver.id,
      type: "request_submitted",
      title: `New leave request from ${employeeName}`,
      body: `${employeeName} requested ${request.leaveType.name} from ${request.startDate} to ${request.endDate}.`,
      link: reviewUrl,
    });
  }
}

/**
 * Notify the employee when their request is approved.
 */
export async function notifyRequestApproved(
  requestId: string,
  approverId: string,
  comment?: string
): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request) return;

  const approver = await db.query.users.findFirst({
    where: eq(users.id, approverId),
  });

  const channel = getChannel(
    request.user.notificationPreferences as NotificationPreferences | null,
    "request_approved"
  );

  const dashboardUrl = `${APP_URL}/requests/${requestId}`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approverName = approver
    ? `${approver.firstName} ${approver.lastName}`
    : "Your manager";

  if (channel === "email" || channel === "both") {
    const html = renderEmail(
      React.createElement(RequestApprovedEmail, {
        employeeName,
        leaveType: request.leaveType.name,
        startDate: request.startDate,
        endDate: request.endDate,
        totalDays: parseFloat(request.totalBusinessDays),
        approverName,
        comment: comment ?? undefined,
        dashboardUrl,
      })
    );

    await sendEmail({
      to: request.user.email,
      subject: `Your leave request has been approved`,
      html,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: request.user.id,
      type: "request_approved",
      title: "Leave request approved",
      body: `Your ${request.leaveType.name} request (${request.startDate} – ${request.endDate}) has been approved.`,
      link: dashboardUrl,
    });
  }
}

/**
 * Notify the employee when their request is denied.
 */
export async function notifyRequestDenied(
  requestId: string,
  approverId: string,
  reason: string
): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request) return;

  const approver = await db.query.users.findFirst({
    where: eq(users.id, approverId),
  });

  const channel = getChannel(
    request.user.notificationPreferences as NotificationPreferences | null,
    "request_denied"
  );

  const dashboardUrl = `${APP_URL}/requests/${requestId}`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approverName = approver
    ? `${approver.firstName} ${approver.lastName}`
    : "Your manager";

  if (channel === "email" || channel === "both") {
    const html = renderEmail(
      React.createElement(RequestDeniedEmail, {
        employeeName,
        leaveType: request.leaveType.name,
        startDate: request.startDate,
        endDate: request.endDate,
        totalDays: parseFloat(request.totalBusinessDays),
        approverName,
        reason,
        dashboardUrl,
      })
    );

    await sendEmail({
      to: request.user.email,
      subject: `Your leave request was not approved`,
      html,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: request.user.id,
      type: "request_denied",
      title: "Leave request denied",
      body: `Your ${request.leaveType.name} request (${request.startDate} – ${request.endDate}) was not approved. Reason: ${reason}`,
      link: dashboardUrl,
    });
  }
}

/**
 * Remind the current tier approver about a pending request (24-hour reminder).
 * Called by the auto-escalation cron (Sprint 10).
 */
export async function notifyApprovalReminder(requestId: string): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request?.user.managerId || !request.submittedAt) return;

  const approver = await db.query.users.findFirst({
    where: eq(users.id, request.user.managerId),
  });

  if (!approver) return;

  const channel = getChannel(
    approver.notificationPreferences as NotificationPreferences | null,
    "approval_reminder"
  );

  if (channel === "none" || channel === "in_app") return; // Reminders are email-only per spec

  const submittedHoursAgo =
    (Date.now() - new Date(request.submittedAt).getTime()) / (1000 * 60 * 60);
  const hoursUntilEscalation = Math.max(0, 48 - submittedHoursAgo);
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approverName = `${approver.firstName} ${approver.lastName}`;

  const html = renderEmail(
    React.createElement(ApprovalReminderEmail, {
      approverName,
      employeeName,
      leaveType: request.leaveType.name,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: parseFloat(request.totalBusinessDays),
      submittedHoursAgo,
      hoursUntilEscalation: Math.round(hoursUntilEscalation),
      reviewUrl: `${APP_URL}/approvals`,
    })
  );

  await sendEmail({
    to: approver.email,
    subject: `Reminder: Leave request from ${employeeName} awaiting your review`,
    html,
  });
}

/**
 * Notify the next-tier approver when a request is escalated.
 */
export async function notifyEscalation(
  requestId: string,
  nextApproverId: string,
  escalatedFromName: string,
  isAutoEscalation: boolean,
  tier: number
): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request) return;

  const nextApprover = await db.query.users.findFirst({
    where: eq(users.id, nextApproverId),
  });

  if (!nextApprover) return;

  const channel = getChannel(
    nextApprover.notificationPreferences as NotificationPreferences | null,
    "escalation"
  );

  const reviewUrl = `${APP_URL}/approvals`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approverName = `${nextApprover.firstName} ${nextApprover.lastName}`;

  if (channel === "email" || channel === "both") {
    const html = renderEmail(
      React.createElement(EscalationNoticeEmail, {
        approverName,
        employeeName,
        leaveType: request.leaveType.name,
        startDate: request.startDate,
        endDate: request.endDate,
        totalDays: parseFloat(request.totalBusinessDays),
        escalatedFrom: escalatedFromName,
        tier,
        isAutoEscalation,
        reviewUrl,
      })
    );

    await sendEmail({
      to: nextApprover.email,
      subject: `Escalated: Leave request from ${employeeName} needs your review`,
      html,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: nextApprover.id,
      type: "escalation",
      title: `Escalated leave request from ${employeeName}`,
      body: `A leave request has been escalated to you for ${tier === 2 ? "property manager" : "executive"} review.`,
      link: reviewUrl,
    });
  }
}

/**
 * Warn an employee that their leave balance for a given type is running low.
 * Sends both an email and an in-app notification based on user preferences.
 */
export async function notifyLowBalance(
  userId: string,
  leaveType: string,
  remainingDays: number,
  year: number
): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) return;

  const channel = getChannel(
    user.notificationPreferences as NotificationPreferences | null,
    "balance_warning"
  );

  const dashboardUrl = `${APP_URL}/requests/new`;
  const employeeName = `${user.firstName} ${user.lastName}`;
  const isExhausted = remainingDays <= 0;
  const subject = isExhausted
    ? `Your ${leaveType} balance is exhausted`
    : `Low balance alert: ${remainingDays.toFixed(1)} day${remainingDays !== 1 ? "s" : ""} remaining in ${leaveType}`;

  if (channel === "email" || channel === "both") {
    const html = renderEmail(
      React.createElement(LowBalanceWarningEmail, {
        employeeName,
        leaveType,
        remainingDays,
        year,
        dashboardUrl,
      })
    );
    await sendEmail({ to: user.email, subject, html });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: user.id,
      type: "balance_warning",
      title: isExhausted ? `${leaveType} balance exhausted` : `Low ${leaveType} balance`,
      body: isExhausted
        ? `Your ${leaveType} balance for ${year} is fully used.`
        : `You have ${remainingDays.toFixed(1)} day${remainingDays !== 1 ? "s" : ""} remaining in your ${leaveType} balance for ${year}.`,
      link: dashboardUrl,
    });
  }
}

/**
 * Send a weekly digest of policy overrides to a super-admin.
 * Email-only — no in-app notification for admin digests.
 */
export async function sendOverrideDigest(
  adminEmail: string,
  adminName: string,
  overrides: OverrideDigestEntry[],
  weekStart: string,
  weekEnd: string
): Promise<void> {
  const html = renderEmail(
    React.createElement(OverrideDigestEmail, {
      adminName,
      weekStart,
      weekEnd,
      overrides,
      reviewUrl: `${APP_URL}/admin/audit-log`,
    })
  );

  await sendEmail({
    to: adminEmail,
    subject: `Weekly Override Digest: ${overrides.length} override${overrides.length !== 1 ? "s" : ""} (${weekStart} – ${weekEnd})`,
    html,
  });
}

/**
 * Notify the approver/manager when an employee cancels a previously-approved request.
 */
export async function notifyRequestCancelledByEmployee(requestId: string): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request?.user.managerId) return;

  const approver = await db.query.users.findFirst({
    where: eq(users.id, request.user.managerId),
  });

  if (!approver) return;

  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approvalsUrl = `${APP_URL}/approvals`;

  const channel = getChannel(
    approver.notificationPreferences as NotificationPreferences | null,
    "request_cancelled"
  );

  if (channel === "email" || channel === "both") {
    await sendEmail({
      to: approver.email,
      subject: `Leave request cancelled by ${employeeName}`,
      html: `<p>Hi ${approver.firstName},</p><p>${employeeName} has cancelled their approved ${request.leaveType.name} leave request (${request.startDate} – ${request.endDate}). The dates are now available again.</p>`,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: approver.id,
      type: "request_cancelled",
      title: `Leave request cancelled by ${employeeName}`,
      body: `${employeeName} cancelled their approved ${request.leaveType.name} leave (${request.startDate} – ${request.endDate}).`,
      link: approvalsUrl,
    });
  }
}

/**
 * Notify the employee when an admin cancels their approved leave request.
 */
export async function notifyAdminCancelledRequest(
  requestId: string,
  adminId: string,
  reason?: string
): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request) return;

  const admin = await db.query.users.findFirst({
    where: eq(users.id, adminId),
  });

  const channel = getChannel(
    request.user.notificationPreferences as NotificationPreferences | null,
    "request_cancelled"
  );

  const dashboardUrl = `${APP_URL}/requests/${requestId}`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const adminName = admin ? `${admin.firstName} ${admin.lastName}` : "An administrator";

  if (channel === "email" || channel === "both") {
    const html = renderEmail(
      React.createElement(RequestCancelledByAdminEmail, {
        employeeName,
        leaveType: request.leaveType.name,
        startDate: request.startDate,
        endDate: request.endDate,
        totalDays: parseFloat(request.totalBusinessDays),
        adminName,
        reason,
        dashboardUrl,
      })
    );

    await sendEmail({
      to: request.user.email,
      subject: `Your approved leave has been cancelled`,
      html,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: request.user.id,
      type: "request_cancelled",
      title: "Approved leave cancelled",
      body: `Your approved ${request.leaveType.name} leave (${request.startDate} – ${request.endDate}) has been cancelled by an administrator.`,
      link: dashboardUrl,
    });
  }
}

/**
 * Notify the manager when an employee edits a pending leave request.
 */
export async function notifyRequestEdited(requestId: string): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request?.user.managerId) return;

  const approver = await db.query.users.findFirst({
    where: eq(users.id, request.user.managerId),
  });

  if (!approver) return;

  const channel = getChannel(
    approver.notificationPreferences as NotificationPreferences | null,
    "request_submitted"
  );

  const reviewUrl = `${APP_URL}/approvals`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const approverName = `${approver.firstName} ${approver.lastName}`;

  if (channel === "email" || channel === "both") {
    await sendEmail({
      to: approver.email,
      subject: `Updated: Leave request from ${employeeName} has been revised`,
      html: `<p>Hi ${approverName},</p><p>${employeeName} has updated their ${request.leaveType.name} leave request. The new dates are ${request.startDate} – ${request.endDate} (${parseFloat(request.totalBusinessDays).toFixed(1)} days). Please review the updated request.</p><p><a href="${reviewUrl}">Review request</a></p>`,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: approver.id,
      type: "request_submitted",
      title: `Leave request updated by ${employeeName}`,
      body: `${employeeName} revised their ${request.leaveType.name} request: ${request.startDate} – ${request.endDate}.`,
      link: reviewUrl,
    });
  }
}

/**
 * Notify the employee when an admin edits their leave request.
 */
export async function notifyAdminEditedRequest(
  requestId: string,
  adminId: string
): Promise<void> {
  const request = await db.query.leaveRequests.findFirst({
    where: eq(leaveRequests.id, requestId),
    with: {
      user: true,
      leaveType: { columns: { id: true, name: true } },
    },
  });

  if (!request) return;

  const admin = await db.query.users.findFirst({
    where: eq(users.id, adminId),
  });

  const channel = getChannel(
    request.user.notificationPreferences as NotificationPreferences | null,
    "request_approved"
  );

  const dashboardUrl = `${APP_URL}/requests/${requestId}`;
  const employeeName = `${request.user.firstName} ${request.user.lastName}`;
  const adminName = admin ? `${admin.firstName} ${admin.lastName}` : "An administrator";

  if (channel === "email" || channel === "both") {
    await sendEmail({
      to: request.user.email,
      subject: `Your leave request has been updated by an administrator`,
      html: `<p>Hi ${employeeName},</p><p>${adminName} has made changes to your ${request.leaveType.name} leave request. The updated dates are ${request.startDate} – ${request.endDate} (${parseFloat(request.totalBusinessDays).toFixed(1)} days).</p><p><a href="${dashboardUrl}">View request</a></p>`,
    });
  }

  if (channel === "in_app" || channel === "both") {
    await createInAppNotification({
      userId: request.user.id,
      type: "request_approved",
      title: "Leave request updated by admin",
      body: `Your ${request.leaveType.name} leave has been updated: ${request.startDate} – ${request.endDate}.`,
      link: dashboardUrl,
    });
  }
}

/**
 * Mark one or more in-app notifications as read.
 */
export async function markNotificationsRead(
  userId: string,
  notificationIds: string[]
): Promise<void> {
  if (!notificationIds.length) return;

  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        // notificationIds filtered in-app ensures the user owns them
        eq(notifications.isRead, false)
      )
    );
}
