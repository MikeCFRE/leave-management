import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDetailsTable,
  EmailDivider,
} from "./base-layout";

export interface ApprovalReminderEmailProps {
  approverName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  submittedHoursAgo: number;
  hoursUntilEscalation: number;
  reviewUrl: string;
}

export function ApprovalReminderEmail({
  approverName,
  employeeName,
  leaveType,
  startDate,
  endDate,
  totalDays,
  submittedHoursAgo,
  hoursUntilEscalation,
  reviewUrl,
}: ApprovalReminderEmailProps) {
  const details = [
    { label: "Employee", value: employeeName },
    { label: "Leave Type", value: leaveType },
    { label: "Start Date", value: startDate },
    { label: "End Date", value: endDate },
    { label: "Total Days", value: `${totalDays} business day${totalDays !== 1 ? "s" : ""}` },
    { label: "Submitted", value: `${Math.round(submittedHoursAgo)} hours ago` },
  ];

  return (
    <EmailLayout previewText={`Reminder: ${employeeName}'s leave request is still awaiting your review.`}>
      <EmailHeading>Approval Reminder</EmailHeading>
      <EmailParagraph>Hi {approverName},</EmailParagraph>
      <EmailParagraph>
        This is a reminder that <strong>{employeeName}</strong>&apos;s leave request
        is still awaiting your approval. If no action is taken within{" "}
        <strong>{hoursUntilEscalation} hour{hoursUntilEscalation !== 1 ? "s" : ""}</strong>,
        the request will automatically escalate to the next approval tier.
      </EmailParagraph>

      <p
        style={{
          margin: "0 0 20px",
          padding: "12px 16px",
          backgroundColor: "#fefce8",
          borderLeft: "4px solid #eab308",
          borderRadius: "0 6px 6px 0",
          fontSize: 14,
          color: "#713f12",
          fontWeight: 500,
        }}
      >
        ⚠ Action required within {hoursUntilEscalation} hour{hoursUntilEscalation !== 1 ? "s" : ""}
      </p>

      <EmailDetailsTable rows={details} />

      <EmailButton href={reviewUrl}>Review Request Now</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        You can also approve or deny this request directly from the approvals
        dashboard in the Leave Management system.
      </EmailParagraph>
    </EmailLayout>
  );
}
