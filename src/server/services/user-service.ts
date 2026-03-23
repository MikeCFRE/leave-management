import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
  });
}

export async function getUserById(id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}

// ---------------------------------------------------------------------------
// Account lock helpers
// ---------------------------------------------------------------------------

export function isAccountLocked(user: {
  lockedUntil: Date | null;
  failedLoginAttempts: number;
}): boolean {
  if (!user.lockedUntil) return false;
  return user.lockedUntil > new Date();
}

export async function incrementFailedLogins(userId: string) {
  const user = await getUserById(userId);
  if (!user) return;

  const newCount = user.failedLoginAttempts + 1;
  const lockUntil =
    newCount >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;

  await db
    .update(users)
    .set({
      failedLoginAttempts: newCount,
      lockedUntil: lockUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function resetFailedLogins(userId: string) {
  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Password management
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function updatePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const hash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({
      passwordHash: hash,
      mustChangePassword: false,
      lastPasswordChange: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { Resend } = await import("resend");
  const { createPasswordResetToken } = await import("@/lib/password");

  const user = await getUserByEmail(email);
  // Always resolve — never reveal whether email exists
  if (!user || user.deletedAt) return;

  const token = createPasswordResetToken(email, user.lastPasswordChange);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "noreply@categoryfiveventures.com",
    to: email,
    subject: "Reset your password — Leave Management",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e293b;">Reset your password</h2>
        <p style="color: #475569;">Hi ${user.firstName},</p>
        <p style="color: #475569;">We received a request to reset your password. Click the button below to choose a new one.</p>
        <p style="margin: 32px 0;">
          <a href="${resetUrl}"
             style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="color: #94a3b8; font-size: 14px;">This link expires in 1 hour. If you did not request a password reset, you can ignore this email.</p>
        <hr style="border-color: #e2e8f0; margin: 32px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">Category Five Ventures — Leave Management System</p>
      </div>
    `,
  });
}
