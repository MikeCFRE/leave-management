import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDivider,
  BRAND_COLOR,
} from "./base-layout";

export interface OverrideDigestEntry {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approvedBy: string;
  overrideReason: string;
  approvedAt: string; // ISO date string
}

export interface OverrideDigestEmailProps {
  adminName: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  overrides: OverrideDigestEntry[];
  reviewUrl: string;
}

export function OverrideDigestEmail({
  adminName,
  weekStart,
  weekEnd,
  overrides,
  reviewUrl,
}: OverrideDigestEmailProps) {
  return (
    <EmailLayout
      previewText={`Weekly policy override digest: ${overrides.length} override${overrides.length !== 1 ? "s" : ""} from ${weekStart} to ${weekEnd}.`}
    >
      <EmailHeading>Weekly Policy Override Digest</EmailHeading>

      <EmailParagraph>Hi {adminName},</EmailParagraph>

      <EmailParagraph>
        This is your weekly summary of policy override approvals from{" "}
        <strong>{weekStart}</strong> to <strong>{weekEnd}</strong>.{" "}
        {overrides.length === 0 ? (
          "No overrides were approved this week."
        ) : (
          <>
            <strong>{overrides.length}</strong> override
            {overrides.length !== 1 ? "s were" : " was"} approved.
          </>
        )}
      </EmailParagraph>

      {overrides.length > 0 && (
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            margin: "16px 0",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: BRAND_COLOR }}>
              {[
                "Employee",
                "Leave Type",
                "Dates",
                "Days",
                "Approved By",
                "Reason",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 10px",
                    color: "#ffffff",
                    fontWeight: 600,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overrides.map((o, i) => (
              <tr
                key={i}
                style={{ backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }}
              >
                <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                  {o.employeeName}
                </td>
                <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                  {o.leaveType}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    verticalAlign: "top",
                    whiteSpace: "nowrap",
                  }}
                >
                  {o.startDate}
                  {o.startDate !== o.endDate ? ` – ${o.endDate}` : ""}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    verticalAlign: "top",
                    textAlign: "center",
                  }}
                >
                  {o.totalDays}
                </td>
                <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                  {o.approvedBy}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    verticalAlign: "top",
                    color: "#475569",
                    maxWidth: 160,
                  }}
                >
                  {o.overrideReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <EmailButton href={reviewUrl}>View Audit Log</EmailButton>

      <EmailDivider />
      <EmailParagraph muted>
        Policy overrides bypass one or more leave policy rules and are logged in
        the audit trail. Review the audit log for full details on each override.
        This digest is sent weekly to all super-admins.
      </EmailParagraph>
    </EmailLayout>
  );
}
