import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiEdit2,
  FiFile,
  FiFolder,
  FiLoader,
  FiRefreshCw,
  FiSave,
} from 'react-icons/fi';
import { useProjectStore } from '../../../../stores/projectStore';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Switch } from '../../../../components/ui/switch';
import { Badge } from '../../../../components/ui/badge';
import { Card, CardContent } from '../../../../components/ui/card';
import { Tooltip } from '../../../../components/Tooltip';
import './ProjectConfigEditor.css';

interface ConfigValue {
  key: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'object';
  path: string[];
}

function flattenConfig(obj: Record<string, unknown>, parentPath: string[] = []): ConfigValue[] {
  const result: ConfigValue[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...parentPath, key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenConfig(value as Record<string, unknown>, currentPath));
    } else {
      let type: ConfigValue['type'] = 'string';
      if (typeof value === 'number') type = 'number';
      else if (typeof value === 'boolean') type = 'boolean';
      else if (typeof value === 'object') type = 'object';
      result.push({ key, value, type, path: currentPath });
    }
  }
  return result;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const result = { ...obj };
  if (path.length === 1) {
    result[path[0]] = value;
    return result;
  }
  const [first, ...rest] = path;
  result[first] = setNestedValue((result[first] as Record<string, unknown>) || {}, rest, value);
  return result;
}

