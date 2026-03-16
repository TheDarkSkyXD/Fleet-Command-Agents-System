import { useState } from 'react';
import { FiCheckCircle, FiShield, FiXCircle } from 'react-icons/fi';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';

export function BashRestrictionTester({ role }: { role: string }) {
  const [testCommand, setTestCommand] = useState('');
  const [testResult, setTestResult] = useState<{
    blocked: boolean;
    reason: string;
    matched_pattern?: string;
  } | null>(null);

  const handleTest = async () => {
    if (!testCommand.trim() || !role) return;
    const result = await window.electronAPI.guardCheckBash(role, testCommand.trim());
    if (result.data) {
      setTestResult(result.data);
    }
  };

  return (
    <div className="mt-4 pt-4">
      <Separator className="mb-4" />
      <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
        Test Command
      </h4>
      <div className="flex gap-2">
        <Input
          type="text"
          value={testCommand}
          onChange={(e) => {
            setTestCommand(e.target.value);
            setTestResult(null);
          }}
          placeholder="e.g. git push origin main"
          aria-label="Test bash command"
          data-testid="test-bash-command-input"
          className="flex-1 h-9 border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTest();
          }}
        />
        <Button
          type="button"
          onClick={handleTest}
          disabled={!testCommand.trim()}
          data-testid="test-bash-command-btn"
          size="sm"
          className="bg-amber-600/15 text-amber-400 border border-amber-500/25 hover:bg-amber-600/25 hover:text-amber-300"
        >
          <FiShield size={14} />
          Test
        </Button>
      </div>
      {testResult && (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
            testResult.blocked
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }`}
          data-testid="test-bash-result"
        >
          <div className="flex items-center gap-2">
            {testResult.blocked ? (
              <>
                <FiXCircle size={14} />
                <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10">BLOCKED</Badge>
              </>
            ) : (
              <>
                <FiCheckCircle size={14} />
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">ALLOWED</Badge>
              </>
            )}
          </div>
          <p className="text-xs mt-1 opacity-80">{testResult.reason}</p>
          {testResult.matched_pattern && (
            <p className="text-xs mt-0.5 font-mono opacity-70">
              Matched: &quot;{testResult.matched_pattern}&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
