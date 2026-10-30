import { Badge } from "@/shared/components/ui/badge";
import { STATUS_META, type Status } from "../constants";

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
