import { FiFile, FiHash } from 'react-icons/fi';
import type { Session } from '../../../../shared/types';
import { Card, CardContent } from '../../../components/ui/card';

export function AgentFilesTab({ session }: { session: Session }) {
  const fileScope = (() => {
    try {
      return JSON.parse(session.file_scope || '[]') as string[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="space-y-4">
        {/* File scope section */}
        <Card className="border-slate-700 bg-slate-800/60 p-0">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FiFile className="h-4 w-4 text-blue-400" />
              Assigned File Scope
            </h3>
            {fileScope.length > 0 ? (
              <div className="space-y-1">
                {fileScope.map((file) => (
                  <div
                    key={file}
                    className="flex items-center gap-2 rounded-md bg-slate-700/40 px-3 py-2 text-sm font-mono text-slate-300"
                  >
                    <FiFile className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {file}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                No file scope assigned. This agent can modify any files.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Worktree info */}
        {session.worktree_path && (
          <Card className="border-slate-700 bg-slate-800/60 p-0">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FiHash className="h-4 w-4 text-emerald-400" />
                Worktree
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Path:</span>
                  <span className="font-mono text-slate-300">{session.worktree_path}</span>
                </div>
                {session.branch_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Branch:</span>
                    <span className="font-mono text-emerald-400">{session.branch_name}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
