"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2 } from "lucide-react";
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
// Notification preferences section
// ---------------------------------------------------------------------------

function NotificationPreferences({
  initialPrefs,
}: {
  initialPrefs: Record<string, string>;
}) {
  const [prefs, setPrefs] = useState<Record<string, Channel>>(() => {
    const defaults: Record<string, Channel> = {};
    PREF_EVENTS.forEach(({ key }) => {
      defaults[key] = (initialPrefs[key] as Channel) ?? "both";
    });
    return defaults;
  });

  // Sync if the query re-fetches with updated data
  useEffect(() => {
    setPrefs((prev) => {
      const updated = { ...prev };
      PREF_EVENTS.forEach(({ key }) => {
        if (initialPrefs[key]) updated[key] = initialPrefs[key] as Channel;
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
    (profile.notificationPreferences as Record<string, string> | null) ?? {};

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Profile</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Manage your account details and notification settings.
        </p>
      </div>

      <ProfileInfo profile={profile} />

      <Separator />

      <NotificationPreferences initialPrefs={notifPrefs} />
    </div>
  );
}
