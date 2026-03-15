import { useEffect, useState } from 'react';
import { FiRefreshCw, FiSave } from 'react-icons/fi';
import { DEFAULT_SETTINGS, useSettingsStore } from '../stores/settingsStore';

export function SettingsPage() {
  const { loaded, saving, loadSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'agents' | 'terminal'>('agents');

  useEffect(() => {
    if (!loaded) {
      loadSettings();
    }
  }, [loaded, loadSettings]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center p-12">
        <FiRefreshCw className="animate-spin text-slate-400 mr-2" size={20} />
        <span className="text-slate-400">Loading settings...</span>
      </div>
    );
  }

  const tabs = [
    { id: 'agents' as const, label: 'Agents' },
    { id: 'terminal' as const, label: 'Terminal' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Settings</h1>
        {saving && (
          <span className="flex items-center text-sm text-blue-400">
            <FiSave className="mr-1" size={14} />
            Saving...
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'agents' && <AgentSettings />}
      {activeTab === 'terminal' && <TerminalSettings />}
    </div>
  );
}

function AgentSettings() {
  const { settings, updateSetting } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Agent Hierarchy</h2>

        {/* Max Hierarchy Depth */}
        <SettingRow
          label="Max Hierarchy Depth"
          description="Maximum depth of the agent hierarchy tree (coordinator → leads → workers). Default is 2."
        >
          <NumberInput
            value={settings.maxHierarchyDepth}
            min={1}
            max={10}
            onChange={(v) => updateSetting('maxHierarchyDepth', v)}
          />
        </SettingRow>

        {/* Max Concurrent Agents */}
        <SettingRow
          label="Max Concurrent Agents"
          description="Maximum number of agents that can run simultaneously."
        >
          <NumberInput
            value={settings.maxConcurrentAgents}
            min={1}
            max={50}
            onChange={(v) => updateSetting('maxConcurrentAgents', v)}
          />
        </SettingRow>

        {/* Max Agents Per Lead */}
        <SettingRow
          label="Max Agents Per Lead"
          description="Maximum number of worker agents a single lead can manage."
        >
          <NumberInput
            value={settings.maxAgentsPerLead}
            min={1}
            max={20}
            onChange={(v) => updateSetting('maxAgentsPerLead', v)}
          />
        </SettingRow>
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            updateSetting('maxHierarchyDepth', DEFAULT_SETTINGS.maxHierarchyDepth);
            updateSetting('maxConcurrentAgents', DEFAULT_SETTINGS.maxConcurrentAgents);
            updateSetting('maxAgentsPerLead', DEFAULT_SETTINGS.maxAgentsPerLead);
          }}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Reset Agent Settings to Defaults
        </button>
      </div>
    </div>
  );
}

function TerminalSettings() {
  const { settings, updateSetting } = useSettingsStore();

  const fontFamilyOptions = [
    { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
    { label: 'Fira Code', value: 'Fira Code, monospace' },
    { label: 'Cascadia Code', value: 'Cascadia Code, monospace' },
    { label: 'Source Code Pro', value: 'Source Code Pro, monospace' },
    { label: 'Ubuntu Mono', value: 'Ubuntu Mono, monospace' },
    { label: 'Consolas', value: 'Consolas, monospace' },
    { label: 'Courier New', value: 'Courier New, monospace' },
    { label: 'System Monospace', value: 'monospace' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Terminal Appearance</h2>

        {/* Font Family */}
        <SettingRow label="Font Family" description="The font used in xterm.js terminal emulators.">
          <select
            value={settings.terminalFontFamily}
            onChange={(e) => updateSetting('terminalFontFamily', e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
          >
            {fontFamilyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </SettingRow>

        {/* Font Size */}
        <SettingRow label="Font Size" description="Terminal font size in pixels (8-32).">
          <NumberInput
            value={settings.terminalFontSize}
            min={8}
            max={32}
            onChange={(v) => updateSetting('terminalFontSize', v)}
          />
        </SettingRow>

        {/* Preview */}
        <div className="mt-6 pt-4 border-t border-slate-700">
          <p className="text-sm text-slate-400 mb-2">Preview</p>
          <div
            className="rounded-md bg-slate-950 border border-slate-700 p-4"
            style={{
              fontFamily: settings.terminalFontFamily,
              fontSize: `${settings.terminalFontSize}px`,
              lineHeight: 1.4,
            }}
          >
            <span className="text-green-400">user@fleet-command</span>
            <span className="text-slate-400">:</span>
            <span className="text-blue-400">~/project</span>
            <span className="text-slate-400">$ </span>
            <span className="text-slate-200">claude --agent scout</span>
            <br />
            <span className="text-slate-400">Spawning agent... done.</span>
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            updateSetting('terminalFontFamily', DEFAULT_SETTINGS.terminalFontFamily);
            updateSetting('terminalFontSize', DEFAULT_SETTINGS.terminalFontSize);
          }}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Reset Terminal Settings to Defaults
        </button>
      </div>
    </div>
  );
}

// Reusable components

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-700 last:border-0">
      <div className="pr-8">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="text-xs text-slate-400 mt-1">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        -
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          if (!Number.isNaN(parsed)) {
            onChange(Math.min(max, Math.max(min, parsed)));
          }
        }}
        className="w-16 rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-center text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        +
      </button>
    </div>
  );
}
