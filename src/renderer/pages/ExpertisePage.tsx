import { useCallback, useEffect, useState } from 'react';
import {
  FiBook,
  FiChevronRight,
  FiDatabase,
  FiFilter,
  FiPlus,
  FiSearch,
  FiTag,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import type {
  ExpertiseClassification,
  ExpertiseDomainSummary,
  ExpertiseRecord,
  ExpertiseType,
} from '../../shared/types';

const EXPERTISE_TYPES: ExpertiseType[] = [
  'convention',
  'pattern',
  'failure',
  'decision',
  'reference',
  'guide',
];

const EXPERTISE_CLASSIFICATIONS: ExpertiseClassification[] = [
  'foundational',
  'tactical',
  'observational',
];

const TYPE_COLORS: Record<ExpertiseType, string> = {
  convention: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  pattern: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
  failure: 'bg-red-600/20 text-red-400 border-red-500/30',
  decision: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
  reference: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  guide: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
};

const CLASSIFICATION_COLORS: Record<ExpertiseClassification, string> = {
  foundational: 'bg-orange-600/20 text-orange-400',
  tactical: 'bg-sky-600/20 text-sky-400',
  observational: 'bg-slate-600/20 text-slate-300',
};

function TypeBadge({ type }: { type: ExpertiseType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[type] || 'bg-slate-700 text-slate-300'}`}
    >
      {type}
    </span>
  );
}

function ClassificationBadge({ classification }: { classification: ExpertiseClassification }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_COLORS[classification] || 'bg-slate-700 text-slate-300'}`}
    >
      {classification}
    </span>
  );
}

