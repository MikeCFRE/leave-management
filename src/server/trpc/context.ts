import type { Session } from "next-auth";
import { auth } from "@/server/auth";

export type TRPCContext = {
  req: Request;
  session: Session | null;
};

export async function createTRPCContext({
  req,
}: {
  req: Request;
}): Promise<TRPCContext> {
  // auth() can be called as a server-side function in NextAuth v5.
  // The TypeScript type is overloaded — cast to the server-side shape.
  const session = (await (auth as () => Promise<Session | null>)()) ?? null;
  return { req, session };
}
