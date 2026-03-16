import { useRef } from 'react';
import type { Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AgentProcessInfo, Session } from '../../../../shared/types';
import { AgentCard } from './AgentCard';

/** Virtualized card list for agent cards - only renders visible cards for 100+ agent performance */
export function VirtualizedCardList({
  rows,
  runningProcesses,
  childCountMap,
  selectedAgents,
  toggleAgentSelection,
  requestStopAgent,
  handleNudgeAgent,
  onSelectAgent,
  handleAgentContextMenu,
}: {
  rows: Row<Session>[];
  runningProcesses: AgentProcessInfo[];
  childCountMap: Record<string, number>;
  selectedAgents: Set<string>;
  toggleAgentSelection: (id: string) => void;
  requestStopAgent: (id: string, name: string) => void;
  handleNudgeAgent: (id: string) => void;
  onSelectAgent?: (id: string) => void;
  handleAgentContextMenu: (e: React.MouseEvent, session: Session) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  if (rows.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{ maxHeight: '600px', overflowY: 'auto' }}
      data-testid="virtualized-card-list"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          const session = row.original;
          const proc = runningProcesses.find((p) => p.id === session.id);
          return (
            <div
              key={session.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: '12px',
              }}
            >
              <AgentCard
                session={session}
                processInfo={proc}
                childCount={childCountMap[session.agent_name] || 0}
                isSelected={selectedAgents.has(session.id)}
                onToggleSelect={() => toggleAgentSelection(session.id)}
                onStop={() => requestStopAgent(session.id, session.agent_name)}
                onNudge={() => handleNudgeAgent(session.id)}
                onSelect={() => onSelectAgent?.(session.id)}
                onContextMenu={(e) => handleAgentContextMenu(e, session)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
