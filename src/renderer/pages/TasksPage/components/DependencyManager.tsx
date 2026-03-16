import { useEffect, useState } from 'react';
import { FiAlertTriangle, FiLink, FiPlus, FiX } from 'react-icons/fi';
import type { Issue, IssueStatus } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { Tooltip } from '../../../components/Tooltip';
import type { StatusConfigMap } from './types';

export function DependencyManager({
  issue,
  allIssues,
  statusConfig: statuses,
  onDependenciesChange,
}: {
  issue: Issue;
  allIssues: Issue[];
  statusConfig: StatusConfigMap;
  onDependenciesChange: (id: string, depIds: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [blockingIssues, setBlockingIssues] = useState<
    Array<{ id: string; title: string; status: string }>
  >([]);

  // Load reverse dependencies (issues this one blocks)
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.issueBlocking(issue.id).then((result) => {
      if (!cancelled && result.data) {
        setBlockingIssues(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [issue.id]);

  const deps: string[] = (() => {
    try {
      return JSON.parse(issue.dependencies || '[]');
    } catch {
      return [];
    }
  })();

  const depIssues = deps
    .map((depId) => allIssues.find((i) => i.id === depId))
    .filter(Boolean) as Issue[];

  const availableIssues = allIssues.filter((i) => i.id !== issue.id && !deps.includes(i.id));

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4 space-y-4">
      {/* Blocked By (dependencies) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            <FiLink className="inline mr-1 -mt-0.5" size={11} />
            Blocked By ({deps.length})
          </span>
          <Tooltip content="Add dependency">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAdding(!adding)}
              className="h-7 w-7 text-slate-400 hover:text-slate-200"
            >
              {adding ? <FiX size={14} /> : <FiPlus size={14} />}
            </Button>
          </Tooltip>
        </div>

        {adding && availableIssues.length > 0 && (
          <div className="mb-3 max-h-32 overflow-y-auto rounded border border-slate-600 bg-slate-800">
            {availableIssues.map((i) => {
              const st = statuses[i.status];
              return (
                <Button
                  key={i.id}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onDependenciesChange(issue.id, [...deps, i.id]);
                    setAdding(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 h-auto justify-start rounded-none font-normal"
                >
                  <st.icon size={12} className={st.color} />
                  <span className="text-slate-300 truncate" title={i.title}>
                    {i.title}
                  </span>
                </Button>
              );
            })}
          </div>
        )}

        {depIssues.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No dependencies</p>
        ) : (
          <div className="space-y-1">
            {depIssues.map((dep) => {
              const st = statuses[dep.status];
              const StIcon = st.icon;
              return (
                <div
                  key={dep.id}
                  className="flex items-center justify-between rounded px-2 py-1 bg-slate-800/50"
                  data-testid={`dep-blocked-by-${dep.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StIcon size={12} className={st.color} />
                    <span className="text-sm text-slate-300 truncate" title={dep.title}>
                      {dep.title}
                    </span>
                    <Badge variant="outline" className={`text-[10px] border-transparent ${st.color}`}>
                      {st.label}
                    </Badge>
                  </div>
                  <Tooltip content="Remove dependency">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        onDependenciesChange(
                          issue.id,
                          deps.filter((d) => d !== dep.id),
                        )
                      }
                      className="h-6 w-6 text-slate-400 hover:text-red-400"
                    >
                      <FiX size={12} />
                    </Button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Blocking (reverse dependencies) */}
      {blockingIssues.length > 0 && (
        <div>
          <Separator className="mb-4 bg-slate-700/50" />
          <span className="text-xs font-medium text-orange-400 uppercase tracking-wider block mb-2">
            <FiAlertTriangle className="inline mr-1 -mt-0.5" size={11} />
            Blocking ({blockingIssues.length})
          </span>
          <div className="space-y-1">
            {blockingIssues.map((blocked) => {
              const st = statuses[blocked.status as IssueStatus] || statuses.open;
              const StIcon = st.icon;
              return (
                <div
                  key={blocked.id}
                  className="flex items-center rounded px-2 py-1 bg-orange-500/5 border border-orange-500/10"
                  data-testid={`dep-blocking-${blocked.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StIcon size={12} className={st.color} />
                    <span className="text-sm text-slate-300 truncate">{blocked.title}</span>
                    <Badge variant="outline" className={`text-[10px] border-transparent ${st.color}`}>
                      {st.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
