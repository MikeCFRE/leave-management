"use client";

import { useSession } from "next-auth/react";
import type { UserRole } from "@/lib/types";

interface RoleGateProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Renders children only if the current user's role is in allowedRoles.
 * Use fallback to show an alternative (defaults to null).
 */
export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;

  if (!role || !allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
