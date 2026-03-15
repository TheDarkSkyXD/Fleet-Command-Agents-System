import { Command } from 'cmdk';
import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAnchor,
  FiBarChart2,
  FiBook,
  FiBookOpen,
  FiCheckSquare,
  FiFileText,
  FiFolder,
  FiGitBranch,
  FiGitMerge,
  FiHeart,
  FiMail,
  FiSearch,
  FiSettings,
  FiShield,
  FiTerminal,
  FiUsers,
} from 'react-icons/fi';
import { useProjectStore } from '../stores/projectStore';

interface CommandPaletteProps {
  onNavigate: (page: string) => void;
}

const navigationItems = [
  {
    id: 'agents',
    label: 'Go to Agents',
    keywords: ['agents', 'agent', 'workers', 'swarm'],
    icon: FiUsers,
    group: 'Navigation',
  },
  {
    id: 'mail',
    label: 'Go to Mail',
    keywords: ['mail', 'messages', 'inbox', 'outbox'],
    icon: FiMail,
    group: 'Navigation',
  },
  {
    id: 'merge',
    label: 'Go to Merge Queue',
    keywords: ['merge', 'queue', 'git', 'branch'],
    icon: FiGitMerge,
    group: 'Navigation',
  },
  {
    id: 'worktrees',
    label: 'Go to Worktrees',
    keywords: ['worktrees', 'worktree', 'branches', 'git'],
    icon: FiGitBranch,
    group: 'Navigation',
  },
  {
    id: 'definitions',
    label: 'Go to Definitions',
    keywords: ['definitions', 'definition', 'agent types', 'roles'],
    icon: FiBookOpen,
    group: 'Navigation',
  },
  {
    id: 'guard-rules',
    label: 'Go to Guard Rules',
    keywords: ['guard', 'rules', 'security', 'permissions'],
    icon: FiShield,
    group: 'Navigation',
  },
  {
    id: 'hooks',
    label: 'Go to Hooks',
    keywords: ['hooks', 'hook', 'lifecycle', 'events'],
    icon: FiAnchor,
    group: 'Navigation',
  },
  {
    id: 'tasks',
    label: 'Go to Tasks',
    keywords: ['tasks', 'task', 'todo', 'tracker'],
    icon: FiCheckSquare,
    group: 'Navigation',
  },
  {
    id: 'discovery',
    label: 'Go to Discovery',
    keywords: ['discovery', 'discover', 'scan', 'find'],
    icon: FiSearch,
    group: 'Navigation',
  },
  {
    id: 'prompts',
    label: 'Go to Prompts',
    keywords: ['prompts', 'prompt', 'templates'],
    icon: FiFileText,
    group: 'Navigation',
  },
  {
    id: 'expertise',
    label: 'Go to Expertise',
    keywords: ['expertise', 'knowledge', 'domains'],
    icon: FiBook,
    group: 'Navigation',
  },
  {
    id: 'events',
    label: 'Go to Event Feed',
    keywords: ['events', 'event', 'feed', 'activity', 'log'],
    icon: FiActivity,
    group: 'Navigation',
  },
  {
    id: 'metrics',
    label: 'Go to Metrics',
    keywords: ['metrics', 'stats', 'statistics', 'dashboard', 'analytics'],
    icon: FiBarChart2,
    group: 'Navigation',
  },
  {
    id: 'doctor',
    label: 'Go to Doctor',
    keywords: ['doctor', 'health', 'diagnostics', 'check'],
    icon: FiHeart,
    group: 'Navigation',
  },
  {
    id: 'debug',
    label: 'Go to Debug',
    keywords: ['debug', 'debugger', 'console', 'terminal', 'logs'],
    icon: FiTerminal,
    group: 'Navigation',
  },
  {
    id: 'settings',
    label: 'Go to Settings',
    keywords: ['settings', 'preferences', 'config', 'configuration'],
    icon: FiSettings,
    group: 'Navigation',
  },
];

/**
 * Fuzzy search with smart ranking: exact > starts-with > contains > fuzzy
 * Returns a score 0-1 where higher is better, or 0 for no match.
 */
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match (highest priority)
  if (t === q) return 1;

  // Starts with query
  if (t.startsWith(q)) return 0.8;

  // Word in text starts with query
  const words = t.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(q)) return 0.7;
  }

  // Contains query as substring
  if (t.includes(q)) return 0.6;

  // Fuzzy match: all characters of query appear in order in text
  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchIndex = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === lastMatchIndex + 1) consecutiveBonus += 0.02;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    // All characters matched - base score 0.3 + bonus for consecutive chars
    return Math.min(0.5, 0.3 + consecutiveBonus);
  }

  return 0; // No match
}

/**
 * Custom filter for cmdk that checks label and keywords with smart ranking.
 * Returns a score 0-1 for ranking results.
 */
function customFilter(value: string, search: string): number {
  if (!search) return 1;

  // value is the Command.Item value prop (the label)
  const labelScore = fuzzyScore(search, value);

  // Also check against the item id/keywords by looking up the item
  const item = navigationItems.find((i) => i.label === value);
  let keywordScore = 0;
  if (item) {
    // Check page id directly
    keywordScore = Math.max(keywordScore, fuzzyScore(search, item.id));
    // Check all keywords
    for (const kw of item.keywords) {
      keywordScore = Math.max(keywordScore, fuzzyScore(search, kw));
    }
  }

  // Return the best score between label and keywords
  return Math.max(labelScore, keywordScore);
}

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const { activeProject } = useProjectStore();

  // Toggle the command palette with Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (itemId: string) => {
      onNavigate(itemId);
      setOpen(false);
    },
    [onNavigate],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />

      {/* Command palette */}
      <Command
        className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border border-slate-600 bg-slate-800 shadow-2xl shadow-black/50"
        filter={customFilter}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        <Command.Input
          placeholder="Type a command or search..."
          className="w-full border-b border-slate-700 bg-transparent px-4 py-3 text-sm text-slate-50 outline-none placeholder:text-slate-500"
          autoFocus
        />

        {/* Project context indicator */}
        <div
          className="flex items-center gap-2 border-b border-slate-700/60 bg-slate-800/40 px-4 py-1.5"
          data-testid="command-palette-project-context"
        >
          <FiFolder size={12} className="text-blue-400 shrink-0" />
          <span className="text-[11px] text-slate-400">
            Project:{' '}
            <span className="font-medium text-slate-300">
              {activeProject ? activeProject.name : 'None selected'}
            </span>
          </span>
          {activeProject && (
            <span
              className="ml-auto text-[10px] text-slate-600 truncate max-w-[200px]"
              title={activeProject.path}
            >
              {activeProject.path}
            </span>
          )}
        </div>

        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-slate-500">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigation" className="mb-2">
            <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Navigation
            </div>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.id}
                  value={item.label}
                  onSelect={() => handleSelect(item.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 data-[selected=true]:bg-slate-700 data-[selected=true]:text-slate-50"
                >
                  <Icon size={16} className="shrink-0 text-slate-400" />
                  <span>{item.label}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>

        <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            Commands apply to{' '}
            <span className="font-medium text-slate-400">
              {activeProject ? activeProject.name : 'no project'}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-slate-600 bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
              Enter
            </kbd>
            <span>to select</span>
            <kbd className="rounded border border-slate-600 bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
              Esc
            </kbd>
            <span>to close</span>
          </div>
        </div>
      </Command>
    </div>
  );
}
