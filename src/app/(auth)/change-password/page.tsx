"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
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
import { changePassword } from "@/server/actions/password";

const REQUIREMENTS = [
  "At least 12 characters",
  "One uppercase letter",
  "One lowercase letter",
  "One number",
  "One special character",
];

export default function ChangePasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, action, pending] = useActionState(changePassword, {});

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex justify-center mb-2">
          <ShieldCheck className="h-10 w-10 text-blue-600" />
        </div>
        <CardTitle className="text-2xl text-center">Set your password</CardTitle>
        <CardDescription className="text-center">
          You must set a permanent password before continuing.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={action} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-600 mb-1.5">
              Password requirements:
            </p>
            <ul className="space-y-0.5">
              {REQUIREMENTS.map((req) => (
                <li key={req} className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                  {req}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                disabled={pending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
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
                autoComplete="new-password"
                placeholder="••••••••••••"
                disabled={pending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
                aria-label={showConfirm ? "Hide password" : "Show password"}
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
            Set password &amp; continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
