import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

export function TargetBranchSelector({
  targetBranch,
  onChangeTarget,
}: {
  targetBranch: string;
  onChangeTarget: (branch: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(targetBranch);

  const handleSave = () => {
    onChangeTarget(inputValue.trim());
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setInputValue(targetBranch);
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400 whitespace-nowrap">Target branch:</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="main"
            // biome-ignore lint/a11y/noAutofocus: intentional focus for inline edit
            autoFocus
            className="w-40 h-7 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-600/20"
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setInputValue(targetBranch);
              setEditing(false);
            }}
            className="h-7 px-2 text-xs text-slate-400 hover:bg-slate-700"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setInputValue(targetBranch);
            setEditing(true);
          }}
          className="h-7 gap-1.5 border-slate-600 bg-slate-800 font-mono text-xs text-slate-300 hover:bg-slate-700 hover:text-slate-100"
          title="Click to change merge target branch"
        >
          {targetBranch || '(current branch)'}
          <span className="text-slate-400">&#9998;</span>
        </Button>
      )}
    </div>
  );
}
