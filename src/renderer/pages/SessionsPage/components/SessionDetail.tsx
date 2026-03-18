import {
  FiActivity,
  FiX,
} from 'react-icons/fi';
import type { Session, Checkpoint, SessionHandoff } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';
import { STATE_COLORS, CAPABILITY_COLORS } from './constants';

interface SessionDetailProps {
  session: Session;
  checkpoint: Checkpoint | null;
  handoffs: SessionHandoff[];
  onClose: () => void;
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className={`text-xs text-slate-200 text-right truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export function SessionDetail({ session, checkpoint, handoffs, onClose }: SessionDetailProps) {
  const stateColor = STATE_COLORS[session.state] || 'bg-slate-600/20 text-slate-300';
  const capColor = CAPABILITY_COLORS[session.capability] || 'bg-slate-600/20 text-slate-300';

  return (
    <Card className="w-96 border-slate-700 bg-slate-800/60 h-fit sticky top-6 shrink-0">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-50 flex items-center gap-2">
            <FiActivity className="text-blue-400" size={14} />
            Session Detail
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-slate-200"
            onClick={onClose}
          >
            <FiX size={14} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        <div className="space-y-3">
          {/* Identity */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Identity</h4>
            <div className="space-y-2">
              <DetailRow label="Agent" value={session.agent_name} />
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-slate-400 shrink-0">Capability</span>
                <Badge variant="outline" className={`${capColor} text-[10px] px-1.5 py-0`}>
                  {session.capability}
                </Badge>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-slate-400 shrink-0">State</span>
                <Badge variant="outline" className={`${stateColor} text-[10px] px-1.5 py-0`}>
                  {session.state}
                </Badge>
              </div>
              <DetailRow label="Model" value={session.model || '\u2014'} />
              <DetailRow label="Depth" value={String(session.depth)} />
              <DetailRow label="Escalation" value={String(session.escalation_level)} />
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Hierarchy */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Hierarchy</h4>
            <div className="space-y-2">
              <DetailRow label="Parent" value={session.parent_agent || 'Root (no parent)'} />
              <DetailRow label="Run ID" value={session.run_id || '\u2014'} mono />
              <DetailRow label="Task ID" value={session.task_id || '\u2014'} mono />
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Git / Worktree */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Worktree</h4>
            <div className="space-y-2">
              <DetailRow label="Branch" value={session.branch_name || '\u2014'} mono />
              <DetailRow label="Worktree" value={session.worktree_path || '\u2014'} mono />
              {session.file_scope && (
                <div>
                  <span className="text-xs text-slate-400">File Scope</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {session.file_scope.split(',').map((scope) => (
                      <Badge key={scope} variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600 text-[10px] px-1.5 py-0">
                        {scope.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Timestamps */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Timeline</h4>
            <div className="space-y-2">
              <DetailRow label="Created" value={session.created_at} />
              <DetailRow label="Updated" value={session.updated_at} />
              {session.completed_at && <DetailRow label="Completed" value={session.completed_at} />}
              {session.stalled_at && <DetailRow label="Stalled" value={session.stalled_at} />}
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* IDs */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">IDs</h4>
            <div className="space-y-2">
              <DetailRow label="Session ID" value={session.id} mono />
              {session.pid && <DetailRow label="PID" value={String(session.pid)} mono />}
              {session.prompt_version && <DetailRow label="Prompt Ver" value={session.prompt_version} />}
            </div>
          </div>

          {/* Checkpoint */}
          {checkpoint && (
            <>
              <Separator className="bg-slate-700" />
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Checkpoint</h4>
                <div className="space-y-2">
                  {checkpoint.progress_summary && (
                    <div>
                      <span className="text-xs text-slate-400">Progress</span>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{checkpoint.progress_summary}</p>
                    </div>
                  )}
                  {checkpoint.pending_work && (
                    <div>
                      <span className="text-xs text-slate-400">Pending Work</span>
                      <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">{checkpoint.pending_work}</p>
                    </div>
                  )}
                  {checkpoint.files_modified && (
                    <div>
                      <span className="text-xs text-slate-400">Files Modified</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {JSON.parse(checkpoint.files_modified).map((f: string) => (
                          <Badge key={f} variant="outline" className="bg-emerald-600/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <DetailRow label="Saved" value={checkpoint.timestamp} />
                </div>
              </div>
            </>
          )}

          {/* Handoffs */}
          {handoffs.length > 0 && (
            <>
              <Separator className="bg-slate-700" />
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Handoffs ({handoffs.length})
                </h4>
                <div className="space-y-2">
                  {handoffs.map((h) => (
                    <div key={h.id} className="rounded-md border border-slate-700 bg-slate-800/50 p-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-mono">{h.from_session.slice(0, 8)}... → {h.to_session.slice(0, 8)}...</span>
                        {h.reason && (
                          <Badge variant="outline" className="bg-slate-700/50 text-slate-400 border-slate-600 text-[9px] px-1 py-0">
                            {h.reason}
                          </Badge>
                        )}
                      </div>
                      <span className="text-slate-500">{h.created_at}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
