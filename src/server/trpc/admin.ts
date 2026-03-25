import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { adminProcedure, router } from "./trpc";
import { db } from "@/server/db";
import {
  auditLog,
  blackoutPeriods,
  departments,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  organizations,
  policyRules,
  users,
} from "@/server/db/schema";
import { hashPassword, sendWelcomeEmail } from "@/server/services/user-service";
import { appendAuditLog, AUDIT_ACTIONS } from "@/server/services/audit-service";
import { notifyAdminCancelledRequest, notifyAdminEditedRequest } from "@/server/services/notification-service";
import { editLeaveRequest } from "@/server/services/leave-service";
import type { UserRole } from "@/lib/types";
import { formatDate } from "@/lib/date-utils";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Generates a temporary password that satisfies the complexity policy:
 * ≥12 chars, upper, lower, digit, special.
 */
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%";
  const all = upper + lower + digits + special;

  const bytes = randomBytes(16);
  let pwd =
    upper[bytes[0] % upper.length] +
    lower[bytes[1] % lower.length] +
    digits[bytes[2] % digits.length] +
    special[bytes[3] % special.length];

  for (let i = 4; i < 16; i++) {
    pwd += all[bytes[i] % all.length];
  }

  // Fisher-Yates shuffle using random bytes
  const arr = pwd.split("");
  const shuffleBytes = randomBytes(arr.length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

// ---------------------------------------------------------------------------
// Admin router
// ---------------------------------------------------------------------------

export const adminRouter = router({
  // =========================================================================
  // User Management
  // =========================================================================

  listUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.enum(["employee", "manager", "admin", "super_admin"]).optional(),
        departmentId: z.string().uuid().optional(),
        employmentStatus: z
          .enum(["active", "inactive", "on_leave", "terminated"])
          .optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(25),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 25;
      const offset = (page - 1) * limit;

      const conditions = [
        eq(users.organizationId, ctx.user.organizationId),
        ...(input?.search
          ? [
              or(
                ilike(users.firstName, `%${input.search}%`),
                ilike(users.lastName, `%${input.search}%`),
                ilike(users.email, `%${input.search}%`)
              ),
            ]
          : []),
        ...(input?.role ? [eq(users.role, input.role)] : []),
        ...(input?.departmentId
          ? [eq(users.departmentId, input.departmentId)]
          : []),
        ...(input?.employmentStatus
          ? [eq(users.employmentStatus, input.employmentStatus)]
          : []),
      ];

      const [rows, countResult] = await Promise.all([
        db.query.users.findMany({
          where: and(...conditions),
          with: { department: { columns: { id: true, name: true } } },
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            employmentStatus: true,
            hireDate: true,
            departmentId: true,
            managerId: true,
            mustChangePassword: true,
            createdAt: true,
          },
          orderBy: [asc(users.lastName), asc(users.firstName)],
          limit,
          offset,
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(and(...conditions)),
      ]);

      const total = countResult[0]?.count ?? 0;
      return { items: rows, total, page, pages: Math.ceil(total / limit) };
    }),

  getUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await db.query.users.findFirst({
        where: and(
          eq(users.id, input.userId),
          eq(users.organizationId, ctx.user.organizationId)
        ),
        with: {
          department: true,
          leaveBalances: { with: { leaveType: true } },
          leaveRequests: {
            orderBy: [desc(leaveRequests.createdAt)],
            limit: 50,
            with: { leaveType: { columns: { id: true, name: true } } },
          },
        },
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          employmentStatus: true,
          hireDate: true,
          departmentId: true,
          managerId: true,
          mustChangePassword: true,
          lastPasswordChange: true,
          notificationPreferences: true,
          birthday: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),

  createUser: adminProcedure
    .input(
      z.object({
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        email: z.string().email().toLowerCase(),
        role: z
          .enum(["employee", "manager", "admin", "super_admin"])
          .default("employee"),
        departmentId: z.string().uuid().optional(),
        managerId: z.string().uuid().optional(),
        hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        initialAnnualLeaveDays: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const today = new Date().toISOString().slice(0, 10);

      const [newUser] = await db
        .insert(users)
        .values({
          organizationId: ctx.user.organizationId,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          departmentId: input.departmentId ?? null,
          managerId: input.managerId ?? null,
          hireDate: input.hireDate ?? today,
          birthday: input.birthday ?? null,
          mustChangePassword: true,
        })
        .returning({ id: users.id });

      // Initialise leave balances for current year based on org leave types
      const orgLeaveTypes = await db.query.leaveTypes.findMany({
        where: and(
          eq(leaveTypes.organizationId, ctx.user.organizationId),
          eq(leaveTypes.isActive, true)
        ),
      });

      const year = new Date().getFullYear();
      const monthsRemaining = 12 - new Date().getMonth(); // rough pro-rate

      if (orgLeaveTypes.length > 0) {
        await db.insert(leaveBalances).values(
          orgLeaveTypes.map((lt) => {
            let entitlement: number;
            const annual = parseFloat(lt.defaultAnnualDays);
            if (lt.accrualMethod === "front_loaded") {
              // Allow admin override for front-loaded types (e.g. vacation)
              entitlement = input.initialAnnualLeaveDays ?? annual;
            } else if (lt.accrualMethod === "monthly") {
              entitlement = parseFloat(
                ((annual / 12) * monthsRemaining).toFixed(2)
              );
            } else {
              // as_needed — no upfront balance
              entitlement = 0;
            }
            return {
              userId: newUser.id,
              leaveTypeId: lt.id,
              year,
              totalEntitled: entitlement.toFixed(2),
            };
          })
        );
      }

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.USER_CREATED,
        entityType: "user",
        entityId: newUser.id,
        newValues: {
          email: input.email,
          role: input.role,
          departmentId: input.departmentId,
        },
      });

      // Send welcome email with login instructions. Fire-and-forget —
      // admin still sees the temp password in the UI as a fallback.
      try {
        await sendWelcomeEmail({
          email: input.email,
          firstName: input.firstName,
          tempPassword,
        });
      } catch {
        // Non-critical — admin has the temp password on screen
      }

      return { userId: newUser.id, tempPassword };
    }),

  bulkCreateUsers: adminProcedure
    .input(
      z.object({
        users: z
          .array(
            z.object({
              firstName: z.string().min(1).max(100),
              lastName: z.string().min(1).max(100),
              email: z.string().email().toLowerCase(),
              role: z
                .enum(["employee", "manager", "admin", "super_admin"])
                .default("employee"),
              departmentId: z.string().uuid().optional(),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const today = new Date().toISOString().slice(0, 10);
      const year = new Date().getFullYear();
      const monthsRemaining = 12 - new Date().getMonth();

      const orgLeaveTypes = await db.query.leaveTypes.findMany({
        where: and(
          eq(leaveTypes.organizationId, ctx.user.organizationId),
          eq(leaveTypes.isActive, true)
        ),
      });

      // Hash all passwords in parallel — bcrypt at cost 12 is ~300 ms each.
      // Doing this serially for 50 users would take ~15 s; parallel takes ~300 ms.
      const prepared = await Promise.all(
        input.users.map(async (u) => {
          const tempPassword = generateTempPassword();
          const passwordHash = await hashPassword(tempPassword);
          return { ...u, tempPassword, passwordHash };
        })
      );

      const results: { email: string; success: boolean; tempPassword?: string; error?: string }[] = [];

      for (const u of prepared) {
        try {
          const { tempPassword, passwordHash } = u;

          const [newUser] = await db
            .insert(users)
            .values({
              organizationId: ctx.user.organizationId,
              email: u.email,
              passwordHash,
              firstName: u.firstName,
              lastName: u.lastName,
              role: u.role,
              departmentId: u.departmentId ?? null,
              managerId: null,
              hireDate: today,
              mustChangePassword: true,
            })
            .returning({ id: users.id });

          if (orgLeaveTypes.length > 0) {
            await db.insert(leaveBalances).values(
              orgLeaveTypes.map((lt) => {
                const annual = parseFloat(lt.defaultAnnualDays);
                let entitlement: number;
                if (lt.accrualMethod === "front_loaded") {
                  entitlement = annual;
                } else if (lt.accrualMethod === "monthly") {
                  entitlement = parseFloat(((annual / 12) * monthsRemaining).toFixed(2));
                } else {
                  entitlement = 0;
                }
                return {
                  userId: newUser.id,
                  leaveTypeId: lt.id,
                  year,
                  totalEntitled: entitlement.toFixed(2),
                };
              })
            );
          }

          await appendAuditLog({
            organizationId: ctx.user.organizationId,
            userId: ctx.user.id,
            action: AUDIT_ACTIONS.USER_CREATED,
            entityType: "user",
            entityId: newUser.id,
            newValues: { email: u.email, role: u.role },
          });

          try {
            await sendWelcomeEmail({ email: u.email, firstName: u.firstName, tempPassword });
          } catch {
            // Non-critical
          }

          results.push({ email: u.email, success: true, tempPassword });
        } catch (err) {
          results.push({
            email: u.email,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return { results };
    }),

  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        firstName: z.string().min(1).max(100).optional(),
        lastName: z.string().min(1).max(100).optional(),
        email: z.string().email().toLowerCase().optional(),
        role: z
          .enum(["employee", "manager", "admin", "super_admin"])
          .optional(),
        departmentId: z.string().uuid().nullable().optional(),
        managerId: z.string().uuid().nullable().optional(),

        employmentStatus: z
          .enum(["active", "inactive", "on_leave", "terminated"])
          .optional(),
        birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, ...fields } = input;

      if (
        userId === ctx.user.id &&
        (fields.employmentStatus === "terminated" || fields.employmentStatus === "inactive")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own employment status to terminated or inactive.",
        });
      }

      const existing = await db.query.users.findFirst({
        where: and(
          eq(users.id, userId),
          eq(users.organizationId, ctx.user.organizationId)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      if (!Object.keys(updates).length) return { success: true };

      await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.USER_UPDATED,
        entityType: "user",
        entityId: userId,
        oldValues: Object.fromEntries(
          Object.keys(updates).map((k) => [k, (existing as Record<string, unknown>)[k]])
        ),
        newValues: updates,
      });

      return { success: true };
    }),

  sendLoginLink: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.query.users.findFirst({
        where: and(
          eq(users.id, input.userId),
          eq(users.organizationId, ctx.user.organizationId)
        ),
        columns: { id: true, email: true, firstName: true, deletedAt: true },
      });
      if (!user || user.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      await db
        .update(users)
        .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.USER_LOGIN_LINK_SENT,
        entityType: "user",
        entityId: user.id,
        newValues: { email: user.email },
      }).catch(console.error);

      try {
        await sendWelcomeEmail({
          email: user.email,
          firstName: user.firstName,
          tempPassword,
        });
      } catch {
        // Non-critical — caller can share the temp password manually
      }

      return { tempPassword };
    }),

  bulkSendLoginLinks: adminProcedure
    .input(z.object({ userIds: z.array(z.string().uuid()).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const orgUsers = await db.query.users.findMany({
        where: and(
          inArray(users.id, input.userIds),
          eq(users.organizationId, ctx.user.organizationId),
          isNull(users.deletedAt)
        ),
        columns: { id: true, email: true, firstName: true },
      });

      // Hash all passwords in parallel before any DB writes.
      const prepared = await Promise.all(
        orgUsers.map(async (user) => {
          const tempPassword = generateTempPassword();
          const passwordHash = await hashPassword(tempPassword);
          return { ...user, tempPassword, passwordHash };
        })
      );

      const results: { userId: string; sent: boolean }[] = [];

      for (const user of prepared) {
        const { tempPassword, passwordHash } = user;

        await db
          .update(users)
          .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
          .where(eq(users.id, user.id));

        appendAuditLog({
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          action: AUDIT_ACTIONS.USER_LOGIN_LINK_SENT,
          entityType: "user",
          entityId: user.id,
          newValues: { email: user.email },
        }).catch(console.error);

        let sent = false;
        try {
          await sendWelcomeEmail({
            email: user.email,
            firstName: user.firstName,
            tempPassword,
          });
          sent = true;
        } catch {
          // continue — log per-user failure in results
        }
        results.push({ userId: user.id, sent });
      }

      return { results };
    }),

  adjustBalance: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        leaveTypeId: z.string().uuid(),
        year: z.number().int().optional(),
        adjustmentDays: z.number(), // positive = add, negative = subtract
        reason: z
          .string()
          .min(1, "A reason is required for balance adjustments."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const year = input.year ?? new Date().getFullYear();

      // Verify the target user belongs to this admin's organisation
      const targetUser = await db.query.users.findFirst({
        where: and(
          eq(users.id, input.userId),
          eq(users.organizationId, ctx.user.organizationId)
        ),
        columns: { id: true },
      });
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

      const balance = await db.query.leaveBalances.findFirst({
        where: and(
          eq(leaveBalances.userId, input.userId),
          eq(leaveBalances.leaveTypeId, input.leaveTypeId),
          eq(leaveBalances.year, year)
        ),
      });
      if (!balance) throw new TRPCError({ code: "NOT_FOUND", message: "Balance record not found." });

      const oldAdjusted = parseFloat(balance.adjusted);
      const newAdjusted = oldAdjusted + input.adjustmentDays;

      await db
        .update(leaveBalances)
        .set({ adjusted: newAdjusted.toFixed(2) })
        .where(eq(leaveBalances.id, balance.id));

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.BALANCE_ADJUSTED,
        entityType: "leave_balance",
        entityId: balance.id,
        oldValues: { adjusted: oldAdjusted },
        newValues: { adjusted: newAdjusted },
        metadata: { reason: input.reason, targetUserId: input.userId },
      });

      return { success: true, newAdjusted };
    }),

  deactivateUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot deactivate your own account.",
        });
      }

      const target = await db.query.users.findFirst({
        where: and(
          eq(users.id, input.userId),
          eq(users.organizationId, ctx.user.organizationId)
        ),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // Cancel all pending requests and restore balances
      const pendingRequests = await db.query.leaveRequests.findMany({
        where: and(
          eq(leaveRequests.userId, input.userId),
          eq(leaveRequests.status, "pending")
        ),
      });

      await db.transaction(async (tx) => {
        for (const req of pendingRequests) {
          await tx
            .update(leaveRequests)
            .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
            .where(eq(leaveRequests.id, req.id));

          const year = parseInt(req.startDate.toString().substring(0, 4), 10);
          await tx
            .update(leaveBalances)
            .set({
              pending: sql`GREATEST(0, ${leaveBalances.pending} - ${parseFloat(req.totalBusinessDays)})`,
            })
            .where(
              and(
                eq(leaveBalances.userId, input.userId),
                eq(leaveBalances.leaveTypeId, req.leaveTypeId),
                eq(leaveBalances.year, year)
              )
            );
        }

        await tx
          .update(users)
          .set({
            employmentStatus: "terminated",
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, input.userId));
      });

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.USER_DEACTIVATED,
        entityType: "user",
        entityId: input.userId,
        metadata: {
          reason: input.reason ?? null,
          cancelledRequests: pendingRequests.length,
        },
      });

      return { success: true, cancelledRequests: pendingRequests.length };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account." });
      }

      const target = await db.query.users.findFirst({
        where: and(
          eq(users.id, input.userId),
          eq(users.organizationId, ctx.user.organizationId)
        ),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // Cancel pending requests, restore balances, then delete — all in one transaction
      const pendingReqs = await db.query.leaveRequests.findMany({
        where: and(
          eq(leaveRequests.userId, input.userId),
          eq(leaveRequests.status, "pending")
        ),
        columns: { id: true, leaveTypeId: true, startDate: true, totalBusinessDays: true },
      });

      await db.transaction(async (tx) => {
        for (const req of pendingReqs) {
          await tx
            .update(leaveRequests)
            .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
            .where(eq(leaveRequests.id, req.id));

          const year = parseInt(req.startDate.toString().substring(0, 4), 10);
          await tx
            .update(leaveBalances)
            .set({
              pending: sql`GREATEST(0, ${leaveBalances.pending} - ${parseFloat(req.totalBusinessDays)})`,
            })
            .where(
              and(
                eq(leaveBalances.userId, input.userId),
                eq(leaveBalances.leaveTypeId, req.leaveTypeId),
                eq(leaveBalances.year, year)
              )
            );
        }

        await tx.delete(users).where(eq(users.id, input.userId));
      });

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.USER_DEACTIVATED,
        entityType: "user",
        entityId: input.userId,
        metadata: { permanentDelete: true, name: `${target.firstName} ${target.lastName}` },
      });

      return { success: true };
    }),

  // =========================================================================
  // Department Management
  // =========================================================================

  listDepartments: adminProcedure.query(async ({ ctx }) => {
    return db.query.departments.findMany({
      where: and(
        eq(departments.organizationId, ctx.user.organizationId)
      ),
      orderBy: [asc(departments.name)],
      with: {
        parent: { columns: { id: true, name: true } },
      },
    });
  }),

  createDepartment: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        minCoverage: z.number().int().min(0).optional(),
        totalHeadcount: z.number().int().min(0).default(0),
        parentId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [dept] = await db
        .insert(departments)
        .values({
          organizationId: ctx.user.organizationId,
          name: input.name,
          minCoverage: input.minCoverage ?? null,
          totalHeadcount: input.totalHeadcount,
          parentId: input.parentId ?? null,
        })
        .returning();

      return dept;
    }),

  updateDepartment: adminProcedure
    .input(
      z.object({
        departmentId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        minCoverage: z.number().int().min(0).nullable().optional(),
        totalHeadcount: z.number().int().min(0).optional(),
        parentId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { departmentId, ...fields } = input;

      const dept = await db.query.departments.findFirst({
        where: and(
          eq(departments.id, departmentId),
          eq(departments.organizationId, ctx.user.organizationId)
        ),
      });
      if (!dept) throw new TRPCError({ code: "NOT_FOUND" });

      // Prevent self-parent and transitive cycles (A→B→C→A).
      // Walk the ancestor chain of the proposed new parentId; if departmentId
      // appears anywhere in it, accepting this change would create a cycle.
      if (fields.parentId !== undefined && fields.parentId !== null) {
        if (fields.parentId === departmentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A department cannot be its own parent." });
        }

        const cycleCheck = await db.execute(sql`
          WITH RECURSIVE ancestors(id, parent_id, depth) AS (
            SELECT id, parent_id, 0
            FROM departments
            WHERE id = ${fields.parentId}
              AND organization_id = ${ctx.user.organizationId}
            UNION ALL
            SELECT d.id, d.parent_id, a.depth + 1
            FROM departments d
            JOIN ancestors a ON d.id = a.parent_id
            WHERE a.parent_id IS NOT NULL AND a.depth < 20
          )
          SELECT 1 AS found FROM ancestors WHERE id = ${departmentId} LIMIT 1
        `);

        if (cycleCheck.rows.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Setting this parent would create a circular hierarchy.",
          });
        }
      }

      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined)
      );
      if (!Object.keys(updates).length) return { success: true };

      await db
        .update(departments)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(departments.id, departmentId));

      return { success: true };
    }),

  // =========================================================================
  // Leave Types
  // =========================================================================

  listLeaveTypes: adminProcedure.query(async ({ ctx }) => {
    return db.query.leaveTypes.findMany({
      where: eq(leaveTypes.organizationId, ctx.user.organizationId),
      orderBy: [asc(leaveTypes.name)],
    });
  }),

  createLeaveType: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        defaultAnnualDays: z.number().min(0),
        accrualMethod: z.enum(["front_loaded", "as_needed"]).default("front_loaded"),
        maxCarryoverDays: z.number().min(0).default(0),
        requiresDocumentation: z.boolean().default(false),
        isPaid: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [lt] = await db
        .insert(leaveTypes)
        .values({
          organizationId: ctx.user.organizationId,
          name: input.name,
          defaultAnnualDays: input.defaultAnnualDays.toFixed(2),
          accrualMethod: input.accrualMethod,
          maxCarryoverDays: "0.00",
          requiresDocumentation: input.requiresDocumentation,
          isPaid: input.isPaid,
        })
        .returning();

      return lt;
    }),

  updateLeaveType: adminProcedure
    .input(
      z.object({
        leaveTypeId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        defaultAnnualDays: z.number().min(0).optional(),
        maxCarryoverDays: z.number().min(0).optional(),
        requiresDocumentation: z.boolean().optional(),
        isPaid: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { leaveTypeId, ...fields } = input;

      const lt = await db.query.leaveTypes.findFirst({
        where: and(
          eq(leaveTypes.id, leaveTypeId),
          eq(leaveTypes.organizationId, ctx.user.organizationId)
        ),
      });
      if (!lt) throw new TRPCError({ code: "NOT_FOUND" });

      const updates: Record<string, unknown> = {};
      if (fields.name !== undefined) updates.name = fields.name;
      if (fields.defaultAnnualDays !== undefined)
        updates.defaultAnnualDays = fields.defaultAnnualDays.toFixed(2);
      updates.maxCarryoverDays = "0.00";
      if (fields.requiresDocumentation !== undefined)
        updates.requiresDocumentation = fields.requiresDocumentation;
      if (fields.isPaid !== undefined) updates.isPaid = fields.isPaid;
      if (fields.isActive !== undefined) updates.isActive = fields.isActive;

      if (!Object.keys(updates).length) return { success: true };

      await db
        .update(leaveTypes)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(leaveTypes.id, leaveTypeId));

      return { success: true };
    }),

  deleteLeaveType: adminProcedure
    .input(z.object({ leaveTypeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const lt = await db.query.leaveTypes.findFirst({
        where: and(
          eq(leaveTypes.id, input.leaveTypeId),
          eq(leaveTypes.organizationId, ctx.user.organizationId)
        ),
      });
      if (!lt) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .delete(leaveTypes)
        .where(eq(leaveTypes.id, input.leaveTypeId));

      return { success: true };
    }),

  // =========================================================================
  // Policy Rules
  // =========================================================================

  listPolicyRules: adminProcedure
    .input(
      z.object({
        ruleType: z
          .enum(["advance_notice", "consecutive_cap", "coverage_min", "blackout", "balance_override"])
          .optional(),
        departmentId: z.string().uuid().optional(),
        activeOnly: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const today = formatDate(new Date());
      return db.query.policyRules.findMany({
        where: and(
          eq(policyRules.organizationId, ctx.user.organizationId),
          input?.ruleType ? eq(policyRules.ruleType, input.ruleType) : undefined,
          input?.departmentId
            ? eq(policyRules.departmentId, input.departmentId)
            : undefined,
          input?.activeOnly !== false ? eq(policyRules.isActive, true) : undefined,
          input?.activeOnly !== false ? lte(policyRules.effectiveFrom, today) : undefined,
          input?.activeOnly !== false
            ? or(isNull(policyRules.effectiveUntil), gte(policyRules.effectiveUntil, today))
            : undefined
        ),
        orderBy: [desc(policyRules.priority), desc(policyRules.createdAt)],
      });
    }),

  createPolicyRule: adminProcedure
    .input(
      z.object({
        departmentId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        ruleType: z.enum([
          "advance_notice",
          "consecutive_cap",
          "coverage_min",
          "blackout",
          "balance_override",
        ]),
        parameters: z.record(z.string(), z.unknown()),
        priority: z.number().int().default(0),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        effectiveUntil: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [rule] = await db
        .insert(policyRules)
        .values({
          organizationId: ctx.user.organizationId,
          departmentId: input.departmentId ?? null,
          userId: input.userId ?? null,
          ruleType: input.ruleType,
          parameters: input.parameters,
          priority: input.priority,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil ?? null,
          isActive: true,
          createdBy: ctx.user.id,
        })
        .returning();

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.POLICY_CREATED,
        entityType: "policy_rule",
        entityId: rule.id,
        newValues: { ruleType: input.ruleType, parameters: input.parameters },
      });

      return rule;
    }),

  /**
   * Versions a policy rule: expire the current one and create a replacement.
   * Returns the new rule.
   */
  updatePolicyRule: adminProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        parameters: z.record(z.string(), z.unknown()),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        effectiveUntil: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        priority: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.query.policyRules.findFirst({
        where: and(
          eq(policyRules.id, input.ruleId),
          eq(policyRules.organizationId, ctx.user.organizationId)
        ),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(policyRules)
        .set({
          parameters: input.parameters,
          priority: input.priority ?? existing.priority,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil ?? null,
          updatedAt: new Date(),
        })
        .where(eq(policyRules.id, input.ruleId));

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.POLICY_UPDATED,
        entityType: "policy_rule",
        entityId: existing.id,
        oldValues: {
          ruleId: existing.id,
          parameters: existing.parameters,
        },
        newValues: {
          ruleId: existing.id,
          parameters: input.parameters,
          effectiveFrom: input.effectiveFrom,
        },
      });

      return { success: true };
    }),

  deletePolicyRule: adminProcedure
    .input(z.object({ ruleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await db.query.policyRules.findFirst({
        where: and(
          eq(policyRules.id, input.ruleId),
          eq(policyRules.organizationId, ctx.user.organizationId)
        ),
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });

      await db.delete(policyRules).where(eq(policyRules.id, input.ruleId));

      return { success: true };
    }),

  // =========================================================================
  // Blackout Periods
  // =========================================================================

  listBlackoutPeriods: adminProcedure.query(async ({ ctx }) => {
    return db.query.blackoutPeriods.findMany({
      where: eq(blackoutPeriods.organizationId, ctx.user.organizationId),
      orderBy: [asc(blackoutPeriods.startDate)],
    });
  }),

  createBlackoutPeriod: adminProcedure
    .input(
      z.object({
        departmentId: z.string().uuid().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().max(500).optional(),
        severity: z.enum(["soft_block", "hard_block"]).default("soft_block"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.startDate > input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start date must be before or equal to end date.",
        });
      }

      const [period] = await db
        .insert(blackoutPeriods)
        .values({
          organizationId: ctx.user.organizationId,
          departmentId: input.departmentId ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason ?? null,
          severity: input.severity,
          createdBy: ctx.user.id,
        })
        .returning();

      return period;
    }),

  deleteBlackoutPeriod: adminProcedure
    .input(z.object({ blackoutPeriodId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const period = await db.query.blackoutPeriods.findFirst({
        where: and(
          eq(blackoutPeriods.id, input.blackoutPeriodId),
          eq(blackoutPeriods.organizationId, ctx.user.organizationId)
        ),
      });
      if (!period) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .delete(blackoutPeriods)
        .where(eq(blackoutPeriods.id, input.blackoutPeriodId));

      return { success: true };
    }),

  // =========================================================================
  // Organization Settings
  // =========================================================================

  getOrgSettings: adminProcedure.query(async ({ ctx }) => {
    const org = ctx.user.organization;
    if (!org) throw new TRPCError({ code: "NOT_FOUND" });
    return org;
  }),

  updateOrgSettings: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200).optional(),
        timezone: z.string().optional(),
        fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
        workSchedule: z
          .object({ workDays: z.array(z.number().int().min(1).max(7)) })
          .optional(),
        holidayCalendar: z
          .object({ holidays: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string() })) })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates = Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined)
      );
      if (!Object.keys(updates).length) return { success: true };

      await db
        .update(organizations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organizations.id, ctx.user.organizationId));

      return { success: true };
    }),

  // =========================================================================
  // All Leave Requests (admin view)
  // =========================================================================

  listAllLeaveRequests: adminProcedure
    .input(
      z.object({
        status: z.enum(["draft", "pending", "approved", "denied", "cancelled", "expired"]).optional(),
        departmentId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(25),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 25;
      const offset = (page - 1) * limit;

      // Get all user IDs in this org (optionally filtered by dept)
      const orgUsers = await db.query.users.findMany({
        where: and(
          eq(users.organizationId, ctx.user.organizationId),
          input?.departmentId ? eq(users.departmentId, input.departmentId) : undefined
        ),
        columns: { id: true },
      });
      const userIds = orgUsers.map((u) => u.id);
      if (!userIds.length) return { items: [], total: 0, page, pages: 0 };

      const statusCondition = input?.status ? eq(leaveRequests.status, input.status) : undefined;

      const [items, countResult] = await Promise.all([
        db.query.leaveRequests.findMany({
          where: and(inArray(leaveRequests.userId, userIds), statusCondition),
          orderBy: [desc(leaveRequests.createdAt)],
          limit,
          offset,
          with: {
            user: { columns: { id: true, firstName: true, lastName: true } },
            leaveType: { columns: { id: true, name: true } },
          },
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(leaveRequests)
          .where(and(inArray(leaveRequests.userId, userIds), statusCondition)),
      ]);

      const total = countResult[0]?.count ?? 0;
      return { items, total, page, pages: Math.ceil(total / limit) };
    }),

  // =========================================================================
  // Admin cancel leave request
  // =========================================================================

  cancelLeaveRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.leaveRequests.findFirst({
        where: and(
          eq(leaveRequests.id, input.requestId),
          eq(leaveRequests.status, "approved")
        ),
        with: { user: { columns: { id: true, organizationId: true } } },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approved leave request not found.",
        });
      }

      if (request.user.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const year = parseInt(request.startDate.toString().substring(0, 4), 10);
      const days = parseFloat(request.totalBusinessDays);

      await db.transaction(async (tx) => {
        await tx
          .update(leaveRequests)
          .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(leaveRequests.id, input.requestId));

        // Restore used balance
        await tx
          .update(leaveBalances)
          .set({ used: sql`GREATEST(0, ${leaveBalances.used} - ${days})` })
          .where(
            and(
              eq(leaveBalances.userId, request.userId),
              eq(leaveBalances.leaveTypeId, request.leaveTypeId),
              eq(leaveBalances.year, year)
            )
          );
      });

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: AUDIT_ACTIONS.LEAVE_CANCELLED,
        entityType: "leave_request",
        entityId: input.requestId,
        metadata: {
          cancelledBy: "admin",
          adminId: ctx.user.id,
          reason: input.reason,
          affectedUserId: request.userId,
          days,
        },
      });

      notifyAdminCancelledRequest(input.requestId, ctx.user.id, input.reason).catch(console.error);

      return { success: true };
    }),

  // =========================================================================
  // Admin edit leave request
  // =========================================================================

  editLeaveRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.startDate > input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start date must be before or equal to end date.",
        });
      }

      // Verify the request belongs to the same org
      const existing = await db.query.leaveRequests.findFirst({
        where: eq(leaveRequests.id, input.requestId),
        with: { user: { columns: { id: true, organizationId: true } } },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      }

      if (existing.user.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const org = ctx.user.organization;

      const workSchedule = org?.workSchedule as
        | { workDays: number[] }
        | null
        | undefined;
      const holidayCalendar = org?.holidayCalendar as
        | { holidays: { date: string; name: string }[] }
        | null
        | undefined;

      const result = await editLeaveRequest({
        requestId: input.requestId,
        actorId: ctx.user.id,
        isAdmin: true,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        workSchedule: workSchedule ?? null,
        holidays: holidayCalendar?.holidays?.map((h) => h.date) ?? null,
      });

      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }

      await appendAuditLog({
        organizationId: ctx.user.organizationId,
        userId: ctx.user.id,
        action: "leave_request.edited",
        entityType: "leave_request",
        entityId: input.requestId,
        metadata: {
          editedBy: "admin",
          adminId: ctx.user.id,
          startDate: input.startDate,
          endDate: input.endDate,
        },
      });

      notifyAdminEditedRequest(input.requestId, ctx.user.id).catch(console.error);

      return { success: true };
    }),

  // =========================================================================
  // Audit Log
  // =========================================================================

  getAuditLog: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid().optional(),
        action: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().uuid().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      const conditions = [
        eq(auditLog.organizationId, ctx.user.organizationId),
        ...(input?.userId ? [eq(auditLog.userId, input.userId)] : []),
        ...(input?.action ? [eq(auditLog.action, input.action)] : []),
        ...(input?.entityType
          ? [eq(auditLog.entityType, input.entityType)]
          : []),
        ...(input?.entityId ? [eq(auditLog.entityId, input.entityId)] : []),
        ...(input?.dateFrom
          ? [gte(auditLog.timestamp, new Date(input.dateFrom))]
          : []),
        ...(input?.dateTo
          ? [lte(auditLog.timestamp, new Date(input.dateTo + "T23:59:59Z"))]
          : []),
      ];

      const [rows, countResult] = await Promise.all([
        db.query.auditLog.findMany({
          where: and(...conditions),
          orderBy: [desc(auditLog.timestamp)],
          limit,
          offset,
          with: {
            user: { columns: { id: true, firstName: true, lastName: true } },
          },
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(and(...conditions)),
      ]);

      const total = countResult[0]?.count ?? 0;
      return { items: rows, total, page, pages: Math.ceil(total / limit) };
    }),

  // =========================================================================
  // Reports
  // =========================================================================

  generateReport: adminProcedure
    .input(
      z.object({
        type: z.enum([
          "pto_utilization",
          "approval_turnaround",
          "override_frequency",
          "balance_liability",
          "absenteeism",
        ]),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        departmentId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;

      // Fetch org users scoped to this report's department filter (if any)
      const orgUserQuery = await db.query.users.findMany({
        where: and(
          eq(users.organizationId, orgId),
          input.departmentId
            ? eq(users.departmentId, input.departmentId)
            : undefined
        ),
        columns: { id: true, departmentId: true },
      });
      const userIds = orgUserQuery.map((u) => u.id);

      if (input.type === "pto_utilization") {
        // Sum approved leave days per department per leave type
        if (!userIds.length) return { type: input.type, rows: [] };

        const rows = await db
          .select({
            departmentId: users.departmentId,
            leaveTypeId: leaveRequests.leaveTypeId,
            totalUsedDays: sql<number>`SUM(${leaveRequests.totalBusinessDays}::numeric)::float`,
            requestCount: sql<number>`COUNT(*)::int`,
          })
          .from(leaveRequests)
          .innerJoin(users, eq(leaveRequests.userId, users.id))
          .where(
            and(
              inArray(leaveRequests.userId, userIds),
              eq(leaveRequests.status, "approved"),
              input.dateFrom
                ? gte(leaveRequests.startDate, input.dateFrom)
                : undefined,
              input.dateTo
                ? lte(leaveRequests.endDate, input.dateTo)
                : undefined
            )
          )
          .groupBy(users.departmentId, leaveRequests.leaveTypeId);

        return { type: input.type, rows };
      }

      if (input.type === "approval_turnaround") {
        const rows = await db
          .select({
            averageHours: sql<number>`AVG(EXTRACT(EPOCH FROM (${leaveRequests.decidedAt} - ${leaveRequests.submittedAt}))/3600)::float`,
            medianHours: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (${leaveRequests.decidedAt} - ${leaveRequests.submittedAt}))/3600)::float`,
            p95Hours: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (${leaveRequests.decidedAt} - ${leaveRequests.submittedAt}))/3600)::float`,
            totalRequests: sql<number>`COUNT(*)::int`,
          })
          .from(leaveRequests)
          .innerJoin(users, eq(leaveRequests.userId, users.id))
          .where(
            and(
              eq(users.organizationId, orgId),
              or(
                eq(leaveRequests.status, "approved"),
                eq(leaveRequests.status, "denied")
              ),
              input.departmentId
                ? eq(users.departmentId, input.departmentId)
                : undefined,
              input.dateFrom
                ? gte(leaveRequests.decidedAt, new Date(input.dateFrom))
                : undefined,
              input.dateTo
                ? lte(leaveRequests.decidedAt, new Date(input.dateTo))
                : undefined
            )
          );

        return { type: input.type, stats: rows[0] ?? null };
      }

      if (input.type === "override_frequency") {
        const rows = await db
          .select({
            userId: auditLog.userId,
            overrideCount: sql<number>`COUNT(*)::int`,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.organizationId, orgId),
              eq(auditLog.action, AUDIT_ACTIONS.LEAVE_OVERRIDE_APPROVED),
              input.dateFrom
                ? gte(auditLog.timestamp, new Date(input.dateFrom))
                : undefined,
              input.dateTo
                ? lte(auditLog.timestamp, new Date(input.dateTo))
                : undefined
            )
          )
          .groupBy(auditLog.userId)
          .orderBy(desc(sql`COUNT(*)`));

        return { type: input.type, rows };
      }

      if (input.type === "balance_liability") {
        // Return unused paid-leave balance per employee (proxy for financial liability)
        if (!userIds.length) return { type: input.type, rows: [] };

        const year = new Date().getFullYear();
        const rows = await db
          .select({
            userId: leaveBalances.userId,
            leaveTypeId: leaveBalances.leaveTypeId,
            remainingDays: sql<number>`(
              ${leaveBalances.totalEntitled}::numeric +
              ${leaveBalances.carriedOver}::numeric +
              ${leaveBalances.adjusted}::numeric -
              ${leaveBalances.used}::numeric -
              ${leaveBalances.pending}::numeric
            )::float`,
          })
          .from(leaveBalances)
          .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
          .where(
            and(
              inArray(leaveBalances.userId, userIds),
              eq(leaveBalances.year, year),
              eq(leaveTypes.isPaid, true)
            )
          )
          .orderBy(asc(leaveBalances.userId));

        return { type: input.type, rows };
      }

      if (input.type === "absenteeism") {
        if (!userIds.length) return { type: input.type, rows: [] };

        const rows = await db
          .select({
            year: sql<number>`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date)::int`,
            month: sql<number>`EXTRACT(MONTH FROM ${leaveRequests.startDate}::date)::int`,
            departmentId: users.departmentId,
            totalDays: sql<number>`SUM(${leaveRequests.totalBusinessDays}::numeric)::float`,
            requestCount: sql<number>`COUNT(*)::int`,
          })
          .from(leaveRequests)
          .innerJoin(users, eq(leaveRequests.userId, users.id))
          .where(
            and(
              inArray(leaveRequests.userId, userIds),
              eq(leaveRequests.status, "approved"),
              input.dateFrom
                ? gte(leaveRequests.startDate, input.dateFrom)
                : undefined,
              input.dateTo
                ? lte(leaveRequests.startDate, input.dateTo)
                : undefined
            )
          )
          .groupBy(
            sql`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date)`,
            sql`EXTRACT(MONTH FROM ${leaveRequests.startDate}::date)`,
            users.departmentId
          )
          .orderBy(
            sql`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date)`,
            sql`EXTRACT(MONTH FROM ${leaveRequests.startDate}::date)`
          );

        return { type: input.type, rows };
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown report type." });
    }),
});
