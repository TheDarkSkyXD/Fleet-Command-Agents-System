import { FiFilter, FiSearch, FiX } from 'react-icons/fi';
import type { AgentState, AgentCapability } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

interface SessionFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  stateFilter: AgentState | 'all';
  onStateFilterChange: (value: AgentState | 'all') => void;
  capabilityFilter: AgentCapability | 'all';
  onCapabilityFilterChange: (value: AgentCapability | 'all') => void;
  totalCount: number;
  filteredCount: number;
}

const STATES: (AgentState | 'all')[] = ['all', 'booting', 'working', 'completed', 'stalled', 'zombie'];
const CAPABILITIES: (AgentCapability | 'all')[] = ['all', 'coordinator', 'lead', 'scout', 'builder', 'reviewer', 'merger', 'monitor'];

export function SessionFilters({
  search,
  onSearchChange,
  stateFilter,
  onStateFilterChange,
  capabilityFilter,
  onCapabilityFilterChange,
  totalCount,
  filteredCount,
}: SessionFiltersProps) {
  const hasFilters = search || stateFilter !== 'all' || capabilityFilter !== 'all';

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by agent name, task ID, branch..."
            className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 h-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-400 hover:text-slate-200"
              onClick={() => onSearchChange('')}
            >
              <FiX size={12} />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <FiFilter size={12} />
          <span>{filteredCount} of {totalCount}</span>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-slate-400 hover:text-slate-200"
            onClick={() => {
              onSearchChange('');
              onStateFilterChange('all');
              onCapabilityFilterChange('all');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* State filter chips */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 w-14 shrink-0">State</span>
        <div className="flex flex-wrap gap-1.5">
          {STATES.map((state) => (
            <Button
              key={state}
              variant="ghost"
              size="sm"
              onClick={() => onStateFilterChange(state)}
              className={`h-6 px-2.5 text-[11px] rounded-full border transition-colors ${
                stateFilter === state
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {state === 'all' ? 'All' : state}
            </Button>
          ))}
        </div>
      </div>

      {/* Capability filter chips */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 w-14 shrink-0">Role</span>
        <div className="flex flex-wrap gap-1.5">
          {CAPABILITIES.map((cap) => (
            <Button
              key={cap}
              variant="ghost"
              size="sm"
              onClick={() => onCapabilityFilterChange(cap)}
              className={`h-6 px-2.5 text-[11px] rounded-full border transition-colors ${
                capabilityFilter === cap
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {cap === 'all' ? 'All' : cap}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
