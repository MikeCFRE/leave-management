import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDetailsTable,
  EmailStatusBadge,
} from "./base-layout";

export interface RequestApprovedEmailProps {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approverName: string;
  comment?: string;
  dashboardUrl: string;
}

export function RequestApprovedEmail({
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  approverName,
  comment,
  dashboardUrl,
}: RequestApprovedEmailProps) {
  const details = [
    { label: "Leave Type", value: leaveType },
    { label: "Start Date", value: startDate },
    { label: "End Date", value: endDate },
    { label: "Total Days", value: `${totalDays} business day${totalDays !== 1 ? "s" : ""}` },
    { label: "Approved By", value: approverName },
  ];

  return (
    <EmailLayout previewText="Your leave request has been approved.">
      <EmailHeading>Leave Request Approved</EmailHeading>
      <EmailParagraph>Hi {employeeName},</EmailParagraph>
      <EmailParagraph>
        Great news — your leave request has been{" "}
        <EmailStatusBadge color="green">Approved</EmailStatusBadge>
      </EmailParagraph>

      <EmailDetailsTable rows={details} />

      {comment && (
        <EmailParagraph>
          <strong>Note from {approverName}:</strong> {comment}
        </EmailParagraph>
      )}

      <EmailButton href={dashboardUrl}>View My Requests</EmailButton>

      <EmailParagraph muted>
        If you need to cancel this request, you can do so from your dashboard up
        until the start date.
      </EmailParagraph>
    </EmailLayout>
  );
}
