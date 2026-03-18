import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiChevronDown, FiGitBranch, FiLoader } from 'react-icons/fi';
import { useProjectStore } from '../../../stores/projectStore';

export function TargetBranchSelector({
  targetBranch,
  onChangeTarget,
}: {
  targetBranch: string;
  onChangeTarget: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeProject } = useProjectStore();

  // Fetch branches when dropdown opens
  useEffect(() => {
    if (!open || !activeProject?.path) return;
    setLoading(true);
    window.electronAPI
      .gitListBranches(activeProject.path)
      .then((result) => {
        if (result.data) {
          setBranches(result.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, activeProject?.path]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setFilter('');
    }
  }, [open]);

  const handleSelect = (branch: string) => {
    onChangeTarget(branch);
    setOpen(false);
  };

  const current = targetBranch || 'main';

  const filtered = filter
    ? branches.filter((b) => b.toLowerCase().includes(filter.toLowerCase()))
    : branches;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-8 px-3 rounded-lg bg-[#1e1e1e] border border-white/10 text-sm text-slate-200 hover:bg-[#252525] hover:border-white/15 transition-colors cursor-pointer"
        title="Change merge target branch"
      >
        <FiGitBranch size={13} className="text-slate-400" />
        <span className="font-mono text-xs">{current}</span>
        <FiChevronDown
          size={12}
          className={`text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl shadow-black/40 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/5">
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search branches..."
              className="w-full h-7 rounded-md bg-[#111] border border-white/10 px-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Branch list */}
          <div className="max-h-52 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                <FiLoader size={14} className="animate-spin" />
                Loading branches...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                {filter ? 'No matching branches' : 'No branches found'}
              </div>
            ) : (
              filtered.map((branch) => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => handleSelect(branch)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                    current === branch
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <FiGitBranch size={13} className="shrink-0 text-slate-400" />
                  <span className="font-mono text-xs flex-1 truncate">{branch}</span>
                  {current === branch && (
                    <FiCheck size={14} className="shrink-0 text-blue-400" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
