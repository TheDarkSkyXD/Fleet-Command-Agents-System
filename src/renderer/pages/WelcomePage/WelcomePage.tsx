import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFolder, FiFolderPlus, FiArrowRight, FiClock, FiAnchor, FiPlus } from 'react-icons/fi';
import type { Project } from '../../../shared/types';
import { formatAbsoluteTime } from '../../components/RelativeTime';
import { formatRelativeTime } from '../../lib/dateFormatting';
import { useProjectStore } from '../../stores/projectStore';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import './WelcomePage.css';

/* ─── animation variants ─── */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 26 },
  },
} as const;

const heroVariants = {
  hidden: { opacity: 0, y: -12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 200, damping: 22, delay: 0.05 },
  },
} as const;

/* ─── Ambient background ─── */
function CommandCenterBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#111111_70%)]" />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div className="absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2">
        <div className="animate-[sonarPing_4s_ease-out_infinite] h-[600px] w-[600px] rounded-full border border-blue-500/[0.04]" />
      </div>
      <div className="absolute left-1/2 top-[35%] -translate-x-1/2 -translate-y-1/2">
        <div className="animate-[sonarPing_4s_ease-out_1.5s_infinite] h-[600px] w-[600px] rounded-full border border-cyan-400/[0.03]" />
      </div>
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/[0.07] blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-cyan-500/[0.04] blur-[100px]" />
    </div>
  );
}

/* ─── Project row (lightweight — lives inside the glass container) ─── */
function ProjectRow({
  project,
  isActive,
  onSelect,
  isLast,
}: {
  project: Project;
  isActive: boolean;
  onSelect: (id: string) => void;
  isLast: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(project.id)}
      variants={itemVariants}
      whileTap={{ scale: 0.99 }}
      className={`group relative w-full flex items-center gap-4 px-5 py-4 text-left transition-all duration-150 cursor-pointer ${
        isActive
          ? 'bg-blue-500/[0.07]'
          : 'hover:bg-white/[0.03]'
      } ${!isLast ? '' : ''}`}
    >
      {/* Active bar */}
      {isActive && (
        <motion.div
          layoutId="activeBar"
          className="absolute left-1 top-2.5 bottom-2.5 w-[3px] rounded-full bg-blue-500"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-500/15 text-blue-400'
          : 'bg-slate-700/30 text-slate-500 group-hover:bg-slate-700/50 group-hover:text-slate-400'
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
            <Badge variant="outline" className="shrink-0 rounded-full bg-blue-500/12 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-blue-400 border-transparent">
              Active
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-slate-500 font-mono truncate" title={project.path}>
          {project.path}
        </p>
      </div>

      {/* Timestamp */}
      <div className="shrink-0 flex items-center gap-1.5 text-slate-600 group-hover:text-slate-500 transition-colors">
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
        <FiArrowRight size={14} className="text-slate-500" />
      </div>
    </motion.button>
  );
}

/* ─── Add project row (footer of the container) ─── */
function AddProjectRow({ onCreated }: { onCreated: () => void }) {
  const { createProject, switchProject } = useProjectStore();

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI.dialogSelectFolder();
      if (result.data) {
        const folderPath = result.data;
        const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'My Project';
        const project = await createProject(folderName, folderPath);
        if (project) {
          await switchProject(project.id);
          onCreated();
        }
      }
    } catch {
      // User cancelled
    }
  };

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={handleBrowse}
      data-testid="add-project-button"
      className="group h-auto w-full flex items-center gap-3 px-5 py-4 text-sm text-slate-400 transition-all duration-150 hover:text-blue-400 hover:bg-blue-500/[0.04] cursor-pointer"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700/25 border border-slate-700/40 group-hover:bg-blue-500/15 group-hover:border-blue-500/25 group-hover:text-blue-400 transition-all">
        <FiPlus size={14} />
      </div>
      <span className="font-semibold text-[13px]">New Project</span>
    </Button>
  );
}

