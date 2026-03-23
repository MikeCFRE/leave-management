import { router } from "./trpc";
import { leaveRouter } from "./leave";
import { approvalRouter } from "./approval";
import { adminRouter } from "./admin";
import { userRouter } from "./user";

export const appRouter = router({
  leave: leaveRouter,
  approval: approvalRouter,
  admin: adminRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
