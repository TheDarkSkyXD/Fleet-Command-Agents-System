import { useRef } from 'react';
import { type Row, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Session } from '../../../../shared/types';
import { TableBody, TableRow, TableCell } from '../../../components/ui/table';

/** Virtualized table body for agent list - only renders visible rows */
export function VirtualizedTableBody({
  filteredRows,
  colCount,
  onSelectAgent,
  handleAgentContextMenu,
}: {
  filteredRows: Row<Session>[];
  colCount: number;
  onSelectAgent?: (id: string) => void;
  handleAgentContextMenu: (e: React.MouseEvent, session: Session) => void;
}) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => tbodyRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  if (filteredRows.length === 0) {
    return (
      <TableBody>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colCount} className="px-4 py-8 text-center text-sm text-slate-400">
            No agents match your filters
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody
      ref={tbodyRef}
      style={{ display: 'block', maxHeight: '600px', overflowY: 'auto' }}
      data-testid="virtualized-agent-list"
    >
      <TableRow
        className="hover:bg-transparent border-0"
        style={{
          display: 'block',
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        <TableCell style={{ display: 'block', padding: 0 }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = filteredRows[virtualItem.index];
            return (
              <div
                key={row.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors cursor-pointer ${row.original.state === 'working' || row.original.state === 'booting' ? 'animate-card-activity-pulse' : ''}`}
                onClick={() => onSelectAgent?.(row.original.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectAgent?.(row.original.id);
                }}
                onContextMenu={(e) => handleAgentContextMenu(e, row.original)}
                tabIndex={0}
              >
                {row.getVisibleCells().map((cell) => {
                  const size = cell.column.getSize();
                  const hasExplicitSize = size !== 150; // 150 is tanstack default
                  return (
                    <div
                      key={cell.id}
                      className="px-4 py-3 min-w-0 overflow-hidden"
                      style={hasExplicitSize ? { width: size, flexShrink: 0 } : { flex: 1, minWidth: 0 }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </TableCell>
      </TableRow>
    </TableBody>
  );
}
