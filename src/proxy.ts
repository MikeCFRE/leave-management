import { auth } from "@/server/auth";
import { NextResponse } from "next/server";

// Public paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/reset-password"];

// Paths accessible only to managers and above
const APPROVALS_ROLES = ["manager", "admin", "super_admin"] as const;

// Paths accessible only to admins
const ADMIN_ROLES = ["admin", "super_admin"] as const;

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const { pathname } = nextUrl;

  // Allow Next.js internals and auth API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated — redirect to login
  if (!session && !isPublic) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but must change password — only allow /change-password
  if (
    session &&
    session.user.mustChangePassword &&
    !pathname.startsWith("/change-password")
  ) {
    return NextResponse.redirect(new URL("/change-password", nextUrl));
  }

  // Authenticated + visiting auth pages — redirect to dashboard
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // /approvals — manager+ only
  if (
    pathname.startsWith("/approvals") &&
    !APPROVALS_ROLES.includes(session?.user.role as (typeof APPROVALS_ROLES)[number])
  ) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // /admin — admin+ only
  if (
    pathname.startsWith("/admin") &&
    !ADMIN_ROLES.includes(session?.user.role as (typeof ADMIN_ROLES)[number])
  ) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
