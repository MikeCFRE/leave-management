import React from "react";
import {
  EmailLayout,
  EmailHeading,
  EmailParagraph,
  EmailButton,
  EmailDetailsTable,
} from "./base-layout";

export interface WelcomeEmailProps {
  firstName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}

export function WelcomeEmail({
  firstName,
  email,
  tempPassword,
  loginUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout previewText={`Welcome, ${firstName}! Your Leave Management account is ready.`}>
      <EmailHeading>Welcome, {firstName}!</EmailHeading>
      <EmailParagraph muted>
        Your Leave Management account has been created. Use the details below
        to sign in for the first time.
      </EmailParagraph>

      <EmailDetailsTable
        rows={[
          { label: "Login URL", value: loginUrl },
          { label: "Email", value: email },
          { label: "Temporary password", value: tempPassword },
        ]}
      />

      <EmailButton href={loginUrl}>Sign in now</EmailButton>

      <EmailParagraph muted>
        You will be asked to set a new password the first time you sign in.
      </EmailParagraph>
    </EmailLayout>
  );
}
