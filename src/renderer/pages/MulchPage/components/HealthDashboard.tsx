import { FiAlertTriangle, FiCheckCircle, FiClock, FiTrendingUp } from 'react-icons/fi';
import type { ExpertiseRecord, ExpertiseDomainSummary } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { CLASSIFICATION_STYLES } from './constants';

interface HealthDashboardProps {
  records: ExpertiseRecord[];
  domains: ExpertiseDomainSummary[];
}

export function HealthDashboard({ records, domains }: HealthDashboardProps) {
  // Classification breakdown
  const classBreakdown = { foundational: 0, tactical: 0, observational: 0 };
  for (const r of records) {
    if (r.classification in classBreakdown) {
      classBreakdown[r.classification as keyof typeof classBreakdown]++;
    }
  }

  // Type breakdown
  const typeBreakdown: Record<string, number> = {};
  for (const r of records) {
    typeBreakdown[r.type] = (typeBreakdown[r.type] || 0) + 1;
  }

  // Expiring soon (within 7 days)
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const expiringSoon = records.filter((r) => {
    if (!r.expires_at) return false;
    const expiry = new Date(r.expires_at).getTime();
    return expiry > now && expiry - now < sevenDays;
  });

  // Already expired
  const expired = records.filter((r) => {
    if (!r.expires_at) return false;
    return new Date(r.expires_at).getTime() < now;
  });

  // Agent contribution
  const agentContributions: Record<string, number> = {};
  for (const r of records) {
    const agent = r.agent_name || 'manual';
    agentContributions[agent] = (agentContributions[agent] || 0) + 1;
  }
  const topContributors = Object.entries(agentContributions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Recent activity (last 24h)
  const oneDayAgo = now - 86400000;
  const recentCount = records.filter((r) => new Date(r.created_at).getTime() > oneDayAgo).length;

  return (
    <div className="space-y-5">
      {/* Top metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Total Memories"
          value={records.length}
          icon={FiTrendingUp}
          color="text-blue-400"
        />
        <MetricCard
          label="Domains"
          value={domains.length}
          icon={FiCheckCircle}
          color="text-emerald-400"
        />
        <MetricCard
          label="Last 24h"
          value={recentCount}
          icon={FiClock}
          color="text-purple-400"
        />
        <MetricCard
          label="Expiring Soon"
          value={expiringSoon.length}
          icon={FiAlertTriangle}
          color={expiringSoon.length > 0 ? 'text-amber-400' : 'text-slate-400'}
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Classification breakdown */}
        <Card className="border-slate-700/50 bg-slate-800/40">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Classification Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-3">
              {(Object.entries(classBreakdown) as [keyof typeof classBreakdown, number][]).map(([cls, count]) => {
                const style = CLASSIFICATION_STYLES[cls];
                const pct = records.length > 0 ? (count / records.length) * 100 : 0;
                return (
                  <div key={cls}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`${style.color} text-[10px] px-1.5 py-0`}>
                          {style.label}
                        </Badge>
                        <span className="text-[10px] text-slate-500">{style.description}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-300">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-current opacity-60 transition-all"
                        style={{ width: `${pct}%`, color: style.color.includes('orange') ? '#fb923c' : style.color.includes('sky') ? '#38bdf8' : '#94a3b8' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Type breakdown */}
        <Card className="border-slate-700/50 bg-slate-800/40">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {Object.entries(typeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const pct = records.length > 0 ? (count / records.length) * 100 : 0;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-20 shrink-0 capitalize">{type}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500/60 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-300 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Top contributors */}
        <Card className="border-slate-700/50 bg-slate-800/40">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Agent Contributions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {topContributors.length === 0 ? (
              <p className="text-xs text-slate-500">No contributions yet</p>
            ) : (
              <div className="space-y-2">
                {topContributors.map(([agent, count]) => (
                  <div key={agent} className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 truncate">{agent}</span>
                    <Badge variant="outline" className="bg-slate-700/30 text-slate-400 border-slate-600 text-[10px] px-1.5 py-0">
                      {count} records
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring records */}
        <Card className="border-slate-700/50 bg-slate-800/40">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Expiring Records
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {expired.length === 0 && expiringSoon.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <FiCheckCircle size={12} />
                <span>No records expiring soon</span>
              </div>
            ) : (
              <div className="space-y-2">
                {expired.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-red-400">Expired</span>
                    <Badge variant="outline" className="bg-red-600/10 text-red-400 border-red-500/20 text-[10px] px-1.5 py-0">
                      {expired.length} records
                    </Badge>
                  </div>
                )}
                {expiringSoon.map((r) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 truncate">{r.title}</span>
                    <span className="text-[10px] text-amber-400 shrink-0">
                      expires {new Date(r.expires_at!).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <Card className="border-slate-700/50 bg-slate-800/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
          <Icon size={14} className={color} />
        </div>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}
