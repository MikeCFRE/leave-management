"use client";

import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";

export function NotificationBell() {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.user.getNotifications.useQuery(
    { unreadOnly: false },
    { refetchInterval: 60 * 1000 }
  );

  const markRead = trpc.user.markNotificationsRead.useMutation({
    onSuccess: () => {
      utils.user.getNotifications.invalidate();
    },
    onError: () => {
      toast.error("Failed to mark notifications as read.");
    },
  });

  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.isRead);
  const unreadCount = unread.length;

  function handleMarkAllRead() {
    const ids = unread.map((n) => n.id);
    if (!ids.length) return;
    markRead.mutate({ notificationIds: ids });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4 text-slate-500" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
            <span className="sr-only">Notifications</span>
          </Button>
        }
      />

      <PopoverContent align="end" sideOffset={4} className="w-80 p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleMarkAllRead}
              disabled={markRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />

        {isLoading ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-slate-400">Loading…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="mx-auto h-6 w-6 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No notifications</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 ${!n.isRead ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
              >
                {n.link ? (
                  <a href={n.link} className="block">
                    <NotificationRow n={n} />
                  </a>
                ) : (
                  <NotificationRow n={n} />
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  n,
}: {
  n: { title: string; body: string; isRead: boolean; createdAt: Date | string };
}) {
  return (
    <>
      <p
        className={`text-sm leading-snug ${n.isRead ? "text-slate-700" : "font-medium text-slate-900"}`}
      >
        {n.title}
      </p>
      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
      <p className="text-xs text-slate-400 mt-1">
        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
      </p>
    </>
  );
}
