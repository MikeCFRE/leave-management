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

export interface RequestCancelledByAdminEmailProps {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  adminName: string;
  reason?: string;
  dashboardUrl: string;
}

export function RequestCancelledByAdminEmail({
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  adminName,
  reason,
  dashboardUrl,
}: RequestCancelledByAdminEmailProps) {
  const details = [
    { label: "Leave Type", value: leaveType },
    { label: "Start Date", value: startDate },
    { label: "End Date", value: endDate },
    { label: "Total Days", value: `${totalDays} business day${totalDays !== 1 ? "s" : ""}` },
    { label: "Cancelled By", value: adminName },
  ];

  return (
    <EmailLayout previewText="Your approved leave has been cancelled by an administrator.">
      <EmailHeading>Approved Leave Cancelled</EmailHeading>
      <EmailParagraph>Hi {employeeName},</EmailParagraph>
      <EmailParagraph>
        Your previously approved leave request has been{" "}
        <EmailStatusBadge color="red">Cancelled</EmailStatusBadge> by an administrator.
      </EmailParagraph>

      <EmailDetailsTable rows={details} />

      {reason && (
        <>
          <EmailParagraph>
            <strong>Reason:</strong>
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
        </>
      )}

      <EmailButton href={dashboardUrl}>View My Requests</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        If you have questions about this cancellation, please reach out to your manager or HR directly.
      </EmailParagraph>
    </EmailLayout>
  );
}
