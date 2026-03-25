import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import type { TRPCContext } from "./context";
import type { UserRole } from "@/lib/types";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// ---------------------------------------------------------------------------
// protectedProcedure — fetches user + organization in one query
// ---------------------------------------------------------------------------

export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, ctx.session.user.id),
    with: { organization: true },
  });

  if (!user || user.deletedAt || user.employmentStatus === "terminated") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx: { ...ctx, user } });
});

// ---------------------------------------------------------------------------
// adminProcedure — requires admin or super_admin role
// ---------------------------------------------------------------------------

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
  }
  return next({ ctx });
});

// ---------------------------------------------------------------------------
// approverProcedure — requires manager-or-above role
// ---------------------------------------------------------------------------

export const approverProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role as UserRole;
  if (!["manager", "admin", "super_admin"].includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only managers and admins can access the approval queue.",
    });
  }
  return next({ ctx });
});