export function ExpertisePage() {
  const [domains, setDomains] = useState<ExpertiseDomainSummary[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [records, setRecords] = useState<ExpertiseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
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

  const loadRecords = useCallback(
    async (domain: string) => {
      setIsLoadingRecords(true);
      try {
        const filters: { domain?: string; type?: string; search?: string } = { domain };
        if (typeFilter) filters.type = typeFilter;
        if (searchQuery) filters.search = searchQuery;

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
    [typeFilter, searchQuery],
  );

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

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
  }, []);

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
    } catch (error) {
      showStatus('error', `Failed to create: ${error}`);
    }
  }, [newRecord, selectedDomain, showStatus, loadDomains, loadRecords]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const result = await window.electronAPI.expertiseDelete(id);
        if (result.error) {
          showStatus('error', `Failed to delete: ${result.error}`);
          return;
        }
        showStatus('success', 'Record deleted');
        loadDomains();
        if (selectedDomain) {
          loadRecords(selectedDomain);
        }
      } catch (error) {
        showStatus('error', `Failed to delete: ${error}`);
      }
    },
    [selectedDomain, showStatus, loadDomains, loadRecords],
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
            <button
              type="button"
              onClick={handleBackToDomains}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <FiChevronRight size={18} className="rotate-180" />
            </button>
          )}
          <h1 className="text-xl font-bold text-slate-50">
            <FiBook className="mr-2 inline-block" size={22} />
            {selectedDomain ? `Expertise: ${selectedDomain}` : 'Expertise Management'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewRecord((prev) => ({ ...prev, domain: selectedDomain || '' }));
            setShowCreateForm(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          data-testid="create-expertise-button"
        >
          <FiPlus size={16} />
          Record Expertise
        </button>
      </div>

      {/* Domain list view */}
      {!selectedDomain && (
        <div>
          {domains.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-12 text-center">
              <FiDatabase size={40} className="mx-auto mb-3 text-slate-500" />
              <p className="text-lg font-medium text-slate-300">No expertise domains yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Record your first expertise to create a domain
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="domain-list"
            >
              {domains.map((domain) => (
                <button
                  type="button"
                  key={domain.domain}
                  onClick={() => handleSelectDomain(domain.domain)}
                  className="group rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-left transition-all hover:border-blue-500/50 hover:bg-slate-800"
                  data-testid={`domain-card-${domain.domain}`}
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                      {domain.domain}
                    </h3>
                    <FiChevronRight
                      size={16}
                      className="mt-0.5 text-slate-500 group-hover:text-blue-400"
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    {domain.record_count} record{domain.record_count !== 1 ? 's' : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(domain.types).map(([type, count]) => (
                      <span
                        key={type}
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${TYPE_COLORS[type as ExpertiseType] || 'bg-slate-700 text-slate-300'}`}
                      >
                        {type}: {count}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Records view for selected domain */}
      {selectedDomain && (
        <div>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <FiSearch
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={14}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search records..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                data-testid="expertise-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <FiFilter size={14} className="text-slate-500" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                data-testid="expertise-type-filter"
              >
                <option value="">All Types</option>
                {EXPERTISE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
                No records found{typeFilter || searchQuery ? ' matching your filters' : ''}
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
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRecordId(expandedRecordId === record.id ? null : record.id)
                    }
                    className="flex w-full items-center gap-3 p-3 text-left"
                    data-testid={`expertise-record-${record.id}`}
                  >
                    <FiChevronRight
                      size={14}
                      className={`flex-shrink-0 text-slate-500 transition-transform ${expandedRecordId === record.id ? 'rotate-90' : ''}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-100 truncate">{record.title}</span>
                        <TypeBadge type={record.type} />
                        <ClassificationBadge classification={record.classification} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                        {record.agent_name && <span>by {record.agent_name}</span>}
                        <span>{new Date(record.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(record.id);
                      }}
                      className="flex-shrink-0 rounded p-1.5 text-slate-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                      title="Delete record"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </button>

                  {/* Expanded content */}
                  {expandedRecordId === record.id && (
                    <div className="border-t border-slate-700 p-4">
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{record.content}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
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

      {/* Create form modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">Record Expertise</h2>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-slate-400 mb-1">Domain *</span>
                <input
                  type="text"
                  value={newRecord.domain}
                  onChange={(e) => setNewRecord((p) => ({ ...p, domain: e.target.value }))}
                  placeholder="e.g., authentication, database, styling"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  data-testid="expertise-domain-input"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-slate-400 mb-1">Title *</span>
                <input
                  type="text"
                  value={newRecord.title}
                  onChange={(e) => setNewRecord((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Brief descriptive title"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  data-testid="expertise-title-input"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-slate-400 mb-1">Content *</span>
                <textarea
                  value={newRecord.content}
                  onChange={(e) => setNewRecord((p) => ({ ...p, content: e.target.value }))}
                  placeholder="Detailed expertise content..."
                  rows={4}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                  data-testid="expertise-content-input"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-400 mb-1">Type</span>
                  <select
                    value={newRecord.type}
                    onChange={(e) =>
                      setNewRecord((p) => ({ ...p, type: e.target.value as ExpertiseType }))
                    }
                    className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                    data-testid="expertise-type-select"
                  >
                    {EXPERTISE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-400 mb-1">
                    Classification
                  </span>
                  <select
                    value={newRecord.classification}
                    onChange={(e) =>
                      setNewRecord((p) => ({
                        ...p,
                        classification: e.target.value as ExpertiseClassification,
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                    data-testid="expertise-classification-select"
                  >
                    {EXPERTISE_CLASSIFICATIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-400 mb-1">Agent Name</span>
                  <input
                    type="text"
                    value={newRecord.agent_name}
                    onChange={(e) => setNewRecord((p) => ({ ...p, agent_name: e.target.value }))}
                    placeholder="Optional"
                    className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-400 mb-1">Source File</span>
                  <input
                    type="text"
                    value={newRecord.source_file}
                    onChange={(e) => setNewRecord((p) => ({ ...p, source_file: e.target.value }))}
                    placeholder="Optional"
                    className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-medium text-slate-400 mb-1">Tags</span>
                <input
                  type="text"
                  value={newRecord.tags}
                  onChange={(e) => setNewRecord((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="Comma-separated tags (optional)"
                  className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                data-testid="expertise-save-button"
              >
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
