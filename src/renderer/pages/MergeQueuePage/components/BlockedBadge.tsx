import { Badge } from '../../../components/ui/badge';

export function BlockedBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-orange-500/30 bg-orange-500/20 text-orange-400"
    >
      <span className="h-2 w-2 rounded-full bg-orange-400" />
      Blocked
    </Badge>
  );
}
