import React from "react";

export const BRAND_COLOR = "#2563eb";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#475569";
const TEXT_MUTED = "#94a3b8";
const BG_PAGE = "#f1f5f9";
const BG_CARD = "#ffffff";
const BORDER = "#e2e8f0";

export interface EmailLayoutProps {
  children: React.ReactNode;
  previewText?: string;
}

export function EmailLayout({ children, previewText }: EmailLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: BG_PAGE,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontSize: "16px",
          lineHeight: "1.5",
          color: TEXT_PRIMARY,
        }}
      >
        {previewText && (
          <span style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>
            {previewText}
          </span>
        )}

        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}
          style={{ backgroundColor: BG_PAGE }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}
                  style={{
                    maxWidth: 600,
                    backgroundColor: BG_CARD,
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    overflow: "hidden",
                  }}>
                  <tbody>
                    {/* Header */}
                    <tr>
                      <td style={{ backgroundColor: BRAND_COLOR, padding: "20px 32px" }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#bfdbfe",
                          textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Category Five Ventures
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                          Leave Management
                        </p>
                      </td>
                    </tr>

                    {/* Body */}
                    <tr>
                      <td style={{ padding: "32px 32px 24px" }}>{children}</td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td style={{ borderTop: `1px solid ${BORDER}`, padding: "16px 32px",
                        backgroundColor: "#f8fafc" }}>
                        <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, textAlign: "center" }}>
                          Category Five Ventures · Leave Management System
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_MUTED, textAlign: "center" }}>
                          Manage notification preferences in your profile settings.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
      {children}
    </h1>
  );
}

export function EmailParagraph({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <p style={{ margin: "0 0 16px", fontSize: 15,
      color: muted ? TEXT_SECONDARY : TEXT_PRIMARY }}>
      {children}
    </p>
  );
}

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "24px 0" }}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: BRAND_COLOR, borderRadius: 6 }}>
            <a
              href={href}
              style={{
                display: "inline-block",
                padding: "12px 28px",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                borderRadius: 6,
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailDetailsTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}
      style={{
        margin: "16px 0",
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: "#f8fafc",
      }}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td style={{ padding: "8px 12px", fontSize: 13, color: TEXT_SECONDARY,
              fontWeight: 600, width: "36%", verticalAlign: "top" }}>
              {row.label}
            </td>
            <td style={{ padding: "8px 12px", fontSize: 14, color: TEXT_PRIMARY,
              verticalAlign: "top" }}>
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EmailDivider() {
  return (
    <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "20px 0" }} />
  );
}

export function EmailStatusBadge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "green" | "red" | "yellow" | "blue";
}) {
  const colors = {
    green: { bg: "#dcfce7", text: "#166534" },
    red: { bg: "#fee2e2", text: "#991b1b" },
    yellow: { bg: "#fef9c3", text: "#854d0e" },
    blue: { bg: "#dbeafe", text: "#1e40af" },
  };
  const c = colors[color];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {children}
    </span>
  );
}
