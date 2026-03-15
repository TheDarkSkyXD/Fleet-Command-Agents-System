import { useState } from 'react';
import { AgentDefinitionsPage } from '../pages/AgentDefinitionsPage';
import { AgentsPage } from '../pages/AgentsPage';
import { MergeQueuePage } from '../pages/MergeQueuePage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';
import { WorktreesPage } from '../pages/WorktreesPage';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

export function AppLayout() {
  const [currentPage, setCurrentPage] = useState('agents');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-50">
      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Content */}
        <main className="flex-1 overflow-auto bg-slate-900 p-6">
          <PageContent page={currentPage} />
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette onNavigate={setCurrentPage} />
    </div>
  );
}

function PageContent({ page }: { page: string }) {
  switch (page) {
    case 'agents':
      return <AgentsPage />;
    case 'mail':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Mail</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
            <p>No messages</p>
          </div>
        </div>
      );
    case 'definitions':
      return <AgentDefinitionsPage />;
    case 'worktrees':
      return <WorktreesPage />;
    case 'merge':
      return <MergeQueuePage />;
    case 'tasks':
      return <TasksPage />;
    case 'settings':
      return <SettingsPage />;
    case 'debug':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Debug</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
            <p className="text-slate-400">Debug terminal and log viewer</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="text-slate-400">
          <p>Page not found</p>
        </div>
      );
  }
}
