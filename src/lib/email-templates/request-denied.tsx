import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDetailsTable,
  EmailStatusBadge,
  EmailDivider,
} from "./base-layout";

export interface RequestDeniedEmailProps {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approverName: string;
  reason: string;
  dashboardUrl: string;
}

export function RequestDeniedEmail({
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  approverName,
  reason,
  dashboardUrl,
}: RequestDeniedEmailProps) {
  const details = [
    { label: "Leave Type", value: leaveType },
    { label: "Start Date", value: startDate },
    { label: "End Date", value: endDate },
    { label: "Total Days", value: `${totalDays} business day${totalDays !== 1 ? "s" : ""}` },
    { label: "Reviewed By", value: approverName },
  ];

  return (
    <EmailLayout previewText="Your leave request was not approved.">
      <EmailHeading>Leave Request Not Approved</EmailHeading>
      <EmailParagraph>Hi {employeeName},</EmailParagraph>
      <EmailParagraph>
        Your leave request has been{" "}
        <EmailStatusBadge color="red">Denied</EmailStatusBadge>
      </EmailParagraph>

      <EmailDetailsTable rows={details} />

      <EmailParagraph>
        <strong>Reason from {approverName}:</strong>
      </EmailParagraph>
      <p
        style={{
          margin: "0 0 20px",
          padding: "12px 16px",
          backgroundColor: "#fef2f2",
          borderLeft: "4px solid #ef4444",
          borderRadius: "0 6px 6px 0",
          fontSize: 14,
          color: "#7f1d1d",
        }}
      >
        {reason}
      </p>

      <EmailButton href={dashboardUrl}>View My Requests</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        If you have questions about this decision, please reach out to your manager
        directly. You may submit a new request for different dates if needed.
      </EmailParagraph>
    </EmailLayout>
  );
}
