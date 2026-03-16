import { useMemo, useState } from 'react';
import type { PromptVersion } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableRow, TableCell } from '../../../components/ui/table';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { computeLineDiff } from './utils';

export function VersionDiffViewer({
  promptName,
  versions,
  onClose,
}: {
  promptName: string;
  versions: PromptVersion[];
  onClose: () => void;
}) {
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => a.version - b.version),
    [versions],
  );

  const [leftVersionId, setLeftVersionId] = useState(
    sortedVersions.length >= 2
      ? sortedVersions[sortedVersions.length - 2].id
      : sortedVersions[0]?.id || '',
  );
  const [rightVersionId, setRightVersionId] = useState(
    sortedVersions[sortedVersions.length - 1]?.id || '',
  );

  const leftVersion = sortedVersions.find((v) => v.id === leftVersionId);
  const rightVersion = sortedVersions.find((v) => v.id === rightVersionId);

  const diffLines = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    return computeLineDiff(leftVersion.content, rightVersion.content);
  }, [leftVersion, rightVersion]);

  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/98"
      data-testid="version-diff-viewer"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-50">Compare Versions</h2>
          <span className="text-sm text-slate-400">{'\u2014'} {promptName}</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs text-emerald-400 border-0">+{addedCount} added</Badge>
          <Badge variant="outline" className="text-xs text-red-400 border-0">{'\u2212'}{removedCount} removed</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            data-testid="diff-close-btn"
          >
            Close
          </Button>
        </div>
      </div>

      {/* Version selectors */}
      <div className="flex items-center gap-4 border-b border-slate-700 bg-slate-800/60 px-6 py-2.5">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Label className="font-medium text-red-400">Old:</Label>
          <Select value={leftVersionId} onValueChange={(v) => setLeftVersionId(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[240px] border-slate-600 bg-slate-900 text-sm text-slate-200" data-testid="diff-left-selector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedVersions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version} {'\u2014'} {new Date(v.created_at).toLocaleString()}
                  {v.change_summary ? ` (${v.change_summary})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-slate-400">{'\u2192'}</span>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Label className="font-medium text-emerald-400">New:</Label>
          <Select value={rightVersionId} onValueChange={(v) => setRightVersionId(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[240px] border-slate-600 bg-slate-900 text-sm text-slate-200" data-testid="diff-right-selector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedVersions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version} {'\u2014'} {new Date(v.created_at).toLocaleString()}
                  {v.change_summary ? ` (${v.change_summary})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-sm" data-testid="diff-content">
        {leftVersion && rightVersion && leftVersion.id === rightVersion.id ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select two different versions to compare
          </div>
        ) : diffLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            No differences found
          </div>
        ) : (
          <Table className="w-full border-collapse">
            <TableBody>
              {diffLines.map((line, idx) => (
                <TableRow
                  key={`diff-${line.type}-${line.leftNum ?? 'n'}-${line.rightNum ?? 'n'}-${idx}`}
                  className={
                    line.type === 'added'
                      ? 'bg-emerald-500/10'
                      : line.type === 'removed'
                        ? 'bg-red-500/10'
                        : ''
                  }
                >
                  {/* Left line number */}
                  <TableCell className="w-12 select-none border-r border-slate-700/50 px-2 py-0.5 text-right text-xs text-slate-400 align-top">
                    {line.leftNum ?? ''}
                  </TableCell>
                  {/* Right line number */}
                  <TableCell className="w-12 select-none border-r border-slate-700/50 px-2 py-0.5 text-right text-xs text-slate-400 align-top">
                    {line.rightNum ?? ''}
                  </TableCell>
                  {/* Change indicator */}
                  <TableCell
                    className={`w-6 select-none px-1 py-0.5 text-center text-xs font-bold ${
                      line.type === 'added'
                        ? 'text-emerald-400'
                        : line.type === 'removed'
                          ? 'text-red-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '\u2212' : ' '}
                  </TableCell>
                  {/* Content */}
                  <TableCell
                    className={`px-3 py-0.5 whitespace-pre-wrap ${
                      line.type === 'added'
                        ? 'text-emerald-200'
                        : line.type === 'removed'
                          ? 'text-red-200'
                          : 'text-slate-300'
                    }`}
                    data-testid={
                      line.type === 'added'
                        ? 'diff-addition'
                        : line.type === 'removed'
                          ? 'diff-deletion'
                          : undefined
                    }
                  >
                    {line.content}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
