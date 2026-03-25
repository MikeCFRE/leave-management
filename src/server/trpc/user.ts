import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { publicProcedure, router } from "./trpc";
import { db } from "@/server/db";
import { leaveRequests, notifications, organizations, users } from "@/server/db/schema";
import { getUserById } from "@/server/services/user-service";
import { markNotificationsRead } from "@/server/services/notification-service";

// ---------------------------------------------------------------------------
// Protected procedure — requires an authenticated session
// ---------------------------------------------------------------------------

const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const user = await getUserById(ctx.session.user.id);
  if (!user || user.deletedAt || user.employmentStatus === "terminated") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organizationId),
  });

  return next({ ctx: { ...ctx, user, org: org ?? null } });
});

// ---------------------------------------------------------------------------
// Notification channel schema (mirrors NotificationPreferences in service)
// ---------------------------------------------------------------------------

const notificationChannelSchema = z.enum(["both", "email", "in_app", "none"]);

const notificationPreferencesSchema = z
  .object({
    request_submitted: notificationChannelSchema.optional(),
    request_approved: notificationChannelSchema.optional(),
    request_denied: notificationChannelSchema.optional(),
    approval_reminder: notificationChannelSchema.optional(),
    escalation: notificationChannelSchema.optional(),
  })
  .passthrough(); // allow future event types without breaking

// ---------------------------------------------------------------------------
// User router
// ---------------------------------------------------------------------------

export const userRouter = router({
  /**
   * Return the current user's profile (no sensitive fields).
   */
  getProfile: protectedProcedure.query(({ ctx }) => {
    const {
      passwordHash: _pw,
      failedLoginAttempts: _fa,
      lockedUntil: _lu,
      mustChangePassword: _mcp,
      ...profile
    } = ctx.user;
    return profile;
  }),

  /**
   * Update the current user's birthday (self-service).
   */
  updateBirthday: protectedProcedure
    .input(
      z.object({
        birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(users)
        .set({ birthday: input.birthday, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  /**
   * Update the current user's notification preferences.
   * Merges the supplied keys into the existing JSONB object.
   */
  updateNotificationPreferences: protectedProcedure
    .input(notificationPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const existing =
        (ctx.user.notificationPreferences as Record<string, string> | null) ??
        {};
      const merged = { ...existing, ...input };

      await db
        .update(users)
        .set({ notificationPreferences: merged, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  /**
   * In-app notification inbox for the current user.
   * Returns up to 50 notifications, newest first.
   */
  getNotifications: protectedProcedure
    .input(
      z
        .object({ unreadOnly: z.boolean().optional().default(false) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return db.query.notifications.findMany({
        where: and(
          eq(notifications.userId, ctx.user.id),
          input?.unreadOnly ? eq(notifications.isRead, false) : undefined
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 50,
      });
    }),

  /**
   * Mark a list of in-app notifications as read.
   */
  markNotificationsRead: protectedProcedure
    .input(z.object({ notificationIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationsRead(ctx.user.id, input.notificationIds);
      return { success: true };
    }),

  /**
   * Team calendar: approved/pending leave requests for colleagues in the same
   * department within a date range.  Falls back to org-wide if no department.
   */
  getTeamCalendar: protectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        includeStatuses: z
          .array(z.enum(["pending", "approved"]))
          .optional()
          .default(["approved"]),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.startDate > input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "startDate must be <= endDate.",
        });
      }

      const teamMembers = await db.query.users.findMany({
        where: and(
          eq(users.organizationId, ctx.user.organizationId),
          ctx.user.departmentId
            ? eq(users.departmentId, ctx.user.departmentId)
            : undefined
        ),
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          departmentId: true,
        },
      });

      if (!teamMembers.length) return [];

      const teamIdSet = new Set(teamMembers.map((u) => u.id));

      const statusFilters = input.includeStatuses.map((s) =>
        eq(leaveRequests.status, s)
      );

      const requests = await db.query.leaveRequests.findMany({
        where: and(
          lte(leaveRequests.startDate, input.endDate),
          gte(leaveRequests.endDate, input.startDate),
          or(...statusFilters)
        ),
        with: {
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              departmentId: true,
            },
          },
          leaveType: { columns: { id: true, name: true } },
        },
      });

      return requests.filter((r) => teamIdSet.has(r.userId));
    }),

  /**
   * Coverage heatmap: for each calendar date in the range, returns how many
   * approved team-member leaves overlap that date.
   * Returns [{ date: "YYYY-MM-DD", count: number }] sorted ascending.
   */
  getCoverageHeatmap: protectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.startDate > input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "startDate must be <= endDate.",
        });
      }

      const teamMembers = await db.query.users.findMany({
        where: and(
          eq(users.organizationId, ctx.user.organizationId),
          ctx.user.departmentId
            ? eq(users.departmentId, ctx.user.departmentId)
            : undefined
        ),
        columns: { id: true },
      });

      if (!teamMembers.length) return [];

      const teamIdSet = new Set(teamMembers.map((u) => u.id));

      const requests = await db.query.leaveRequests.findMany({
        where: and(
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, input.endDate),
          gte(leaveRequests.endDate, input.startDate)
        ),
        columns: { userId: true, startDate: true, endDate: true },
      });

      const teamRequests = requests.filter((r) => teamIdSet.has(r.userId));
      if (!teamRequests.length) return [];

      function* datesBetween(start: string, end: string) {
        const cur = new Date(start + "T00:00:00Z");
        const last = new Date(end + "T00:00:00Z");
        while (cur <= last) {
          yield cur.toISOString().slice(0, 10);
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }

      const countMap = new Map<string, number>();

      for (const req of teamRequests) {
        const reqStart = req.startDate.toString();
        const reqEnd = req.endDate.toString();
        const clampedStart =
          reqStart < input.startDate ? input.startDate : reqStart;
        const clampedEnd = reqEnd > input.endDate ? input.endDate : reqEnd;

        for (const date of datesBetween(clampedStart, clampedEnd)) {
          countMap.set(date, (countMap.get(date) ?? 0) + 1);
        }
      }

      return Array.from(countMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }),

  /**
   * Returns all team members that have a birthday set, with their name and birthday.
   * The caller is responsible for filtering by the visible date range.
   */
  getTeamBirthdays: protectedProcedure.query(async ({ ctx }) => {
    const members = await db.query.users.findMany({
      where: and(
        eq(users.organizationId, ctx.user.organizationId),
        ctx.user.departmentId
          ? eq(users.departmentId, ctx.user.departmentId)
          : undefined
      ),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        birthday: true,
      },
    });

    return members
      .filter((m) => m.birthday !== null)
      .map((m) => {
        // Drizzle returns `date` columns as Date objects via postgres-js.
        // Normalize to YYYY-MM-DD string so .slice(5) gives MM-DD on the client.
        const raw = m.birthday as unknown;
        const birthday = raw instanceof Date
          ? raw.toISOString().slice(0, 10)
          : String(raw).slice(0, 10);
        return { id: m.id, firstName: m.firstName, lastName: m.lastName, birthday };
      });
  }),
});
