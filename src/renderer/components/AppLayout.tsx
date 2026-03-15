import { useCallback, useState } from 'react';
import { AgentDefinitionsPage } from '../pages/AgentDefinitionsPage';
import { AgentDetailPage } from '../pages/AgentDetailPage';
import { AgentsPage } from '../pages/AgentsPage';
import { DebugPage } from '../pages/DebugPage';
import { DiscoveryPage } from '../pages/DiscoveryPage';
import { ExpertisePage } from '../pages/ExpertisePage';
import { GuardRulesPage } from '../pages/GuardRulesPage';
import { MailPage } from '../pages/MailPage';
import { MergeQueuePage } from '../pages/MergeQueuePage';
import { MetricsPage } from '../pages/MetricsPage';
import { PromptsPage } from '../pages/PromptsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';
import { WorktreesPage } from '../pages/WorktreesPage';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
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
        <ErrorBoundary sectionName="Sidebar">
          <Sidebar
            currentPage={currentPage === 'agent-detail' ? 'agents' : currentPage}
            onNavigate={handleNavigate}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </ErrorBoundary>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-slate-900 p-6">
          <ErrorBoundary sectionName="Page content">
            <PageContent
              page={currentPage}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleSelectAgent}
              onBackFromDetail={handleBackFromDetail}
            />
          </ErrorBoundary>
        </main>
      </div>

      {/* Status bar */}
      <ErrorBoundary sectionName="Status bar">
        <StatusBar onNavigate={handleNavigate} />
      </ErrorBoundary>

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
      return (
        <ErrorBoundary sectionName="Agents">
          <AgentsPage onSelectAgent={onSelectAgent} />
        </ErrorBoundary>
      );
    case 'agent-detail':
      if (selectedAgentId) {
        return (
          <ErrorBoundary sectionName="Agent Detail">
            <AgentDetailPage agentId={selectedAgentId} onBack={onBackFromDetail} />
          </ErrorBoundary>
        );
      }
      return (
        <ErrorBoundary sectionName="Agents">
          <AgentsPage onSelectAgent={onSelectAgent} />
        </ErrorBoundary>
      );
    case 'mail':
      return (
        <ErrorBoundary sectionName="Mail">
          <MailPage />
        </ErrorBoundary>
      );
    case 'definitions':
      return (
        <ErrorBoundary sectionName="Agent Definitions">
          <AgentDefinitionsPage />
        </ErrorBoundary>
      );
    case 'worktrees':
      return (
        <ErrorBoundary sectionName="Worktrees">
          <WorktreesPage />
        </ErrorBoundary>
      );
    case 'merge':
      return (
        <ErrorBoundary sectionName="Merge Queue">
          <MergeQueuePage />
        </ErrorBoundary>
      );
    case 'guard-rules':
      return (
        <ErrorBoundary sectionName="Guard Rules">
          <GuardRulesPage />
        </ErrorBoundary>
      );
    case 'tasks':
      return (
        <ErrorBoundary sectionName="Tasks">
          <TasksPage />
        </ErrorBoundary>
      );
    case 'discovery':
      return (
        <ErrorBoundary sectionName="Discovery">
          <DiscoveryPage />
        </ErrorBoundary>
      );
    case 'prompts':
      return (
        <ErrorBoundary sectionName="Prompts">
          <PromptsPage />
        </ErrorBoundary>
      );
    case 'expertise':
      return (
        <ErrorBoundary sectionName="Expertise">
          <ExpertisePage />
        </ErrorBoundary>
      );
    case 'metrics':
      return (
        <ErrorBoundary sectionName="Metrics">
          <MetricsPage />
        </ErrorBoundary>
      );
    case 'settings':
      return (
        <ErrorBoundary sectionName="Settings">
          <SettingsPage />
        </ErrorBoundary>
      );
    case 'debug':
      return (
        <ErrorBoundary sectionName="Debug">
          <DebugPage />
        </ErrorBoundary>
      );
    default:
      return (
        <div className="text-slate-400">
          <p>Page not found</p>
        </div>
      );
  }
}
