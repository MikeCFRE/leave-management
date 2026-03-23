"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requestPasswordReset,
  confirmPasswordReset,
} from "@/server/actions/password";

// ---------------------------------------------------------------------------
// Request form — no token in URL
// ---------------------------------------------------------------------------

function RequestResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});

  if (state.success) {
    return (
      <Card className="shadow-sm">
        <CardContent className="pt-8 pb-8 text-center space-y-3">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
          <h2 className="font-semibold text-lg">Check your email</h2>
          <p className="text-sm text-slate-500">
            If an account exists for that email, we sent a password reset link.
            It expires in 1 hour.
          </p>
          <Link
            href="/login"
            className="block text-sm text-blue-600 hover:underline pt-2"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">Reset password</CardTitle>
        <CardDescription>
          Enter your email and we will send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@categoryfiveventures.com"
              disabled={pending}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send reset link
          </Button>

          <p className="text-center text-sm">
            <Link href="/login" className="text-blue-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Confirm form — token present in URL
// ---------------------------------------------------------------------------

function ConfirmResetForm({ token }: { token: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, action, pending] = useActionState(confirmPasswordReset, {});

  if (state.success) {
    return (
      <Card className="shadow-sm">
        <CardContent className="pt-8 pb-8 text-center space-y-3">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
          <h2 className="font-semibold text-lg">Password updated</h2>
          <p className="text-sm text-slate-500">
            Your password has been reset. You can now sign in.
          </p>
          <Link
            href="/login"
            className="block text-sm text-blue-600 hover:underline pt-2"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">Choose new password</CardTitle>
        <CardDescription>
          Must be at least 12 characters with uppercase, lowercase, number, and
          special character.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          {state.error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••••••"
                disabled={pending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                required
                placeholder="••••••••••••"
                disabled={pending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page — switches between request and confirm based on ?token=
// ---------------------------------------------------------------------------

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (token) {
    return <ConfirmResetForm token={token} />;
  }

  return <RequestResetForm />;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<RequestResetForm />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
