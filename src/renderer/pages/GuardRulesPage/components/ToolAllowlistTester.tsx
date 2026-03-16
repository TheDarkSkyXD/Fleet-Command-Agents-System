import { useState } from 'react';
import { FiCheckCircle, FiShield, FiXCircle } from 'react-icons/fi';
import { ALL_TOOLS } from '../constants';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

export function ToolAllowlistTester({ role }: { role: string }) {
  const [testTool, setTestTool] = useState('');
  const [testResult, setTestResult] = useState<{
    allowed: boolean;
    reason: string;
  } | null>(null);

  const handleTest = async () => {
    if (!testTool.trim() || !role) return;
    const result = await window.electronAPI.guardCheckTool(role, testTool.trim());
    if (result.data) {
      setTestResult(result.data);
    }
  };

  return (
    <div className="mt-4 pt-4">
      <Separator className="mb-4" />
      <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
        Test Tool Access
      </h4>
      <div className="flex gap-2">
        <Select
          value={testTool}
          onValueChange={(value) => {
            setTestTool(value);
            setTestResult(null);
          }}
        >
          <SelectTrigger
            className="flex-1 h-9 border-slate-600 bg-slate-700 text-slate-200"
            data-testid="test-tool-select"
            aria-label="Select tool to test"
          >
            <SelectValue placeholder="Select a tool..." />
          </SelectTrigger>
          <SelectContent>
            {ALL_TOOLS.map((t) => (
              <SelectItem key={t} value={t.split(' ')[0]}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={handleTest}
          disabled={!testTool.trim()}
          data-testid="test-tool-btn"
          size="sm"
          className="bg-sky-600 text-white hover:bg-sky-500"
        >
          <FiShield size={14} />
          Test
        </Button>
      </div>
      {testResult && (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
            testResult.allowed
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
          data-testid="test-tool-result"
        >
          <div className="flex items-center gap-2">
            {testResult.allowed ? (
              <>
                <FiCheckCircle size={14} />
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">ALLOWED</Badge>
              </>
            ) : (
              <>
                <FiXCircle size={14} />
                <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10">BLOCKED</Badge>
              </>
            )}
          </div>
          <p className="text-xs mt-1 opacity-80">{testResult.reason}</p>
        </div>
      )}
    </div>
  );
}
