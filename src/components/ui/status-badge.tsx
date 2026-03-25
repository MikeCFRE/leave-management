import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import type { LeaveStatus } from "@/lib/types";

const STATUS_CFG: Record<LeaveStatus, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending:   { label: "Pending",   variant: "outline",     icon: Clock },
  approved:  { label: "Approved",  variant: "default",     icon: CheckCircle2 },
  denied:    { label: "Denied",    variant: "destructive", icon: XCircle },
  cancelled: { label: "Cancelled", variant: "secondary",   icon: XCircle },
  expired:   { label: "Expired",   variant: "secondary",   icon: AlertCircle },
  draft:     { label: "Draft",     variant: "outline",     icon: Clock },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as LeaveStatus] ?? STATUS_CFG.pending;
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs shrink-0">
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
