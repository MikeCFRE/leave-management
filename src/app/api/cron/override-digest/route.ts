import { NextResponse } from "next/server";
import { runOverrideDigest } from "@/server/cron/override-digest";

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
    const result = await runOverrideDigest();
    console.log("[cron/override-digest] completed", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/override-digest] fatal error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
