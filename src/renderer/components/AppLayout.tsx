import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { hasUnsavedChanges, useNavigationGuard } from '../hooks/useUnsavedChanges';
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
import { NotificationsPage } from '../pages/NotificationsPage';
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
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { UpdateBanner } from './UpdateBanner';

// Parse hash to extract page and optional agent ID
function parseHash(hash: string): { page: string; agentId?: string } {
  const cleaned = hash.replace(/^#\/?/, '');
  if (!cleaned) return { page: 'welcome' };

  // Handle agent-detail deep links: #/agent-detail/{agentId}
  const agentDetailMatch = cleaned.match(/^agent-detail\/(.+)$/);
  if (agentDetailMatch) {
    return { page: 'agent-detail', agentId: agentDetailMatch[1] };
  }

  return { page: cleaned };
}

// Build hash from page and optional agent ID
function buildHash(page: string, agentId?: string | null): string {
  if (page === 'agent-detail' && agentId) {
    return `#/agent-detail/${agentId}`;
  }
  if (page === 'welcome') return '';
  return `#/${page}`;
}

// Parse initial URL hash once at module load (before component mounts)
const appInitialState = parseHash(window.location.hash);

export function AppLayout() {
  const [currentPage, setCurrentPage] = useState(appInitialState.page);
  const { settings, loaded, updateSetting } = useSettingsStore();
  const sidebarCollapsed = settings.sidebarCollapsed;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    appInitialState.agentId || null,
  );

  // Replace initial history entry with current page state (so popstate has correct state)
  useEffect(() => {
    const hash = buildHash(appInitialState.page, appInitialState.agentId);
    window.history.replaceState(
      { page: appInitialState.page, agentId: appInitialState.agentId },
      '',
      hash || window.location.pathname,
    );
  }, []);

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

    // Listen for agent state change events for immediate cascading updates
    window.electronAPI.onAgentUpdate(() => {
      fetchAgentCount();
    });

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

  // Unsaved changes navigation guard
  const {
    showDialog: showUnsavedDialog,
    dirtyFormLabels,
    guardNavigation,
    confirmLeave,
    cancelLeave,
  } = useNavigationGuard();

  // Execute a navigation action (shared between direct and post-confirm flows)
  const executeNavigation = useCallback((page: string, agentId?: string) => {
    if (page === 'agent-detail' && agentId) {
      setSelectedAgentId(agentId);
      const newHash = buildHash('agent-detail', agentId);
      window.history.pushState({ page: 'agent-detail', agentId }, '', newHash);
      setCurrentPage('agent-detail');
    } else {
      setCurrentPage((prev) => {
        if (prev !== page) {
          const newHash = buildHash(page);
          window.history.pushState({ page }, '', newHash || window.location.pathname);
        }
        return page;
      });
      if (page !== 'agent-detail') {
        setSelectedAgentId(null);
      }
    }
  }, []);

  const handleNavigate = useCallback(
    (page: string) => {
      const allowed = guardNavigation({ type: 'sidebar', page });
      if (!allowed) return; // Dialog will show
      executeNavigation(page);
    },
    [guardNavigation, executeNavigation],
  );

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      const allowed = guardNavigation({ type: 'agent-select', page: 'agent-detail', agentId });
      if (!allowed) return;
      executeNavigation('agent-detail', agentId);
    },
    [guardNavigation, executeNavigation],
  );

  // Handle confirmation from unsaved changes dialog
  const handleConfirmLeave = useCallback(() => {
    const nav = confirmLeave();
    if (nav) {
      executeNavigation(nav.page || 'agents', nav.agentId);
    }
  }, [confirmLeave, executeNavigation]);

  const handleBackFromDetail = useCallback(() => {
    // Use browser history back for proper back navigation
    window.history.back();
  }, []);

  const handleProjectOpened = useCallback(() => {
    const newHash = buildHash('agents');
    window.history.pushState({ page: 'agents' }, '', newHash);
    setCurrentPage('agents');
    loadActiveProject();
  }, [loadActiveProject]);

  // Listen for popstate events (browser back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const { page, agentId } = parseHash(window.location.hash);
      setCurrentPage(page);
      if (agentId) {
        setSelectedAgentId(agentId);
      } else if (page !== 'agent-detail') {
        setSelectedAgentId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen for notification events from main process -> show in-app toasts
  useEffect(() => {
    window.electronAPI.onNotificationEvent((data) => {
      const isError =
        data.eventType === 'agent_error' ||
        data.eventType === 'merge_failed' ||
        data.eventType === 'health_alert';
      const isWarning = data.eventType === 'agent_stalled' || data.eventType === 'agent_zombie';

      if (isError) {
        toast.error(data.title, {
          description: data.body,
          duration: 8000,
          style: {
            background: '#7f1d1d',
            border: '1px solid #dc2626',
            color: '#fecaca',
          },
        });
      } else if (isWarning) {
        toast.warning(data.title, {
          description: data.body,
          duration: 6000,
          style: {
            background: '#78350f',
            border: '1px solid #d97706',
            color: '#fde68a',
          },
        });
      } else {
        toast.success(data.title, {
          description: data.body,
          duration: 5000,
        });
      }
    });
  }, []);

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
            const newHash = buildHash('agent-detail', agent.id);
            window.history.pushState({ page: 'agent-detail', agentId: agent.id }, '', newHash);
            setSelectedAgentId(agent.id);
            setCurrentPage('agent-detail');
          }
        }
      } catch {
        // Silently ignore - best effort navigation
      }
    });
  }, []);

  // Refresh data when window becomes visible (after minimize-to-tray and restore)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh Zustand stores when window is restored from tray
        useProjectStore.getState().loadProjects();
        useProjectStore.getState().loadActiveProject();
        useSettingsStore.getState().loadSettings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Warn on window close/refresh if forms have unsaved changes (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        // Modern browsers show a generic message, but returnValue is required
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Setup wizard: show on first launch when setupCompleted is false
  const showSetupWizard = loaded && !settings.setupCompleted;

  const handleSetupComplete = useCallback(() => {
    updateSetting('setupCompleted', true);
  }, [updateSetting]);

  // Welcome page shows full-screen without sidebar
  if (currentPage === 'welcome') {
    return (
      <div
        className="flex h-screen w-screen min-w-[1024px] min-h-[680px] flex-col bg-slate-950 text-slate-50"
        data-testid="app-root"
        data-min-width="1024"
        data-min-height="680"
      >
        {showSetupWizard && <SetupWizard onComplete={handleSetupComplete} />}
        <OrphanedProcessDialog />
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-900">
          <ErrorBoundary sectionName="Welcome">
            <WelcomePage onProjectOpened={handleProjectOpened} />
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen min-w-[1024px] min-h-[680px] flex-col bg-slate-950 text-slate-50"
      data-testid="app-root"
      data-min-width="1024"
      data-min-height="680"
    >
      {/* Skip to content link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
        data-testid="skip-to-content"
      >
        Skip to content
      </a>

      {/* Setup Wizard - shown on first launch */}
      {showSetupWizard && <SetupWizard onComplete={handleSetupComplete} />}
      <OrphanedProcessDialog />

      {/* Update banner - appears at top when update available */}
      <UpdateBanner />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden" data-testid="app-main-area">
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
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-slate-900 p-6"
          data-testid="app-content-area"
          data-no-horizontal-scroll="true"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="h-full"
            >
              <ErrorBoundary sectionName="Page content">
                <PageContent
                  page={currentPage}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={handleSelectAgent}
                  onBackFromDetail={handleBackFromDetail}
                  onNavigateHome={() => handleNavigate('agents')}
                />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
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

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <UnsavedChangesDialog
          dirtyFormLabels={dirtyFormLabels}
          onStay={cancelLeave}
          onLeave={handleConfirmLeave}
        />
      )}
    </div>
  );
}

function PageContent({
  page,
  selectedAgentId,
  onSelectAgent,
  onBackFromDetail,
  onNavigateHome,
}: {
  page: string;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onBackFromDetail: () => void;
  onNavigateHome: () => void;
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
    case 'notifications':
      return (
        <ErrorBoundary sectionName="Notifications">
          <NotificationsPage />
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
        <div
          className="flex h-full flex-col items-center justify-center text-center"
          data-testid="not-found-page"
        >
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-800">
            <span className="text-4xl font-bold text-slate-400">404</span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-200">Page Not Found</h1>
          <p className="mb-1 text-slate-400">
            The page <span className="font-mono text-slate-300">"{page}"</span> does not exist.
          </p>
          <p className="mb-6 text-sm text-slate-400">
            It may have been moved or the URL is incorrect.
          </p>
          <button
            type="button"
            onClick={onNavigateHome}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500"
            data-testid="not-found-home-button"
          >
            Go to Agents
          </button>
        </div>
      );
  }
}
