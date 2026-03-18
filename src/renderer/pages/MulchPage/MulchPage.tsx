import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiDatabase,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import type {
  ExpertiseRecord,
  ExpertiseDomainSummary,
  ExpertiseClassification,
} from '../../../shared/types';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Card, CardContent } from '../../components/ui/card';
import { DomainCard, MemoryTimeline, HealthDashboard, AgentKnowledgeMap } from './components';
import { CLASSIFICATION_STYLES } from './components/constants';

type TabId = 'domains' | 'timeline' | 'knowledge-map' | 'health';

export function MulchPage() {
  const [activeTab, setActiveTab] = useState<TabId>('domains');
  const [domains, setDomains] = useState<ExpertiseDomainSummary[]>([]);
  const [records, setRecords] = useState<ExpertiseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<ExpertiseClassification | 'all'>('all');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [domainsRes, recordsRes] = await Promise.all([
        window.electronAPI.expertiseDomains(),
        window.electronAPI.expertiseList(),
      ]);
      if (domainsRes.data) setDomains(domainsRes.data);
      if (recordsRes.data) setRecords(recordsRes.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedDomain && r.domain !== selectedDomain) return false;
      if (classFilter !== 'all' && r.classification !== classFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const searchable = [r.title, r.content, r.domain, r.agent_name, r.tags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [records, selectedDomain, classFilter, search]);

  const handlePruneExpired = useCallback(async () => {
    try {
      const result = await window.electronAPI.expertisePruneExpired();
      if (result.data !== null && result.data !== undefined) {
        toast.success(`Pruned ${result.data} expired records`);
        loadData();
      }
    } catch {
      toast.error('Failed to prune expired records');
    }
  }, [loadData]);

  return (
    <div className="space-y-6" data-testid="mulch-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600/15 text-amber-400">
              <FiDatabase size={18} />
            </div>
            Mulch
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Agent memory system — expertise domains, knowledge records, and learning health
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePruneExpired}
            className="text-slate-400 hover:text-amber-400 h-8 gap-1.5"
          >
            <FiTrash2 size={13} />
            Prune Expired
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 h-8 gap-1.5"
          >
            <FiRefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-slate-800/50 border border-slate-700/50">
            <TabsTrigger value="domains" className="data-[state=active]:bg-slate-700 text-xs">
              Domains
            </TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-slate-700 text-xs">
              Timeline
            </TabsTrigger>
            <TabsTrigger value="knowledge-map" className="data-[state=active]:bg-slate-700 text-xs">
              Knowledge Map
            </TabsTrigger>
            <TabsTrigger value="health" className="data-[state=active]:bg-slate-700 text-xs">
              Health
            </TabsTrigger>
          </TabsList>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{domains.length} domains</span>
            <span className="text-slate-600">/</span>
            <span>{records.length} records</span>
            {selectedDomain && (
              <>
                <span className="text-slate-600">/</span>
                <Badge
                  variant="outline"
                  className="bg-blue-600/10 text-blue-400 border-blue-500/20 text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:bg-blue-600/20"
                  onClick={() => setSelectedDomain(null)}
                >
                  {selectedDomain}
                  <FiX size={9} />
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Search & filter bar (shared across tabs) */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories by title, content, domain, agent..."
              className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 h-9"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-400 hover:text-slate-200"
                onClick={() => setSearch('')}
              >
                <FiX size={12} />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'foundational', 'tactical', 'observational'] as const).map((cls) => (
              <Button
                key={cls}
                variant="ghost"
                size="sm"
                onClick={() => setClassFilter(cls)}
                className={`h-6 px-2.5 text-[11px] rounded-full border transition-colors ${
                  classFilter === cls
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                    : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {cls === 'all' ? 'All' : cls}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <FiFilter size={12} />
            <span>{filteredRecords.length} shown</span>
          </div>
        </div>

        {/* Tab content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FiRefreshCw size={32} className="mb-3 animate-spin opacity-50" />
            <p className="text-sm">Loading memories...</p>
          </div>
        ) : (
          <>
            <TabsContent value="domains" className="mt-4">
              {domains.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="flex gap-5">
                  {/* Domain list */}
                  <div className="w-72 shrink-0 space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDomain(null)}
                      className={`h-7 w-full text-xs rounded-lg border transition-colors ${
                        !selectedDomain
                          ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                          : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      All Domains ({records.length})
                    </Button>
                    {domains.map((d) => (
                      <DomainCard
                        key={d.domain}
                        domain={d}
                        isSelected={selectedDomain === d.domain}
                        onSelect={(domain) => setSelectedDomain(selectedDomain === domain ? null : domain)}
                      />
                    ))}
                  </div>

                  {/* Records list */}
                  <div className="flex-1 min-w-0">
                    {filteredRecords.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <p className="text-sm">No records match your filters</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredRecords.map((record) => (
                          <RecordCard key={record.id} record={record} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <MemoryTimeline records={filteredRecords} />
            </TabsContent>

            <TabsContent value="knowledge-map" className="mt-4">
              <AgentKnowledgeMap records={filteredRecords} />
            </TabsContent>

            <TabsContent value="health" className="mt-4">
              <HealthDashboard records={records} domains={domains} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function RecordCard({ record }: { record: ExpertiseRecord }) {
  const classStyle = CLASSIFICATION_STYLES[record.classification];
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-slate-700/50 bg-slate-800/40">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="font-medium text-slate-100 text-sm text-left hover:text-blue-400 transition-colors"
          >
            {record.title}
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`${classStyle.color} text-[9px] px-1.5 py-0`}>
              {classStyle.label}
            </Badge>
            <Badge variant="outline" className="bg-slate-700/30 text-slate-400 border-slate-600 text-[9px] px-1.5 py-0">
              {record.type}
            </Badge>
            <Badge variant="outline" className="bg-slate-700/30 text-slate-400 border-slate-600 text-[9px] px-1.5 py-0">
              {record.domain}
            </Badge>
          </div>
        </div>

        <p className={`text-xs text-slate-400 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {record.content}
        </p>

        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
          {record.agent_name && <span>by {record.agent_name}</span>}
          <span>{record.created_at}</span>
          {record.expires_at && (
            <span className={new Date(record.expires_at).getTime() < Date.now() ? 'text-red-400' : 'text-amber-400'}>
              expires {new Date(record.expires_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          )}
          {record.tags && <span className="text-slate-500">{record.tags}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <FiDatabase size={40} className="mb-3 opacity-40" />
      <p className="text-lg font-medium">No memories yet</p>
      <p className="text-sm mt-1">
        Agent expertise records will appear here as agents learn and record knowledge
      </p>
      <p className="text-xs mt-3 text-slate-500 max-w-md text-center">
        Memories are captured via expertise records — conventions, patterns, failures, decisions,
        references, and guides. Each record belongs to a domain and has a classification
        (foundational, tactical, observational).
      </p>
    </div>
  );
}
