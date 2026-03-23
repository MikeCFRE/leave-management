import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDivider,
} from "./base-layout";

export interface LowBalanceWarningEmailProps {
  employeeName: string;
  leaveType: string;
  remainingDays: number;
  year: number;
  dashboardUrl: string;
}

export function LowBalanceWarningEmail({
  employeeName,
  leaveType,
  remainingDays,
  year,
  dashboardUrl,
}: LowBalanceWarningEmailProps) {
  const isExhausted = remainingDays <= 0;

  return (
    <EmailLayout
      previewText={
        isExhausted
          ? `Your ${leaveType} balance for ${year} is exhausted.`
          : `Your ${leaveType} balance for ${year} is running low (${remainingDays.toFixed(1)} day${remainingDays !== 1 ? "s" : ""} remaining).`
      }
    >
      <EmailHeading>
        {isExhausted ? "Leave Balance Exhausted" : "Low Leave Balance Notice"}
      </EmailHeading>

      <EmailParagraph>Hi {employeeName},</EmailParagraph>

      {isExhausted ? (
        <EmailParagraph>
          Your <strong>{leaveType}</strong> balance for {year} has been fully
          used. Any new requests for this leave type will require a policy
          override or accrual of additional days.
        </EmailParagraph>
      ) : (
        <EmailParagraph>
          You have{" "}
          <strong>
            {remainingDays.toFixed(1)} day{remainingDays !== 1 ? "s" : ""}
          </strong>{" "}
          remaining in your <strong>{leaveType}</strong> balance for {year}.
          Please plan accordingly — requests that exceed your available balance
          may be subject to additional review.
        </EmailParagraph>
      )}

      <p
        style={{
          margin: "0 0 20px",
          padding: "12px 16px",
          backgroundColor: isExhausted ? "#fee2e2" : "#fefce8",
          borderLeft: `4px solid ${isExhausted ? "#ef4444" : "#eab308"}`,
          borderRadius: "0 6px 6px 0",
          fontSize: 14,
          color: isExhausted ? "#991b1b" : "#713f12",
          fontWeight: 500,
        }}
      >
        {isExhausted
          ? `${leaveType} balance: 0 days available`
          : `${leaveType} balance: ${remainingDays.toFixed(1)} day${remainingDays !== 1 ? "s" : ""} remaining`}
      </p>

      <EmailButton href={dashboardUrl}>View My Balances</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        You can view your full leave balance and request history in the Leave
        Management dashboard. Contact your manager or HR if you have questions
        about your entitlements.
      </EmailParagraph>
    </EmailLayout>
  );
}
