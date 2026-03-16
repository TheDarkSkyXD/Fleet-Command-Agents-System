import { useCallback, useEffect, useState } from 'react';
import { AnimatedCard, AnimatedCardContainer } from '../../components/AnimatedCard';
import {
  FiActivity,
  FiBook,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiDatabase,
  FiDownload,
  FiFilter,
  FiPlus,
  FiSearch,
  FiTag,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import type {
  ExpertiseClassification,
  ExpertiseDomainSummary,
  ExpertiseRecord,
  ExpertiseType,
} from '../../../shared/types';
import { toast } from 'sonner';
import { formatAbsoluteTime } from '../../components/RelativeTime';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Card, CardContent } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../components/ui/dialog';
import {
  ClassificationBadge,
  DomainBadge,
  EXPERTISE_CLASSIFICATIONS,
  EXPERTISE_TYPES,
  HighlightedText,
  TYPE_COLORS,
  TypeBadge,
} from './components';
import './ExpertisePage.css';

export function ExpertisePage() {
  const [activeTab, setActiveTab] = useState<'domains' | 'timeline' | 'health'>('domains');
  const [domains, setDomains] = useState<ExpertiseDomainSummary[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [records, setRecords] = useState<ExpertiseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [timelineRecords, setTimelineRecords] = useState<ExpertiseRecord[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<ExpertiseRecord[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);
  const [isGlobalSearchActive, setIsGlobalSearchActive] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [fileFilter, setFileFilter] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Create form state
  const [newRecord, setNewRecord] = useState({
    domain: '',
    title: '',
    content: '',
    type: 'convention' as ExpertiseType,
    classification: 'tactical' as ExpertiseClassification,
    agent_name: '',
    source_file: '',
    tags: '',
  });

  const showStatus = useCallback((type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  const loadDomains = useCallback(async () => {
    try {
      const result = await window.electronAPI.expertiseDomains();
      if (result.data) {
        setDomains(result.data);
      }
    } catch (error) {
      console.error('Failed to load domains:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTimeline = useCallback(async () => {
    setIsLoadingTimeline(true);
    try {
      const result = await window.electronAPI.expertiseList({});
      if (result.data) {
        // Sort by created_at descending (newest first)
        const sorted = [...result.data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setTimelineRecords(sorted);
      }
    } catch (error) {
      console.error('Failed to load timeline:', error);
    } finally {
      setIsLoadingTimeline(false);
    }
  }, []);

  const loadRecords = useCallback(
    async (domain: string) => {
      setIsLoadingRecords(true);
      try {
        const filters: {
          domain?: string;
          type?: string;
          search?: string;
          source_file?: string;
        } = { domain };
        if (typeFilter) filters.type = typeFilter;
        if (searchQuery.trim()) filters.search = searchQuery.trim();
        if (fileFilter.trim()) filters.source_file = fileFilter.trim();

        const result = await window.electronAPI.expertiseList(filters);
        if (result.data) {
          setRecords(result.data);
        }
      } catch (error) {
        console.error('Failed to load records:', error);
      } finally {
        setIsLoadingRecords(false);
      }
    },
    [typeFilter, searchQuery, fileFilter],
  );

  const performGlobalSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setGlobalSearchResults([]);
      setIsGlobalSearchActive(false);
      return;
    }
    setIsGlobalSearching(true);
    setIsGlobalSearchActive(true);
    try {
      const result = await window.electronAPI.expertiseList({ search: query.trim() });
      if (result.data) {
        // Sort by relevance: title matches first, then content matches
        const sorted = [...result.data].sort((a, b) => {
          const queryLower = query.toLowerCase();
          const aTitleMatch = a.title.toLowerCase().includes(queryLower) ? 1 : 0;
          const bTitleMatch = b.title.toLowerCase().includes(queryLower) ? 1 : 0;
          if (aTitleMatch !== bTitleMatch) return bTitleMatch - aTitleMatch;
          // Then by domain match
          const aDomainMatch = a.domain.toLowerCase().includes(queryLower) ? 1 : 0;
          const bDomainMatch = b.domain.toLowerCase().includes(queryLower) ? 1 : 0;
          if (aDomainMatch !== bDomainMatch) return bDomainMatch - aDomainMatch;
          // Then by recency
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        setGlobalSearchResults(sorted);
      }
    } catch (error) {
      console.error('Global search failed:', error);
    } finally {
      setIsGlobalSearching(false);
    }
  }, []);

  // Debounce global search
  useEffect(() => {
    const timer = setTimeout(() => {
      performGlobalSearch(globalSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearchQuery, performGlobalSearch]);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  useEffect(() => {
    if (activeTab === 'timeline') {
      loadTimeline();
    }
  }, [activeTab, loadTimeline]);

  useEffect(() => {
    if (selectedDomain) {
      loadRecords(selectedDomain);
    }
  }, [selectedDomain, loadRecords]);

  const handleSelectDomain = useCallback((domain: string) => {
    setSelectedDomain(domain);
    setExpandedRecordId(null);
  }, []);

  const handleBackToDomains = useCallback(() => {
    setSelectedDomain(null);
    setRecords([]);
    setSearchQuery('');
    setTypeFilter('');
    setExpandedRecordId(null);
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setIsGlobalSearchActive(false);
  }, []);

  const [loadedContext, setLoadedContext] = useState<{
    domain: string;
    record_count: number;
    context: string;
  } | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState<string | null>(null);

  const handleLoadContext = useCallback(
    async (domain: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      setIsLoadingContext(domain);
      try {
        const result = await window.electronAPI.expertiseLoadContext(domain);
        if (result.error) {
          toast.error(`Failed to load context: ${result.error}`);
          return;
        }
        if (result.data) {
          setLoadedContext({
            domain: result.data.domain,
            record_count: result.data.record_count,
            context: result.data.context,
          });
          toast.success(
            `Loaded ${result.data.record_count} record(s) for "${domain}"`,
          );
        }
      } catch (error) {
        console.error('Failed to load context:', error);
        toast.error('Failed to load domain context');
      } finally {
        setIsLoadingContext(null);
      }
    },
    [],
  );

  const handleCopyContext = useCallback(async () => {
    if (!loadedContext) return;
    try {
      await navigator.clipboard.writeText(loadedContext.context);
      toast.success('Context copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [loadedContext]);

  const handleCreate = useCallback(async () => {
    if (!newRecord.domain.trim() || !newRecord.title.trim() || !newRecord.content.trim()) {
      showStatus('error', 'Domain, title, and content are required');
      return;
    }

    try {
      const id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const result = await window.electronAPI.expertiseCreate({
        id,
        domain: newRecord.domain.trim(),
        title: newRecord.title.trim(),
        content: newRecord.content.trim(),
        type: newRecord.type,
        classification: newRecord.classification,
        agent_name: newRecord.agent_name.trim() || undefined,
        source_file: newRecord.source_file.trim() || undefined,
        tags: newRecord.tags.trim() || undefined,
      });

      if (result.error) {
        showStatus('error', `Failed to create: ${result.error}`);
        return;
      }

      showStatus('success', 'Expertise record created');
      toast.success('Expertise record created');
      setShowCreateForm(false);
      setNewRecord({
        domain: selectedDomain || '',
        title: '',
        content: '',
        type: 'convention',
        classification: 'tactical',
        agent_name: '',
        source_file: '',
        tags: '',
      });
      loadDomains();
      if (selectedDomain) {
        loadRecords(selectedDomain);
      }
      if (activeTab === 'timeline') {
        loadTimeline();
      }
      if (isGlobalSearchActive && globalSearchQuery) {
        performGlobalSearch(globalSearchQuery);
      }
    } catch (error) {
      showStatus('error', `Failed to create: ${error}`);
    }
  }, [
    newRecord,
    selectedDomain,
    showStatus,
    loadDomains,
    loadRecords,
    activeTab,
    loadTimeline,
    isGlobalSearchActive,
    globalSearchQuery,
    performGlobalSearch,
  ]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const result = await window.electronAPI.expertiseDelete(id);
        if (result.error) {
          showStatus('error', `Failed to delete: ${result.error}`);
          return;
        }
        showStatus('success', 'Record deleted');
        toast.success('Expertise record deleted');
        loadDomains();
        if (selectedDomain) {
          loadRecords(selectedDomain);
        }
        if (isGlobalSearchActive && globalSearchQuery) {
          performGlobalSearch(globalSearchQuery);
        }
      } catch (error) {
        showStatus('error', `Failed to delete: ${error}`);
      }
    },
    [
      selectedDomain,
      showStatus,
      loadDomains,
      loadRecords,
      isGlobalSearchActive,
      globalSearchQuery,
      performGlobalSearch,
    ],
  );

  // Skeleton loader
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="expertise-page">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="expertise-page">
      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-900/50 text-emerald-300'
              : 'bg-red-900/50 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedDomain && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToDomains}
              className="h-8 w-8 text-slate-400 hover:text-slate-200"
              title="Back to domains"
            >
              <FiChevronRight size={18} className="rotate-180" />
            </Button>
          )}
          <h1 className="text-xl font-bold text-slate-50">
            <FiBook className="mr-2 inline-block" size={22} />
            {selectedDomain ? `Expertise: ${selectedDomain}` : 'Expertise Management'}
          </h1>
        </div>
        <Button
          onClick={() => {
            setNewRecord((prev) => ({ ...prev, domain: selectedDomain || '' }));
            setShowCreateForm(true);
          }}
          data-testid="create-expertise-button"
          className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
        >
          <FiPlus size={16} />
          Record Expertise
        </Button>
      </div>

      {/* Tabs (shown when no domain is selected) */}
      {!selectedDomain && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'domains' | 'timeline' | 'health')} data-testid="expertise-tabs">
          <TabsList className="bg-transparent border-b border-slate-700 rounded-none w-full justify-start h-auto p-0">
            <TabsTrigger
              value="domains"
              data-testid="expertise-tab-domains"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
            >
              <FiDatabase className="mr-1.5" size={14} />
              Domains
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              data-testid="expertise-tab-timeline"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
            >
              <FiClock className="mr-1.5" size={14} />
              Timeline
            </TabsTrigger>
            <TabsTrigger
              value="health"
              data-testid="expertise-tab-health"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
            >
              <FiActivity className="mr-1.5" size={14} />
              Health
            </TabsTrigger>
          </TabsList>

          {/* Global search bar (shown on domain list view) */}
          <TabsContent value="domains" className="mt-4">
            <div className="space-y-4">
              <div className="relative" data-testid="global-search-container">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  type="text"
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  maxLength={200}
                  placeholder="Search expertise across all domains..."
                  aria-label="Search expertise across all domains"
                  className="pl-10 pr-10"
                  data-testid="global-expertise-search"
                />
                {globalSearchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setGlobalSearchQuery('');
                      setGlobalSearchResults([]);
                      setIsGlobalSearchActive(false);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-slate-300"
                  >
                    <FiX size={14} />
                  </Button>
                )}
              </div>

              {/* Global search results */}
              {isGlobalSearchActive && (
                <div data-testid="global-search-results">
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                    <FiSearch size={14} />
                    {isGlobalSearching ? (
                      <span>Searching...</span>
                    ) : (
                      <span>
                        {globalSearchResults.length} result{globalSearchResults.length !== 1 ? 's' : ''}{' '}
                        across {new Set(globalSearchResults.map((r) => r.domain)).size} domain
                        {new Set(globalSearchResults.map((r) => r.domain)).size !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {isGlobalSearching ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-800" />
                      ))}
                    </div>
                  ) : globalSearchResults.length === 0 ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
                      <p className="text-slate-400">No results found for &quot;{globalSearchQuery}&quot;</p>
                    </div>
                  ) : (
                    <div className="space-y-2" data-testid="global-search-records-list">
                      {globalSearchResults.map((record) => (
                        <div
                          key={record.id}
                          className="rounded-lg border border-slate-700 bg-slate-800/50 transition-colors hover:border-slate-600"
                        >
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() =>
                              setExpandedRecordId(expandedRecordId === record.id ? null : record.id)
                            }
                            className="flex h-auto w-full items-center gap-3 rounded-none p-3 text-left"
                            data-testid={`search-result-${record.id}`}
                          >
                            <FiChevronRight
                              size={14}
                              className={`flex-shrink-0 text-slate-400 transition-transform ${expandedRecordId === record.id ? 'rotate-90' : ''}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-100 truncate" title={record.title}>
                                  <HighlightedText text={record.title} query={globalSearchQuery} />
                                </span>
                                <DomainBadge domain={record.domain} />
                                <TypeBadge type={record.type} />
                                <ClassificationBadge classification={record.classification} />
                              </div>
                              <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                                {record.agent_name && <span>by {record.agent_name}</span>}
                                <span>{new Date(record.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(record.id);
                              }}
                              className="flex-shrink-0 h-7 w-7 text-slate-400 hover:bg-red-900/30 hover:text-red-400"
                              title="Delete record"
                            >
                              <FiTrash2 size={14} />
                            </Button>
                          </Button>

                          {expandedRecordId === record.id && (
                            <div className="border-t border-slate-700 p-4">
                              <p className="whitespace-pre-wrap text-sm text-slate-300">
                                <HighlightedText text={record.content} query={globalSearchQuery} />
                              </p>
                              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                                {record.source_file && (
                                  <span className="flex items-center gap-1">
                                    <FiDatabase size={12} />
                                    {record.source_file}
                                  </span>
                                )}
                                {record.tags && (
                                  <span className="flex items-center gap-1">
                                    <FiTag size={12} />
                                    {record.tags}
                                  </span>
                                )}
                                <span>ID: {record.id}</span>
                                <span>Updated: {new Date(record.updated_at).toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Domain list view */}
              {!isGlobalSearchActive && (
                <div>
                  {domains.length === 0 ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-12 text-center">
                      <FiDatabase size={40} className="mx-auto mb-3 text-slate-400" />
                      <p className="text-lg font-medium text-slate-300">No expertise domains yet</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Record your first expertise to create a domain
                      </p>
                    </div>
                  ) : (
                    <AnimatedCardContainer
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                      data-testid="domain-list"
                    >
                      {domains.map((domain) => (
                        <AnimatedCard key={domain.domain}>
                        <div
                          className="group rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-left transition-all hover:border-blue-500/50 hover:bg-slate-800"
                          data-testid={`domain-card-${domain.domain}`}
                        >
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => handleSelectDomain(domain.domain)}
                            className="h-auto w-full text-left"
                          >
                            <div className="flex items-start justify-between">
                              <h3 className="text-base font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                                {domain.domain}
                              </h3>
                              <FiChevronRight
                                size={16}
                                className="mt-0.5 text-slate-400 group-hover:text-blue-400"
                              />
                            </div>
                            <p className="mt-1 text-sm text-slate-400">
                              {domain.record_count} record{domain.record_count !== 1 ? 's' : ''}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {Object.entries(domain.types).map(([type, count]) => (
                                <Badge
                                  key={type}
                                  variant="outline"
                                  className={`rounded border-transparent ${TYPE_COLORS[type as ExpertiseType] || 'bg-slate-700 text-slate-300'}`}
                                >
                                  {type}: {count}
                                </Badge>
                              ))}
                            </div>
                          </Button>
                          <Separator className="mt-3 bg-slate-700/50" />
                          <div className="pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleLoadContext(domain.domain, e)}
                              disabled={isLoadingContext === domain.domain}
                              className="h-7 px-2 text-xs text-indigo-400 hover:bg-indigo-600/20 hover:text-indigo-300"
                              data-testid={`load-context-${domain.domain}`}
                              aria-label={`Load context for ${domain.domain} domain`}
                            >
                              <FiDownload size={12} />
                              {isLoadingContext === domain.domain ? 'Loading...' : 'Load Context'}
                            </Button>
                          </div>
                        </div>
                        </AnimatedCard>
                      ))}
                    </AnimatedCardContainer>
                  )}
                </div>
              )}

              {/* Loaded context preview */}
              {loadedContext && (
                <Card
                  className="border-indigo-500/30 bg-indigo-900/10"
                  data-testid="loaded-context-preview"
                >
                  <CardContent className="p-4 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FiDatabase size={16} className="text-indigo-400" />
                        <h3 className="text-sm font-semibold text-slate-100">
                          Loaded Context: <span className="text-indigo-400" data-testid="loaded-context-domain">{loadedContext.domain}</span>
                        </h3>
                        <span className="text-xs text-slate-400" data-testid="loaded-context-count">
                          ({loadedContext.record_count} record{loadedContext.record_count !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyContext}
                          className="h-7 px-2 text-xs text-slate-300 hover:bg-slate-700"
                          data-testid="copy-context-btn"
                          aria-label="Copy context to clipboard"
                        >
                          <FiCopy size={12} />
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setLoadedContext(null)}
                          className="h-7 w-7 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                          data-testid="dismiss-context-btn"
                          aria-label="Dismiss loaded context"
                        >
                          <FiX size={12} />
                        </Button>
                      </div>
                    </div>
                    <pre
                      className="max-h-64 overflow-auto rounded bg-slate-900/80 p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap border border-slate-700/50"
                      data-testid="loaded-context-content"
                    >
                      {loadedContext.context}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Timeline view */}
          <TabsContent value="timeline" className="mt-4">
            <div data-testid="expertise-timeline">
              {isLoadingTimeline ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-4">
                      <div className="h-16 w-1 animate-pulse rounded bg-slate-800" />
                      <div className="h-16 flex-1 animate-pulse rounded-lg bg-slate-800" />
                    </div>
                  ))}
                </div>
              ) : timelineRecords.length === 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-12 text-center">
                  <FiClock size={40} className="mx-auto mb-3 text-slate-400" />
                  <p className="text-lg font-medium text-slate-300">No timeline entries yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Record your first expertise to see it in the timeline
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-700" />

                  <div className="space-y-1">
                    {timelineRecords.map((record, index) => {
                      // Group by date - show date header when date changes
                      const recordDate = new Date(record.created_at).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      });
                      const prevDate =
                        index > 0
                          ? new Date(timelineRecords[index - 1].created_at).toLocaleDateString(
                              'en-US',
                              { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
                            )
                          : null;
                      const showDateHeader = recordDate !== prevDate;

                      return (
                        <div key={record.id}>
                          {showDateHeader && (
                            <div className="flex items-center gap-3 py-3 pl-0">
                              <div className="flex h-[31px] w-[31px] items-center justify-center rounded-full bg-slate-800 border border-slate-600 z-10">
                                <FiClock size={14} className="text-slate-400" />
                              </div>
                              <span className="text-sm font-semibold text-slate-300">{recordDate}</span>
                            </div>
                          )}
                          <div className="flex gap-3 pl-0">
                            {/* Timeline dot */}
                            <div className="flex h-[31px] w-[31px] flex-shrink-0 items-center justify-center z-10">
                              <div
                                className={`h-2.5 w-2.5 rounded-full ${
                                  TYPE_COLORS[record.type]
                                    ?.split(' ')
                                    .find((c) => c.startsWith('text-'))
                                    ?.replace('text-', 'bg-') || 'bg-slate-500'
                                }`}
                              />
                            </div>
                            {/* Timeline entry card */}
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => {
                                setExpandedRecordId(expandedRecordId === record.id ? null : record.id);
                              }}
                              className="h-auto flex-1 mb-1 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-800"
                              data-testid={`timeline-entry-${record.id}`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-100">{record.title}</span>
                                <DomainBadge domain={record.domain} />
                                <TypeBadge type={record.type} />
                                <ClassificationBadge classification={record.classification} />
                              </div>
                              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                                {record.agent_name ? (
                                  <span className="flex items-center gap-1 text-slate-400">
                                    <FiUser size={11} />
                                    {record.agent_name}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-slate-400">
                                    <FiUser size={11} />
                                    Manual entry
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <FiClock size={11} />
                                  {new Date(record.created_at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                <FiChevronRight
                                  size={12}
                                  className={`ml-auto transition-transform ${expandedRecordId === record.id ? 'rotate-90' : ''}`}
                                />
                              </div>

                              {/* Expanded content */}
                              {expandedRecordId === record.id && (
                                <div className="mt-3 border-t border-slate-700 pt-3">
                                  <p className="whitespace-pre-wrap text-sm text-slate-300">
                                    {record.content}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                                    {record.source_file && (
                                      <span className="flex items-center gap-1">
                                        <FiDatabase size={12} />
                                        {record.source_file}
                                      </span>
                                    )}
                                    {record.tags && (
                                      <span className="flex items-center gap-1">
                                        <FiTag size={12} />
                                        {record.tags}
                                      </span>
                                    )}
                                    <span>ID: {record.id}</span>
                                    <span>Updated: {new Date(record.updated_at).toLocaleString()}</span>
                                  </div>
                                </div>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Health dashboard view */}
          <TabsContent value="health" className="mt-4">
            <div data-testid="expertise-health-dashboard">
              {domains.length === 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-12 text-center">
                  <FiActivity size={40} className="mx-auto mb-3 text-slate-400" />
                  <p className="text-lg font-medium text-slate-300">No domains to analyze</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Record expertise to see domain health metrics
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Card className="border-slate-700 bg-slate-800/50">
                      <CardContent className="p-4 pt-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Total Domains</p>
                        <p className="mt-1 text-2xl font-bold text-slate-100">{domains.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-700 bg-slate-800/50">
                      <CardContent className="p-4 pt-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Total Entries</p>
                        <p className="mt-1 text-2xl font-bold text-slate-100">
                          {domains.reduce((sum, d) => sum + d.record_count, 0)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-700 bg-slate-800/50">
                      <CardContent className="p-4 pt-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Healthy</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-400">
                          {
                            domains.filter((d) => {
                              if (!d.last_updated) return false;
                              const daysSince =
                                (Date.now() - new Date(d.last_updated).getTime()) / (1000 * 60 * 60 * 24);
                              return daysSince <= 7;
                            }).length
                          }
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-700 bg-slate-800/50">
                      <CardContent className="p-4 pt-4">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Stale</p>
                        <p className="mt-1 text-2xl font-bold text-amber-400">
                          {
                            domains.filter((d) => {
                              if (!d.last_updated) return true;
                              const daysSince =
                                (Date.now() - new Date(d.last_updated).getTime()) / (1000 * 60 * 60 * 24);
                              return daysSince > 7;
                            }).length
                          }
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Per-domain health cards */}
                  <div className="space-y-2" data-testid="health-domain-list">
                    {[...domains]
                      .sort((a, b) => {
                        // Sort stale domains first
                        const aTime = a.last_updated ? new Date(a.last_updated).getTime() : 0;
                        const bTime = b.last_updated ? new Date(b.last_updated).getTime() : 0;
                        return aTime - bTime;
                      })
                      .map((domain) => {
                        const lastUpdated = domain.last_updated ? new Date(domain.last_updated) : null;
                        const daysSince = lastUpdated
                          ? (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
                          : null;
                        const isHealthy = daysSince !== null && daysSince <= 7;
                        const isStale = daysSince === null || daysSince > 7;

                        // Format relative time
                        let timeAgo = 'Never updated';
                        if (lastUpdated) {
                          if (daysSince !== null && daysSince < 1) {
                            const hoursSince = Math.floor(daysSince * 24);
                            timeAgo =
                              hoursSince <= 1 ? 'Less than an hour ago' : `${hoursSince} hours ago`;
                          } else if (daysSince !== null && daysSince < 30) {
                            const days = Math.floor(daysSince);
                            timeAgo = days === 1 ? '1 day ago' : `${days} days ago`;
                          } else if (daysSince !== null) {
                            const months = Math.floor(daysSince / 30);
                            timeAgo = months === 1 ? '1 month ago' : `${months} months ago`;
                          }
                        }

                        return (
                          <div
                            key={domain.domain}
                            className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 transition-colors hover:border-slate-600"
                            data-testid={`health-domain-${domain.domain}`}
                          >
                            {/* Health indicator dot */}
                            <div
                              className={`h-3 w-3 flex-shrink-0 rounded-full ${
                                isHealthy
                                  ? 'bg-emerald-500 shadow-emerald-500/30 shadow-sm'
                                  : 'bg-amber-500 shadow-amber-500/30 shadow-sm'
                              }`}
                              title={isHealthy ? 'Healthy' : 'Stale'}
                              data-testid={`health-indicator-${domain.domain}`}
                            />

                            {/* Domain name */}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-slate-100">{domain.domain}</h3>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {domain.record_count} entr{domain.record_count === 1 ? 'y' : 'ies'}
                              </p>
                            </div>

                            {/* Type breakdown mini-badges */}
                            <div className="hidden sm:flex flex-wrap gap-1">
                              {Object.entries(domain.types).map(([type, count]) => (
                                <Badge
                                  key={type}
                                  variant="outline"
                                  className={`rounded border-transparent ${TYPE_COLORS[type as ExpertiseType] || 'bg-slate-700 text-slate-300'}`}
                                >
                                  {type}: {count}
                                </Badge>
                              ))}
                            </div>

                            {/* Staleness indicator */}
                            <div className="flex-shrink-0 text-right">
                              <Badge
                                variant="outline"
                                className={`gap-1 px-2.5 py-1 ${
                                  isHealthy
                                    ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30'
                                    : isStale
                                      ? 'bg-amber-900/40 text-amber-400 border-amber-500/30'
                                      : 'bg-slate-700 text-slate-400 border-slate-600'
                                }`}
                                data-testid={`staleness-badge-${domain.domain}`}
                                title={lastUpdated ? formatAbsoluteTime(lastUpdated) : undefined}
                              >
                                <FiClock size={11} />
                                {timeAgo}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Records view for selected domain */}
      {selectedDomain && (
        <div>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <FiSearch
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                maxLength={200}
                placeholder="Search records..."
                aria-label="Search expertise records"
                className="pl-9"
                data-testid="expertise-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <FiFilter size={14} className="text-slate-400" />
              <Select
                value={typeFilter || '__all__'}
                onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}
              >
                <SelectTrigger
                  className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  data-testid="expertise-type-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {EXPERTISE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative min-w-[180px]">
              <Input
                type="text"
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                maxLength={500}
                placeholder="Filter by file..."
                aria-label="Filter expertise records by source file"
                className="font-mono"
                data-testid="expertise-file-filter"
              />
            </div>
          </div>

          {/* Records list */}
          {isLoadingRecords ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-800" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
              <p className="text-slate-400">
                No records found{typeFilter || searchQuery.trim() || fileFilter.trim() ? ' matching your filters' : ''}
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="expertise-records-list">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-slate-700 bg-slate-800/50 transition-colors hover:border-slate-600"
                >
                  {/* Record header - always visible */}
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      setExpandedRecordId(expandedRecordId === record.id ? null : record.id)
                    }
                    className="flex h-auto w-full items-center gap-3 rounded-none p-3 text-left"
                    data-testid={`expertise-record-${record.id}`}
                  >
                    <FiChevronRight
                      size={14}
                      className={`flex-shrink-0 text-slate-400 transition-transform ${expandedRecordId === record.id ? 'rotate-90' : ''}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-100 truncate" title={record.title}>
                          <HighlightedText text={record.title} query={searchQuery} />
                        </span>
                        <TypeBadge type={record.type} />
                        <ClassificationBadge classification={record.classification} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                        {record.agent_name && <span>by {record.agent_name}</span>}
                        <span>{new Date(record.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(record.id);
                      }}
                      className="flex-shrink-0 h-7 w-7 text-slate-400 hover:bg-red-900/30 hover:text-red-400"
                      title="Delete record"
                    >
                      <FiTrash2 size={14} />
                    </Button>
                  </Button>

                  {/* Expanded content */}
                  {expandedRecordId === record.id && (
                    <div className="border-t border-slate-700 p-4">
                      <p className="whitespace-pre-wrap text-sm text-slate-300">
                        <HighlightedText text={record.content} query={searchQuery} />
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                        {record.source_file && (
                          <span className="flex items-center gap-1">
                            <FiDatabase size={12} />
                            {record.source_file}
                          </span>
                        )}
                        {record.tags && (
                          <span className="flex items-center gap-1">
                            <FiTag size={12} />
                            {record.tags}
                          </span>
                        )}
                        <span>ID: {record.id}</span>
                        <span>Updated: {new Date(record.updated_at).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create form dialog */}
      <Dialog open={showCreateForm} onOpenChange={(isOpen) => { if (!isOpen) setShowCreateForm(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Expertise</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new expertise record
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Domain *</Label>
              <Input
                type="text"
                value={newRecord.domain}
                onChange={(e) => setNewRecord((p) => ({ ...p, domain: e.target.value }))}
                placeholder="e.g., authentication, database, styling"
                data-testid="expertise-domain-input"
              />
            </div>

            <div>
              <Label className="text-xs text-slate-400">Title *</Label>
              <Input
                type="text"
                value={newRecord.title}
                onChange={(e) => setNewRecord((p) => ({ ...p, title: e.target.value }))}
                placeholder="Brief descriptive title"
                data-testid="expertise-title-input"
              />
            </div>

            <div>
              <Label className="text-xs text-slate-400">Content *</Label>
              <Textarea
                value={newRecord.content}
                onChange={(e) => setNewRecord((p) => ({ ...p, content: e.target.value }))}
                placeholder="Detailed expertise content..."
                rows={4}
                className="resize-none"
                data-testid="expertise-content-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Type</Label>
                <Select
                  value={newRecord.type}
                  onValueChange={(v) =>
                    setNewRecord((p) => ({ ...p, type: v as ExpertiseType }))
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="expertise-type-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERTISE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Classification</Label>
                <Select
                  value={newRecord.classification}
                  onValueChange={(v) =>
                    setNewRecord((p) => ({
                      ...p,
                      classification: v as ExpertiseClassification,
                    }))
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="expertise-classification-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERTISE_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Agent Name</Label>
                <Input
                  type="text"
                  value={newRecord.agent_name}
                  onChange={(e) => setNewRecord((p) => ({ ...p, agent_name: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Source File</Label>
                <Input
                  type="text"
                  value={newRecord.source_file}
                  onChange={(e) => setNewRecord((p) => ({ ...p, source_file: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-400">Tags</Label>
              <Input
                type="text"
                value={newRecord.tags}
                onChange={(e) => setNewRecord((p) => ({ ...p, tags: e.target.value }))}
                placeholder="Comma-separated tags (optional)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              data-testid="expertise-save-button"
              className="bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
            >
              Save Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
