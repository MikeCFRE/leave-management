import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Password complexity validation
// ---------------------------------------------------------------------------

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordComplexity(
  password: string
): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < 12) errors.push("At least 12 characters required");
  if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter required");
  if (!/[a-z]/.test(password)) errors.push("At least one lowercase letter required");
  if (!/[0-9]/.test(password)) errors.push("At least one number required");
  if (!/[^A-Za-z0-9]/.test(password))
    errors.push("At least one special character required");
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// HMAC-signed password reset tokens
// Tokens are URL-safe, expire in 1 hour, and are invalidated after use
// because we embed lastPasswordChange in the payload.
// ---------------------------------------------------------------------------

interface ResetTokenPayload {
  email: string;
  /** lastPasswordChange timestamp (ms) — ensures token is single-use */
  pwTs: number;
  /** Expiry timestamp (ms) */
  exp: number;
}

function getSecret(): string {
  // Prefer a dedicated secret so password-reset tokens and session tokens use
  // independent signing keys. Fall back to NEXTAUTH_SECRET for backwards
  // compatibility with existing deployments.
  const secret =
    process.env.PASSWORD_RESET_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret)
    throw new Error(
      "PASSWORD_RESET_SECRET (or NEXTAUTH_SECRET) is not set"
    );
  return secret;
}

export function createPasswordResetToken(
  email: string,
  lastPasswordChange: Date | null
): string {
  const payload: ResetTokenPayload = {
    email,
    pwTs: lastPasswordChange?.getTime() ?? 0,
    exp: Date.now() + 60 * 60 * 1000, // 1 hour
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyPasswordResetToken(
  token: string
): ResetTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;

  const expectedSig = createHmac("sha256", getSecret())
    .update(b64)
    .digest("base64url");

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  let payload: ResetTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString()) as ResetTokenPayload;
  } catch {
    return null;
  }

  if (Date.now() > payload.exp) return null;

  return payload;
}
