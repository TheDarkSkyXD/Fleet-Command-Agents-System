import { useCallback, useState } from 'react';
import { AgentDefinitionsPage } from '../pages/AgentDefinitionsPage';
import { AgentDetailPage } from '../pages/AgentDetailPage';
import { AgentsPage } from '../pages/AgentsPage';
import { DebugPage } from '../pages/DebugPage';
import { ExpertisePage } from '../pages/ExpertisePage';
import { MailPage } from '../pages/MailPage';
import { MergeQueuePage } from '../pages/MergeQueuePage';
import { MetricsPage } from '../pages/MetricsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';
import { WorktreesPage } from '../pages/WorktreesPage';
import { CommandPalette } from './CommandPalette';
import { OnboardingTour } from './OnboardingTour';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { UpdateBanner } from './UpdateBanner';

export function AppLayout() {
  const [currentPage, setCurrentPage] = useState('agents');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page);
    // Clear agent detail when navigating away
    if (page !== 'agent-detail') {
      setSelectedAgentId(null);
    }
  }, []);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setCurrentPage('agent-detail');
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedAgentId(null);
    setCurrentPage('agents');
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-50">
      {/* Update banner - appears at top when update available */}
      <UpdateBanner />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentPage={currentPage === 'agent-detail' ? 'agents' : currentPage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Content */}
        <main className="flex-1 overflow-auto bg-slate-900 p-6">
          <PageContent
            page={currentPage}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
            onBackFromDetail={handleBackFromDetail}
          />
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette onNavigate={handleNavigate} />

      {/* Onboarding Tour (shows on first launch) */}
      {currentPage === 'agents' && <OnboardingTour />}
    </div>
  );
}

function PageContent({
  page,
  selectedAgentId,
  onSelectAgent,
  onBackFromDetail,
}: {
  page: string;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onBackFromDetail: () => void;
}) {
  switch (page) {
    case 'agents':
      return <AgentsPage onSelectAgent={onSelectAgent} />;
    case 'agent-detail':
      if (selectedAgentId) {
        return <AgentDetailPage agentId={selectedAgentId} onBack={onBackFromDetail} />;
      }
      return <AgentsPage onSelectAgent={onSelectAgent} />;
    case 'mail':
      return <MailPage />;
    case 'definitions':
      return <AgentDefinitionsPage />;
    case 'worktrees':
      return <WorktreesPage />;
    case 'merge':
      return <MergeQueuePage />;
    case 'tasks':
      return <TasksPage />;
    case 'expertise':
      return <ExpertisePage />;
    case 'metrics':
      return <MetricsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'debug':
      return <DebugPage />;
    default:
      return (
        <div className="text-slate-400">
          <p>Page not found</p>
        </div>
      );
  }
}
