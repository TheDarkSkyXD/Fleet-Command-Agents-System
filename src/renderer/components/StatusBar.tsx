export function StatusBar() {
  return (
    <footer className="flex items-center justify-between border-t border-slate-700 bg-slate-950 px-4 py-1 text-xs text-slate-400">
      <div className="flex items-center gap-4">
        <span className="font-medium text-slate-300">Fleet Command</span>
        <span>Active Agents: 0</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          CLI: Checking...
        </span>
        <span>Run: —</span>
      </div>
    </footer>
  );
}
