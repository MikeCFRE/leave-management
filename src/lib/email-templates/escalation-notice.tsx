import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDetailsTable,
  EmailDivider,
} from "./base-layout";

export interface EscalationNoticeEmailProps {
  approverName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  escalatedFrom: string; // name of previous approver / "auto-escalation"
  tier: number;
  isAutoEscalation: boolean;
  reviewUrl: string;
}

export function EscalationNoticeEmail({
  approverName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  escalatedFrom,
  tier,
  isAutoEscalation,
  reviewUrl,
}: EscalationNoticeEmailProps) {
  const tierLabel =
    tier === 2 ? "Property Manager" : tier === 3 ? "Executive" : `Tier ${tier}`;

  const details = [
    { label: "Employee", value: employeeName },
    { label: "Leave Type", value: leaveType },
    { label: "Start Date", value: startDate },
    { label: "End Date", value: endDate },
    { label: "Total Days", value: `${totalDays} business day${totalDays !== 1 ? "s" : ""}` },
    {
      label: "Escalated By",
      value: isAutoEscalation
        ? `Auto-escalation (no action by ${escalatedFrom} within 48 hours)`
        : `${escalatedFrom} (manual escalation)`,
    },
    { label: "Your Role", value: tierLabel },
  ];

  return (
    <EmailLayout
      previewText={`Escalated leave request from ${employeeName} requires your review.`}
    >
      <EmailHeading>Leave Request Escalated to You</EmailHeading>
      <EmailParagraph>Hi {approverName},</EmailParagraph>
      <EmailParagraph>
        A leave request from <strong>{employeeName}</strong> has been escalated to
        you for review
        {isAutoEscalation
          ? " because it did not receive a response within 48 hours"
          : ` by ${escalatedFrom}`}
        . As <strong>{tierLabel}</strong>, you now have authority to approve, deny,
        or further escalate this request.
      </EmailParagraph>

      <EmailDetailsTable rows={details} />

      <EmailButton href={reviewUrl}>Review Escalated Request</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        Please act promptly — the employee&apos;s leave start date may be approaching.
        All approval actions are logged in the audit trail.
      </EmailParagraph>
    </EmailLayout>
  );
}