/* ─── Empty state ─── */
function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <motion.div
      variants={itemVariants}
      className="py-12 text-center"
      data-testid="no-projects-empty-state"
    >
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-700/20 border border-slate-700/30">
        <FiFolder size={24} className="text-slate-600" />
      </div>
      <p className="text-sm font-medium text-slate-300 mb-1.5">
        No projects yet
      </p>
      <p className="text-[13px] text-slate-500 mb-6 max-w-xs mx-auto leading-relaxed">
        Add a Git repository to start orchestrating AI coding agents.
      </p>
      <motion.button
        type="button"
        onClick={onBrowse}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm px-6 py-2.5 text-sm font-semibold transition-colors cursor-pointer"
        data-testid="open-project-button"
      >
        <FiFolderPlus size={15} />
        Open Project
      </motion.button>
    </motion.div>
  );
}

/* ─── Main welcome page ─── */
export function WelcomePage({ onProjectOpened }: { onProjectOpened: () => void }) {
  const { projects, activeProject, loadProjects, switchProject } = useProjectStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadProjects().then(() => setLoaded(true));
  }, [loadProjects]);

  const handleSelectProject = async (id: string) => {
    await switchProject(id);
    onProjectOpened();
  };

  const handleBrowseEmpty = () => {
    const addBtn = document.querySelector('[data-testid="add-project-button"]');
    if (addBtn instanceof HTMLElement) addBtn.click();
  };

  const recentProjects = projects.slice(0, 10);

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden">
      <CommandCenterBg />

      <motion.div
        className="relative z-10 w-full max-w-[560px] px-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ── Hero ── */}
        <motion.div variants={heroVariants} className="mb-10 text-center">
          <div className="relative inline-flex mb-5">
            <div className="absolute inset-0 rounded-full bg-blue-500/15 blur-2xl scale-[2]" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900/80 border border-slate-700/50 shadow-2xl shadow-black/30">
              <FiAnchor size={26} className="text-blue-400" />
            </div>
          </div>

          <h1 className="text-[2.25rem] font-bold text-slate-50 tracking-[-0.04em] leading-none">
            Fleet Command
          </h1>
          <p className="mt-2.5 text-[13px] text-slate-500 tracking-[0.08em] uppercase font-medium">
            Multi-agent AI orchestration
          </p>
        </motion.div>

        {/* ── Glass container: projects + add ── */}
        <motion.div
          variants={itemVariants}
          className="border border-slate-600/25 bg-slate-800/25 backdrop-blur-sm"
        >
          {/* Container header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Projects
            </span>
            {recentProjects.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded bg-blue-500/15 border border-blue-500/20 text-[10px] font-bold text-blue-400 tabular-nums px-1.5">
                {recentProjects.length}
              </span>
            )}
          </div>

          {/* Project rows */}
          <AnimatePresence mode="wait">
            {!loaded ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-16"
              >
                <div className="relative">
                  <div className="h-8 w-8 rounded-full border-2 border-slate-800" />
                  <div className="absolute inset-0 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              </motion.div>
            ) : recentProjects.length === 0 ? (
              <EmptyState key="empty" onBrowse={handleBrowseEmpty} />
            ) : (
              <motion.div
                key="list"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="px-1.5 pb-1 max-h-[360px] overflow-y-auto"
              >
                {recentProjects.map((project, i) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    isActive={activeProject?.id === project.id}
                    onSelect={handleSelectProject}
                    isLast={i === recentProjects.length - 1}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add project footer */}
          {loaded && (
            <div className="border-t border-slate-700/20 mx-4 mt-5 pt-4 pb-2">
              <AddProjectRow onCreated={onProjectOpened} />
            </div>
          )}
        </motion.div>

        {/* ── Primary CTA ── */}
        <AnimatePresence>
          {activeProject && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 24 }}
              className="mt-8 text-center"
            >
              <motion.button
                type="button"
                onClick={onProjectOpened}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="group relative inline-flex items-center gap-3 rounded-[14px] bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm px-10 py-[14px] text-[14px] font-semibold transition-all duration-200 cursor-pointer"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[14px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                Open {activeProject.name}
                <FiArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