export function ProjectConfigEditor() {
  const { activeProject } = useProjectStore();
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('');

  const loadConfig = useCallback(async () => {
    if (!activeProject) {
      setConfig(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.electronAPI.projectConfigRead(activeProject.path);
      if (result.error) {
        setError(result.error);
        setConfig(null);
      } else if (result.data) {
        setConfig(result.data.config);
        setConfigPath(result.data.path);
        setRawJson(JSON.stringify(result.data.config, null, 2));
        setHasChanges(false);
      }
    } catch (err) {
      setError(String(err));
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleSave = useCallback(async () => {
    if (!activeProject || !config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let configToSave = config;
      if (rawMode) {
        try {
          configToSave = JSON.parse(rawJson);
        } catch {
          setError('Invalid JSON. Please fix syntax errors before saving.');
          setSaving(false);
          return;
        }
      }
      const result = await window.electronAPI.projectConfigWrite(activeProject.path, configToSave);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(`Config saved to ${result.data?.path || configPath}`);
        setConfig(configToSave);
        setRawJson(JSON.stringify(configToSave, null, 2));
        setHasChanges(false);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [activeProject, config, configPath, rawMode, rawJson]);

  const handleFieldEdit = useCallback(
    (fieldPath: string[], currentValue: unknown, type: ConfigValue['type']) => {
      const pathStr = fieldPath.join('.');
      setEditingField(pathStr);
      if (type === 'boolean') {
        // Toggle boolean immediately
        const newConfig = setNestedValue(
          config as Record<string, unknown>,
          fieldPath,
          !currentValue,
        );
        setConfig(newConfig);
        setRawJson(JSON.stringify(newConfig, null, 2));
        setHasChanges(true);
        setEditingField(null);
      } else {
        setEditValue(String(currentValue ?? ''));
      }
    },
    [config],
  );

  const handleFieldSave = useCallback(
    (fieldPath: string[], type: ConfigValue['type']) => {
      if (!config) return;
      let parsedValue: unknown = editValue;
      if (type === 'number') {
        parsedValue = Number(editValue);
        if (Number.isNaN(parsedValue as number)) {
          setError(`Invalid number: ${editValue}`);
          return;
        }
      }
      const newConfig = setNestedValue(config as Record<string, unknown>, fieldPath, parsedValue);
      setConfig(newConfig);
      setRawJson(JSON.stringify(newConfig, null, 2));
      setHasChanges(true);
      setEditingField(null);
      setError(null);
    },
    [config, editValue],
  );

  const handleFieldCancel = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  if (!activeProject) {
    return (
      <Card className="border-slate-700 bg-slate-800 p-8 text-center">
        <CardContent className="p-0">
          <FiFolder size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-400 text-lg mb-1">No Project Selected</p>
          <p className="text-slate-400 text-sm">Select a project to view its configuration.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FiRefreshCw size={24} className="animate-spin text-blue-400" />
        <span className="ml-3 text-slate-400">Loading configuration...</span>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm flex items-center gap-2">
          <FiAlertTriangle size={16} />
          <div>
            <p className="font-medium">Failed to load configuration</p>
            <p className="text-red-400/70">{error}</p>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Make sure the .fleetcommand directory has been initialized for this project. Go to the
          Worktrees page and click "Initialize .fleetcommand".
        </p>
      </div>
    );
  }

  if (!config) return null;

  const flatFields = flattenConfig(config);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FiFile size={18} className="text-blue-400" />
            Project Configuration
          </h3>
          {configPath && <p className="text-xs text-slate-400 mt-1 font-mono">{configPath}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRawMode(!rawMode);
              if (!rawMode && config) {
                setRawJson(JSON.stringify(config, null, 2));
              }
            }}
            className="gap-1 text-xs border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <FiEdit2 size={12} />
            {rawMode ? 'Form View' : 'JSON View'}
          </Button>
          {/* Refresh */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadConfig}
            disabled={loading}
            className="gap-1 text-xs border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <FiRefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Reload
          </Button>
          {/* Save */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="gap-1.5 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 border-blue-500/30"
          >
            {saving ? <FiLoader size={12} className="animate-spin" /> : <FiSave size={12} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-center gap-2">
          <FiAlertTriangle size={14} />
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400 flex items-center gap-2">
          <FiCheck size={14} />
          {success}
        </div>
      )}
      {hasChanges && !success && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400 flex items-center gap-2">
          <FiAlertTriangle size={14} />
          You have unsaved changes.
        </div>
      )}

      {/* Raw JSON Editor */}
      {rawMode ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
          <Textarea
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              setHasChanges(true);
            }}
            spellCheck={false}
            className="w-full h-96 bg-transparent text-slate-200 font-mono text-sm p-4 resize-y border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="{ }"
          />
        </div>
      ) : (
        /* Form editor */
        <div className="rounded-lg border border-slate-700 bg-slate-800 divide-y divide-slate-700">
          {flatFields.map((field) => {
            const pathStr = field.path.join('.');
            const isEditing = editingField === pathStr;
            const depth = field.path.length - 1;

            return (
              <div
                key={pathStr}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-750 transition-colors"
              >
                {/* Field label */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="text-sm text-slate-300 font-mono"
                    style={{ paddingLeft: `${depth * 16}px` }}
                  >
                    {depth > 0 && (
                      <span className="text-slate-400 mr-1">
                        {field.path.slice(0, -1).join('.')}.
                      </span>
                    )}
                    {field.key}
                  </span>
                  <Badge variant="secondary" className="text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5">
                    {field.type}
                  </Badge>
                </div>

                {/* Field value / editor */}
                <div className="flex items-center gap-2 shrink-0">
                  {isEditing && field.type !== 'boolean' ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFieldSave(field.path, field.type);
                          if (e.key === 'Escape') handleFieldCancel();
                        }}
                        className="h-8 bg-slate-900 border-slate-600 text-sm text-slate-200 font-mono w-48"
                        ref={(el) => el?.focus()}
                      />
                      <Tooltip content="Save">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleFieldSave(field.path, field.type)}
                          className="h-8 w-8 text-green-400 hover:bg-green-500/20"
                        >
                          <FiCheck size={14} />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Cancel">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleFieldCancel}
                          className="h-8 w-8 text-slate-400 hover:bg-slate-600"
                        >
                          x
                        </Button>
                      </Tooltip>
                    </div>
                  ) : field.type === 'boolean' ? (
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={() => handleFieldEdit(field.path, field.value, field.type)}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  ) : (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => handleFieldEdit(field.path, field.value, field.type)}
                      className="h-auto text-sm text-slate-200 font-mono bg-slate-900/50 px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 hover:bg-slate-900 transition-colors cursor-pointer max-w-xs truncate"
                      title={`Click to edit: ${String(field.value)}`}
                    >
                      {String(field.value)}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {flatFields.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-sm">
              Configuration file is empty. Switch to JSON view to add fields.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
