import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./trpc";
import {
  cancelLeaveRequest,
  editLeaveRequest,
  getLeaveBalances,
  getMyRequests,
  getRequestById,
  submitLeaveRequest,
} from "@/server/services/leave-service";

// ---------------------------------------------------------------------------
// Leave router
// ---------------------------------------------------------------------------

export const leaveRouter = router({
  /**
   * Get leave balances for the current user.
   * Optionally specify a year; defaults to the current year.
   */
  getBalances: protectedProcedure
    .input(z.object({ year: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getLeaveBalances(ctx.user.id, input?.year);
    }),

  /**
   * Submit a leave request.
   * Runs all 7 policy validators before creating the request.
   * Returns { success: true, request, warnings } or { success: false, errors, warnings }.
   */
  submitRequest: protectedProcedure
    .input(
      z.object({
        leaveTypeId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        reason: z.string().max(1000).optional(),
        documentIds: z.array(z.string().uuid()).optional(),
        forceSubmit: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.startDate > input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start date must be before or equal to end date.",
        });
      }

      const workSchedule = ctx.user.organization?.workSchedule as
        | { workDays: number[] }
        | null
        | undefined;
      const holidayCalendar = ctx.user.organization?.holidayCalendar as
        | { holidays: { date: string; name: string }[] }
        | null
        | undefined;

      return submitLeaveRequest({
        userId: ctx.user.id,
        organizationId: ctx.user.organizationId,
        departmentId: ctx.user.departmentId ?? null,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        documentIds: input.documentIds,
        workSchedule: workSchedule ?? null,
        holidays: holidayCalendar?.holidays?.map((h) => h.date) ?? null,
        forceSubmit: input.forceSubmit,
      });
    }),

  /**
   * Cancel a pending leave request.
   * Only the request owner can cancel, and only while status is 'pending'.
   */
  cancelRequest: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await cancelLeaveRequest(input.requestId, ctx.user.id);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return result;
    }),

  /**
   * Paginated list of the current user's requests with optional status filter.
   */
  getMyRequests: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "pending", "approved", "denied", "cancelled", "expired"])
            .optional(),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return getMyRequests(ctx.user.id, input ?? undefined);
    }),

  /**
   * Edit a leave request.
   * Employees can edit pending or approved requests.
   * Editing an approved request resets it to pending for re-approval.
   */
  editRequest: protectedProcedure
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

      const workSchedule = ctx.user.organization?.workSchedule as
        | { workDays: number[] }
        | null
        | undefined;
      const holidayCalendar = ctx.user.organization?.holidayCalendar as
        | { holidays: { date: string; name: string }[] }
        | null
        | undefined;

      const result = await editLeaveRequest({
        requestId: input.requestId,
        actorId: ctx.user.id,
        isAdmin: false,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        workSchedule: workSchedule ?? null,
        holidays: holidayCalendar?.holidays?.map((h) => h.date) ?? null,
      });

      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }

      return result;
    }),

  /**
   * Full detail of a single request including approval timeline and documents.
   */
  getRequestDetail: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const request = await getRequestById(input.requestId, ctx.user.id);
      if (!request) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      }
      return request;
    }),
});
