import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "./trpc";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { getUserById } from "@/server/services/user-service";
import {
  approveRequest,
  denyRequest,
  escalateRequest,
  getPendingQueue,
  overrideRequest,
} from "@/server/services/approval-service";
import type { UserRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// Protected procedure — requires authenticated session
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

/** Middleware that additionally enforces manager-or-above role */
const approverProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role as UserRole;
  if (!["manager", "admin", "super_admin"].includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only managers and admins can access the approval queue.",
    });
  }
  return next({ ctx });
});

// ---------------------------------------------------------------------------
// Approval router
// ---------------------------------------------------------------------------

export const approvalRouter = router({
  /**
   * Returns the pending approval queue for the current approver.
   * Managers see their direct reports' requests; admins see all.
   */
  getPendingQueue: approverProcedure.query(async ({ ctx }) => {
    return getPendingQueue(
      ctx.user.id,
      ctx.user.role as UserRole,
      ctx.user.organizationId
    );
  }),

  /**
   * Approve a pending leave request.
   * Optionally supply a comment.
   */
  approve: approverProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        comment: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await approveRequest(
          input.requestId,
          ctx.user.id,
          ctx.user.role as UserRole,
          ctx.user.organizationId,
          input.comment
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Approval failed.",
        });
      }
    }),

  /**
   * Deny a pending leave request.
   * A non-empty comment is mandatory.
   */
  deny: approverProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        comment: z.string().min(1, "A reason is required when denying a request."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await denyRequest(
          input.requestId,
          ctx.user.id,
          ctx.user.role as UserRole,
          ctx.user.organizationId,
          input.comment
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Denial failed.",
        });
      }
    }),

  /**
   * Manually escalate a request to the next approval tier.
   */
  escalate: approverProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await escalateRequest(
          input.requestId,
          ctx.user.id,
          ctx.user.role as UserRole,
          ctx.user.organizationId
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Escalation failed.",
        });
      }
    }),

  /**
   * Override policy violations and force-approve a request.
   * Reason must be at least 20 characters. Manager+ only.
   */
  override: approverProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        reason: z
          .string()
          .min(20, "Override reason must be at least 20 characters."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await overrideRequest(
          input.requestId,
          ctx.user.id,
          ctx.user.role as UserRole,
          ctx.user.organizationId,
          input.reason
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Override failed.",
        });
      }
    }),
});
