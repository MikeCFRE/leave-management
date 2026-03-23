"use server";

import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import {
  getUserByEmail,
  getUserById,
  updatePassword,
  sendPasswordResetEmail,
} from "@/server/services/user-service";
import {
  validatePasswordComplexity,
  verifyPasswordResetToken,
} from "@/lib/password";

// ---------------------------------------------------------------------------
// Request a password reset email
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const email = (formData.get("email") as string | null)?.toLowerCase().trim();
  if (!email) return { error: "Email is required" };

  try {
    await sendPasswordResetEmail(email);
  } catch {
    // Swallow errors — don't reveal anything to caller
  }

  // Always return success — prevents email enumeration
  return { success: true };
}

// ---------------------------------------------------------------------------
// Confirm reset with token + new password
// ---------------------------------------------------------------------------

export async function confirmPasswordReset(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const token = formData.get("token") as string | null;
  const newPassword = formData.get("password") as string | null;
  const confirmPassword = formData.get("confirmPassword") as string | null;

  if (!token) return { error: "Reset token is missing" };
  if (!newPassword) return { error: "Password is required" };
  if (newPassword !== confirmPassword) return { error: "Passwords do not match" };

  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.valid) return { error: complexity.errors[0] };

  const payload = verifyPasswordResetToken(token);
  if (!payload) return { error: "Reset link is invalid or has expired" };

  const user = await getUserByEmail(payload.email);
  if (!user) return { error: "User not found" };

  // Verify token hasn't already been used (lastPasswordChange must match payload)
  const storedTs = user.lastPasswordChange?.getTime() ?? 0;
  if (storedTs !== payload.pwTs) {
    return { error: "Reset link has already been used" };
  }

  await updatePassword(user.id, newPassword);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Change password for authenticated user (first-time or voluntary)
// ---------------------------------------------------------------------------

export async function changePassword(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const newPassword = formData.get("password") as string | null;
  const confirmPassword = formData.get("confirmPassword") as string | null;

  if (!newPassword) return { error: "Password is required" };
  if (newPassword !== confirmPassword) return { error: "Passwords do not match" };

  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.valid) return { error: complexity.errors[0] };

  const user = await getUserById(session.user.id);
  if (!user) redirect("/login");

  await updatePassword(user.id, newPassword);

  redirect("/dashboard");
}
