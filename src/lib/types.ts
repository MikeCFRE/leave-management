// Shared TypeScript types — expanded in subsequent sprints

export type UserRole = "employee" | "manager" | "admin" | "super_admin";

export type LeaveStatus =
  | "draft"
  | "pending"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired";
