"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2, Cake } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Channel = "both" | "email" | "in_app" | "none";

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "both", label: "Email + In-app" },
  { value: "email", label: "Email only" },
  { value: "in_app", label: "In-app only" },
  { value: "none", label: "None" },
];

const PREF_EVENTS: {
  key: string;
  label: string;
  description: string;
}[] = [
  {
    key: "request_submitted",
    label: "Request submitted",
    description: "When you submit a leave request",
  },
  {
    key: "request_approved",
    label: "Request approved",
    description: "When your leave request is approved",
  },
  {
    key: "request_denied",
    label: "Request denied",
    description: "When your leave request is denied",
  },
  {
    key: "approval_reminder",
    label: "Approval reminder",
    description: "Reminders for pending approvals (managers)",
  },
  {
    key: "escalation",
    label: "Escalation",
    description: "When a request in your queue is escalated",
  },
];

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  on_leave: "secondary",
  terminated: "destructive",
};

// ---------------------------------------------------------------------------
// Profile info section
// ---------------------------------------------------------------------------

function ProfileInfo({
  profile,
}: {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    hireDate: string | Date;
    employmentStatus: string;
  };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account Information</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {[
          { label: "Name", value: `${profile.firstName} ${profile.lastName}` },
          { label: "Email", value: profile.email },
          { label: "Role", value: ROLE_LABELS[profile.role] ?? profile.role },
          {
            label: "Hire Date",
            value: format(new Date(profile.hireDate), "MMMM d, yyyy"),
          },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-4 py-2 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-slate-800">{value}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-2 text-sm">
          <span className="text-slate-500">Status</span>
          <Badge
            variant={STATUS_VARIANTS[profile.employmentStatus] ?? "outline"}
            className="capitalize text-xs"
          >
            {profile.employmentStatus.replace("_", " ")}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Birthday section
// ---------------------------------------------------------------------------

function BirthdaySection({ initialBirthday }: { initialBirthday: string | null }) {
  const [birthday, setBirthday] = useState(initialBirthday ?? "");
  const [saved, setSaved] = useState(false);

  const utils = trpc.useUtils();
  const save = trpc.user.updateBirthday.useMutation({
    onSuccess: () => {
      toast.success("Birthday saved.");
      utils.user.getProfile.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave() {
    save.mutate({ birthday: birthday || null });
  }

  function handleClear() {
    setBirthday("");
    save.mutate({ birthday: null });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cake className="h-4 w-4 text-slate-400" />
          Birthday
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-slate-500">
          Your birthday is shown to teammates on the team calendar.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {birthday && (
            <button
              onClick={handleClear}
              disabled={save.isPending}
              className="text-xs text-slate-400 hover:text-red-500"
            >
              Clear
            </button>
          )}
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          ) : null}
          Save Birthday
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notification preferences section
// ---------------------------------------------------------------------------

const VALID_CHANNELS = new Set<string>(["both", "email", "in_app", "none"]);

/** Normalize a raw DB value to a valid Channel string.
 *  Handles legacy object format {"email":true,"inApp":true} as well as strings. */
function toChannel(raw: unknown): Channel {
  if (typeof raw === "string" && VALID_CHANNELS.has(raw)) return raw as Channel;
  if (raw && typeof raw === "object") {
    const v = raw as { email?: boolean; inApp?: boolean };
    if (v.email && v.inApp) return "both";
    if (v.email) return "email";
    if (v.inApp) return "in_app";
    return "none";
  }
  return "both";
}

function NotificationPreferences({
  initialPrefs,
}: {
  initialPrefs: Record<string, unknown>;
}) {
  const [prefs, setPrefs] = useState<Record<string, Channel>>(() => {
    const defaults: Record<string, Channel> = {};
    PREF_EVENTS.forEach(({ key }) => {
      defaults[key] = toChannel(initialPrefs[key]);
    });
    return defaults;
  });

  // Sync if the query re-fetches with updated data
  useEffect(() => {
    setPrefs((prev) => {
      const updated = { ...prev };
      PREF_EVENTS.forEach(({ key }) => {
        if (initialPrefs[key] !== undefined) updated[key] = toChannel(initialPrefs[key]);
      });
      return updated;
    });
  }, [initialPrefs]);

  const utils = trpc.useUtils();
  const save = trpc.user.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success("Notification preferences saved.");
      utils.user.getProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave() {
    save.mutate(prefs);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notification Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y">
        {PREF_EVENTS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{description}</p>
            </div>
            <Select
              value={prefs[key]}
              onValueChange={(v) =>
                setPrefs((p) => ({ ...p, [key]: v as Channel }))
              }
            >
              <SelectTrigger className="w-40 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Save Preferences
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { data: profile, isLoading } = trpc.user.getProfile.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        Could not load profile.
      </div>
    );
  }

  const notifPrefs =
    (profile.notificationPreferences as Record<string, unknown> | null) ?? {};

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Profile</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Manage your account details and notification settings.
        </p>
      </div>

      <ProfileInfo profile={profile} />

      <BirthdaySection initialBirthday={(profile as { birthday?: string | null }).birthday ?? null} />

      <Separator />

      <NotificationPreferences initialPrefs={notifPrefs} />
    </div>
  );
}
