import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDetailsTable,
  EmailDivider,
} from "./base-layout";

export interface RequestSubmittedEmailProps {
  approverName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
  reviewUrl: string;
}

export function RequestSubmittedEmail({
  approverName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  reason,
  reviewUrl,
}: RequestSubmittedEmailProps) {
  const details = [
    { label: "Employee", value: employeeName },
    { label: "Leave Type", value: leaveType },
    { label: "Start Date", value: startDate },
    { label: "End Date", value: endDate },
    { label: "Total Days", value: `${totalDays} business day${totalDays !== 1 ? "s" : ""}` },
    ...(reason ? [{ label: "Reason", value: reason }] : []),
  ];

  return (
    <EmailLayout previewText={`${employeeName} has requested time off — action required within 48 hours.`}>
      <EmailHeading>New Leave Request</EmailHeading>
      <EmailParagraph>Hi {approverName},</EmailParagraph>
      <EmailParagraph>
        <strong>{employeeName}</strong> has submitted a leave request that requires
        your review. Please approve or deny within <strong>48 hours</strong> to avoid
        automatic escalation.
      </EmailParagraph>

      <EmailDetailsTable rows={details} />

      <EmailButton href={reviewUrl}>Review Request</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        If you cannot act on this request, you can escalate it to your manager or
        delegate approval authority from your account settings.
      </EmailParagraph>
    </EmailLayout>
  );
}
