import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { FiCheckSquare, FiGitMerge, FiMail, FiSettings, FiTerminal, FiUsers } from 'react-icons/fi';

interface CommandPaletteProps {
  onNavigate: (page: string) => void;
}

const navigationItems = [
  { id: 'agents', label: 'Go to Agents', icon: FiUsers, group: 'Navigation' },
  { id: 'mail', label: 'Go to Mail', icon: FiMail, group: 'Navigation' },
  { id: 'merge', label: 'Go to Merge Queue', icon: FiGitMerge, group: 'Navigation' },
  { id: 'tasks', label: 'Go to Tasks', icon: FiCheckSquare, group: 'Navigation' },
  { id: 'debug', label: 'Go to Debug', icon: FiTerminal, group: 'Navigation' },
  { id: 'settings', label: 'Go to Settings', icon: FiSettings, group: 'Navigation' },
];

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

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

  function handleSelect(itemId: string) {
    onNavigate(itemId);
    setOpen(false);
  }

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
          <span>Navigate with arrow keys</span>
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
