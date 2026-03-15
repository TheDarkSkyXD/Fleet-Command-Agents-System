import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentDefinitionsPage } from '../pages/AgentDefinitionsPage';
import { AgentDetailPage } from '../pages/AgentDetailPage';
import { AgentsPage } from '../pages/AgentsPage';
import { DebugPage } from '../pages/DebugPage';
import { DiscoveryPage } from '../pages/DiscoveryPage';
import { DoctorPage } from '../pages/DoctorPage';
import { EventFeedPage } from '../pages/EventFeedPage';
import { ExpertisePage } from '../pages/ExpertisePage';
import { GuardRulesPage } from '../pages/GuardRulesPage';
import { HooksPage } from '../pages/HooksPage';
import { MailPage } from '../pages/MailPage';
import { MergeQueuePage } from '../pages/MergeQueuePage';
import { MetricsPage } from '../pages/MetricsPage';
import { NuclearCleanupPage } from '../pages/NuclearCleanupPage';
import { PromptsPage } from '../pages/PromptsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';
import { WelcomePage } from '../pages/WelcomePage';
import { WorktreesPage } from '../pages/WorktreesPage';
import { useProjectStore } from '../stores/projectStore';
import { useSettingsStore } from '../stores/settingsStore';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { OnboardingTour } from './OnboardingTour';
import { OrphanedProcessDialog } from './OrphanedProcessDialog';
import { SetupWizard } from './SetupWizard';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { UpdateBanner } from './UpdateBanner';

export function AppLayout() {
  const [currentPage, setCurrentPage] = useState('welcome');
  const { settings, loaded, updateSetting } = useSettingsStore();
  const sidebarCollapsed = settings.sidebarCollapsed;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Load settings on mount (includes sidebar collapsed state)
  useEffect(() => {
    if (!loaded) {
      useSettingsStore.getState().loadSettings();
    }
  }, [loaded]);

  // Dynamic window title: shows project name and active agent count
  const { activeProject, loadActiveProject } = useProjectStore();
  const [activeAgentCount, setActiveAgentCount] = useState(0);
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadActiveProject();
  }, [loadActiveProject]);

  // Poll agent count every 3 seconds for window title
  useEffect(() => {
    async function fetchAgentCount() {
      try {
        const result = await window.electronAPI.agentRunningList();
        if (result.data) {
          setActiveAgentCount(result.data.filter((a) => a.isRunning).length);
        }
      } catch {
        // Silently ignore errors
      }
    }
    fetchAgentCount();
    titleIntervalRef.current = setInterval(fetchAgentCount, 3000);
    return () => {
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
    };
  }, []);

  // Update window title when project or agent count changes
  useEffect(() => {
    const projectName = activeProject?.name || 'No Project';
    const agentSuffix =
      activeAgentCount > 0
        ? ` (${activeAgentCount} agent${activeAgentCount === 1 ? '' : 's'})`
        : '';
    const title = `Fleet Command - ${projectName}${agentSuffix}`;
    window.electronAPI.windowSetTitle(title).catch(() => {});
  }, [activeProject, activeAgentCount]);

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

  const handleProjectOpened = useCallback(() => {
    setCurrentPage('agents');
    loadActiveProject();
  }, [loadActiveProject]);

  // Listen for notification click -> navigate to agent detail
  useEffect(() => {
    window.electronAPI.onNotificationNavigateToAgent(async (data: { agentName: string }) => {
      try {
        const result = await window.electronAPI.agentList();
        if (result.data) {
          const agent = result.data.find(
            (a: { agent_name: string }) => a.agent_name === data.agentName,
          );
          if (agent) {
            setSelectedAgentId(agent.id);
            setCurrentPage('agent-detail');
          }
        }
      } catch {
        // Silently ignore - best effort navigation
      }
    });
  }, []);

  // Setup wizard: show on first launch when setupCompleted is false
  const showSetupWizard = loaded && !settings.setupCompleted;

  const handleSetupComplete = useCallback(() => {
    updateSetting('setupCompleted', true);
  }, [updateSetting]);

  // Welcome page shows full-screen without sidebar
  if (currentPage === 'welcome') {
    return (
      <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-50">
        {showSetupWizard && <SetupWizard onComplete={handleSetupComplete} />}
        <OrphanedProcessDialog />
        <UpdateBanner />
        <main className="flex-1 overflow-auto bg-slate-900">
          <ErrorBoundary sectionName="Welcome">
            <WelcomePage onProjectOpened={handleProjectOpened} />
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-50">
      {/* Setup Wizard - shown on first launch */}
      {showSetupWizard && <SetupWizard onComplete={handleSetupComplete} />}
      <OrphanedProcessDialog />

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
            onToggleCollapse={() => updateSetting('sidebarCollapsed', !sidebarCollapsed)}
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
    case 'hooks':
      return (
        <ErrorBoundary sectionName="Hooks">
          <HooksPage />
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
    case 'events':
      return (
        <ErrorBoundary sectionName="Event Feed">
          <EventFeedPage />
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
    case 'doctor':
      return (
        <ErrorBoundary sectionName="Doctor">
          <DoctorPage />
        </ErrorBoundary>
      );
    case 'cleanup':
      return (
        <ErrorBoundary sectionName="Nuclear Cleanup">
          <NuclearCleanupPage />
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
