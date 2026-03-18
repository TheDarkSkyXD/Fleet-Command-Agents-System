import { FiChevronRight, FiDatabase } from 'react-icons/fi';
import type { ExpertiseDomainSummary } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DOMAIN_COLORS } from './constants';

interface DomainCardProps {
  domain: ExpertiseDomainSummary;
  isSelected: boolean;
  onSelect: (domain: string) => void;
}

export function DomainCard({ domain, isSelected, onSelect }: DomainCardProps) {
  const color = DOMAIN_COLORS[domain.domain] || DOMAIN_COLORS.default;

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => onSelect(domain.domain)}
      className={`h-auto w-full text-left rounded-lg border p-4 transition-all ${
        isSelected
          ? 'border-blue-500/50 bg-blue-900/15'
          : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-600'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color.split(' ')[0]}`}>
            <FiDatabase size={14} className={color.split(' ')[1]} />
          </div>
          <div>
            <span className="font-medium text-slate-100 text-sm block">{domain.domain}</span>
            <span className="text-[10px] text-slate-500">{domain.record_count} records</span>
          </div>
        </div>
        <FiChevronRight size={14} className={`text-slate-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
      </div>

      {/* Type breakdown bar */}
      {domain.types && Object.keys(domain.types).length > 0 && (
        <div className="flex gap-1 mt-1">
          {Object.entries(domain.types).map(([type, count]) => (
            <Badge
              key={type}
              variant="outline"
              className="bg-slate-700/30 text-slate-400 border-slate-600 text-[9px] px-1.5 py-0"
            >
              {type}: {count}
            </Badge>
          ))}
        </div>
      )}
    </Button>
  );
}
