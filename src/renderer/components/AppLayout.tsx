import { useState } from 'react';
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
    </div>
  );
}

function PageContent({ page }: { page: string }) {
  switch (page) {
    case 'agents':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Agents</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
            <p className="text-lg mb-2">No agents running</p>
            <p className="text-sm">Spawn an agent to get started</p>
            <button
              type="button"
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              Spawn Agent
            </button>
          </div>
        </div>
      );
    case 'mail':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Mail</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
            <p>No messages</p>
          </div>
        </div>
      );
    case 'merge':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Merge Queue</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
            <p>No merges in queue</p>
          </div>
        </div>
      );
    case 'tasks':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Tasks</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
            <p>No tasks created</p>
          </div>
        </div>
      );
    case 'settings':
      return (
        <div>
          <h1 className="text-2xl font-bold text-slate-50 mb-4">Settings</h1>
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
            <p className="text-slate-400">Settings will be configured here</p>
          </div>
        </div>
      );
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
