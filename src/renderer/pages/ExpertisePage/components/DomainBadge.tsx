import { Badge } from '../../../components/ui/badge';

export function DomainBadge({ domain }: { domain: string }) {
  return (
    <Badge
      variant="outline"
      className="bg-indigo-600/20 text-indigo-400 border-indigo-500/30"
    >
      {domain}
    </Badge>
  );
}
