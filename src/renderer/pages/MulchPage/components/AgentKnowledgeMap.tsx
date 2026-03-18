import { FiDatabase, FiUser } from 'react-icons/fi';
import type { ExpertiseRecord } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { DOMAIN_COLORS, CLASSIFICATION_STYLES } from './constants';

interface AgentKnowledgeMapProps {
  records: ExpertiseRecord[];
}

interface AgentDomainEntry {
  domain: string;
  count: number;
  types: Record<string, number>;
  classifications: Record<string, number>;
}

export function AgentKnowledgeMap({ records }: AgentKnowledgeMapProps) {
  // Build agent → domain → stats map
  const agentMap = new Map<string, AgentDomainEntry[]>();
  for (const r of records) {
    const agent = r.agent_name || 'manual';
    if (!agentMap.has(agent)) agentMap.set(agent, []);

    const entries = agentMap.get(agent)!;
    let entry = entries.find((e) => e.domain === r.domain);
    if (!entry) {
      entry = { domain: r.domain, count: 0, types: {}, classifications: {} };
      entries.push(entry);
    }
    entry.count++;
    entry.types[r.type] = (entry.types[r.type] || 0) + 1;
    entry.classifications[r.classification] = (entry.classifications[r.classification] || 0) + 1;
  }

  // Sort agents by total contributions
  const sortedAgents = [...agentMap.entries()]
    .map(([name, domains]) => ({
      name,
      domains: domains.sort((a, b) => b.count - a.count),
      total: domains.reduce((sum, d) => sum + d.count, 0),
    }))
    .sort((a, b) => b.total - a.total);

  if (sortedAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <FiUser size={32} className="mb-3 opacity-40" />
        <p className="text-sm">No agent knowledge recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedAgents.map(({ name, domains, total }) => (
        <Card key={name} className="border-slate-700/50 bg-slate-800/40">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-100 flex items-center gap-2">
                <FiUser size={13} className="text-blue-400" />
                {name}
              </CardTitle>
              <Badge variant="outline" className="bg-slate-700/30 text-slate-400 border-slate-600 text-[10px] px-1.5 py-0">
                {total} records across {domains.length} domains
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 gap-2">
              {domains.map((d) => {
                const domColor = DOMAIN_COLORS[d.domain] || DOMAIN_COLORS.default;
                return (
                  <div
                    key={d.domain}
                    className="rounded-md border border-slate-700/50 bg-slate-800/30 p-2.5"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <FiDatabase size={10} className={domColor.split(' ')[1]} />
                        <span className="text-xs font-medium text-slate-200">{d.domain}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{d.count}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(d.classifications).map(([cls, cnt]) => {
                        const style = CLASSIFICATION_STYLES[cls as keyof typeof CLASSIFICATION_STYLES];
                        return style ? (
                          <Badge key={cls} variant="outline" className={`${style.color} text-[8px] px-1 py-0`}>
                            {style.label}: {cnt}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
