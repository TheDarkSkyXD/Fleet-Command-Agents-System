import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFolder, FiFolderPlus, FiArrowRight, FiClock, FiPlus, FiCheck } from 'react-icons/fi';
import type { Project } from '../../../shared/types';
import { formatAbsoluteTime } from '../../components/RelativeTime';
import { formatRelativeTime } from '../../lib/dateFormatting';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import './ProjectsPage.css';

/* ─── Project row ─── */
function ProjectRow({
  project,
  isActive,
  onSelect,
}: {
  project: Project;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => onSelect(project.id)}
      className={`group relative h-auto w-full flex items-center gap-4 px-5 py-4 text-left transition-all duration-150 cursor-pointer ${
        isActive
          ? 'bg-blue-500/[0.07]'
          : 'hover:bg-white/[0.03]'
      }`}
    >
      {/* Active bar */}
      {isActive && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-blue-500" />
      )}

      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-500/15 text-blue-400'
          : 'bg-slate-700/30 text-slate-400 group-hover:bg-slate-700/50 group-hover:text-slate-300'
      }`}>
        <FiFolder size={16} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-slate-100 truncate" title={project.name}>
            {project.name}
          </span>
          {isActive && (
            <Badge variant="outline" className="shrink-0 gap-1 rounded-full bg-blue-500/12 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-blue-400 border-transparent">
              <FiCheck size={9} />
              Active
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-slate-400 font-mono truncate" title={project.path}>
          {project.path}
        </p>
      </div>

      {/* Timestamp */}
      <div className="shrink-0 flex items-center gap-1.5 text-slate-400 group-hover:text-slate-300 transition-colors">
        <FiClock size={11} />
        <span
          className="text-[11px]"
          title={project.last_opened_at ? formatAbsoluteTime(project.last_opened_at) : undefined}
        >
          {formatRelativeTime(project.last_opened_at)}
        </span>
      </div>

      {/* Hover arrow */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150 -translate-x-1 group-hover:translate-x-0">
        <FiArrowRight size={14} className="text-slate-400" />
      </div>
    </Button>
  );
}

/* ─── Main Projects Page ─── */
export function ProjectsPage() {
  const { projects, activeProject, loadProjects, switchProject, createProject } = useProjectStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadProjects().then(() => setLoaded(true));
  }, [loadProjects]);

  const handleSelectProject = async (id: string) => {
    await switchProject(id);
  };

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI.dialogSelectFolder();
      if (result.data) {
        const folderPath = result.data;
        const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'My Project';
        const project = await createProject(folderName, folderPath);
        if (project) {
          await switchProject(project.id);
        }
      }
    } catch {
      // User cancelled
    }
  };

  const recentProjects = projects.slice(0, 20);

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 tracking-[-0.02em]">Projects</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your project workspaces
          </p>
        </div>
        <Button
          onClick={handleBrowse}
          data-testid="add-project-button"
          className="group gap-2.5 rounded-[12px] bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300 px-5 py-2.5 font-semibold h-auto"
        >
          <FiPlus size={15} />
          New Project
        </Button>
      </div>

      {/* Project list container */}
      <div className="border border-slate-700/30 bg-slate-800/20">
        {/* List header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/20">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            All Projects
          </span>
          {recentProjects.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-blue-500/15 border border-blue-500/20 text-[10px] font-bold text-blue-400 tabular-nums px-1.5">
              {recentProjects.length}
            </span>
          )}
        </div>

        {/* Projects */}
        <AnimatePresence mode="wait">
          {!loaded ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-20"
            >
              <div className="relative">
                <div className="h-8 w-8 rounded-full border-2 border-slate-800" />
                <div className="absolute inset-0 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            </motion.div>
          ) : recentProjects.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center"
              data-testid="no-projects-empty-state"
            >
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-700/20 border border-slate-700/30">
                <FiFolder size={24} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-300 mb-1.5">No projects yet</p>
              <p className="text-[13px] text-slate-400 mb-6 max-w-xs mx-auto leading-relaxed">
                Add a Git repository to start orchestrating AI coding agents.
              </p>
              <Button
                onClick={handleBrowse}
                className="gap-2 rounded-[12px] bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300 px-6 py-2.5 font-semibold h-auto"
                data-testid="open-project-button"
              >
                <FiFolderPlus size={15} />
                Open Project
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="divide-y divide-slate-700/15 max-h-[calc(100vh-280px)] overflow-y-auto"
            >
              {recentProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isActive={activeProject?.id === project.id}
                  onSelect={handleSelectProject}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
