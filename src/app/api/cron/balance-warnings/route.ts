import { NextResponse } from "next/server";
import { runBalanceWarnings } from "@/server/cron/balance-warnings";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runBalanceWarnings();
    console.log("[cron/balance-warnings] completed", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/balance-warnings] fatal error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
