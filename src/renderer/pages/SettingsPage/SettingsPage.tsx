import './SettingsPage.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimatedCard, AnimatedCardContainer } from '../../components/AnimatedCard';
import {
  FiAlertTriangle,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFileText,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiRotateCcw,
  FiSave,
  FiShield,
  FiStar,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { z } from 'zod';
import type {
  ConfigProfile,
  QualityGate,
  QualityGateResult,
  UpdateStatus,
} from '../../../shared/types';
import { AuthDecisionTree } from './components/AuthDecisionTree';
import { ProjectConfigEditor } from './components/ProjectConfigEditor';
import { useProjectStore } from '../../stores/projectStore';
import {
  DEFAULT_SHORTCUTS,
  type ShortcutAction,
  eventToKeyCombo,
  formatKeyCombo,
  useKeyboardShortcutsStore,
} from '../../stores/keyboardShortcutsStore';
import {
  ACCENT_COLORS,
  type AccentColorKey,
  DEFAULT_MODEL_DEFAULTS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_SETTINGS,
  type ModelDefaultsPerCapability,
  type NotificationPreferences,
  useSettingsStore,
} from '../../stores/settingsStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip } from '../../components/Tooltip';

// ── Zod schema for profile creation/editing ──────────────────────────

const profileSchema = z.object({
  name: z
    .string()
    .min(1, 'Profile name is required')
    .max(50, 'Profile name must be 50 characters or less')
    .regex(
      /^[a-zA-Z0-9 _\-]+$/,
      'Name can only contain letters, numbers, spaces, hyphens, and underscores',
    ),
  description: z.string().max(200, 'Description must be 200 characters or less').optional(),
  max_hierarchy_depth: z.number().int().min(1, 'Min depth is 1').max(10, 'Max depth is 10'),
  max_concurrent_agents: z.number().int().min(1, 'Min is 1').max(50, 'Max is 50'),
  max_agents_per_lead: z.number().int().min(1, 'Min is 1').max(20, 'Max is 20'),
  default_capability: z.enum([
    'scout',
    'builder',
    'reviewer',
    'lead',
    'merger',
    'coordinator',
    'monitor',
  ]),
  default_model: z.enum(['haiku', 'sonnet', 'opus']),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type ProfileFormErrors = Partial<Record<keyof ProfileFormData, string>>;

const CAPABILITY_OPTIONS = [
  { label: 'Scout', value: 'scout' },
  { label: 'Builder', value: 'builder' },
  { label: 'Reviewer', value: 'reviewer' },
  { label: 'Lead', value: 'lead' },
  { label: 'Merger', value: 'merger' },
  { label: 'Coordinator', value: 'coordinator' },
  { label: 'Monitor', value: 'monitor' },
];

const MODEL_OPTIONS = [
  { label: 'Haiku (fast, lightweight)', value: 'haiku' },
  { label: 'Sonnet (balanced)', value: 'sonnet' },
  { label: 'Opus (most capable)', value: 'opus' },
];

const DEFAULT_PROFILE_FORM: ProfileFormData = {
  name: '',
  description: '',
  max_hierarchy_depth: 2,
  max_concurrent_agents: 10,
  max_agents_per_lead: 5,
  default_capability: 'builder',
  default_model: 'sonnet',
};

export function SettingsPage() {
  const { loaded, saving, loadSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<
    | 'general'
    | 'cli-status'
    | 'agents'
    | 'watchdog'
    | 'terminal'
    | 'theme'
    | 'keyboard-shortcuts'
    | 'profiles'
    | 'quality-gates'
    | 'project-config'
    | 'notifications'
    | 'updates'
    | 'cleanup'
  >('general');

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
    { id: 'general' as const, label: 'General' },
    { id: 'cli-status' as const, label: 'CLI Status' },
    { id: 'agents' as const, label: 'Agents' },
    { id: 'watchdog' as const, label: 'Watchdog' },
    { id: 'terminal' as const, label: 'Terminal' },
    { id: 'theme' as const, label: 'Theme' },
    { id: 'keyboard-shortcuts' as const, label: 'Keyboard Shortcuts' },
    { id: 'profiles' as const, label: 'Profiles' },
    { id: 'quality-gates' as const, label: 'Quality Gates' },
    { id: 'notifications' as const, label: 'Notifications' },
    { id: 'project-config' as const, label: 'Project Config' },
    { id: 'updates' as const, label: 'Updates' },
    { id: 'cleanup' as const, label: 'Cleanup' },
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
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="bg-transparent border-b border-slate-700 rounded-none w-full justify-start h-auto p-0 mb-6 flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 hover:border-slate-600 px-4 py-2 data-[state=active]:border-[var(--accent-primary)] data-[state=active]:text-[var(--accent-text)]"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="general"><GeneralSettings /></TabsContent>
        <TabsContent value="cli-status"><CliStatusSettings /></TabsContent>
        <TabsContent value="agents"><AgentSettings /></TabsContent>
        <TabsContent value="watchdog"><WatchdogSettings /></TabsContent>
        <TabsContent value="terminal"><TerminalSettings /></TabsContent>
        <TabsContent value="theme"><ThemeSettings /></TabsContent>
        <TabsContent value="keyboard-shortcuts"><KeyboardShortcutsSettings /></TabsContent>
        <TabsContent value="profiles"><ProfilesSettings /></TabsContent>
        <TabsContent value="quality-gates"><QualityGatesSettings /></TabsContent>
        <TabsContent value="notifications"><NotificationPreferencesSettings /></TabsContent>
        <TabsContent value="project-config">
          <DefaultProjectPathSetting />
          <div className="mt-6">
            <ProjectConfigEditor />
          </div>
        </TabsContent>
        <TabsContent value="updates"><UpdateSettings /></TabsContent>
        <TabsContent value="cleanup"><CleanupSettings /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Default Project Path Setting ─────────────────────────────────────

function DefaultProjectPathSetting() {
  const { settings, updateSetting } = useSettingsStore();
  const [localPath, setLocalPath] = useState(settings.defaultProjectPath || '');
  const [saved, setSaved] = useState(false);

  // Sync local state if settings load later
  useEffect(() => {
    setLocalPath(settings.defaultProjectPath || '');
  }, [settings.defaultProjectPath]);

  const handleSave = () => {
    updateSetting('defaultProjectPath', localPath.trim());
    setSaved(true);
    toast.success('Default project path saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setLocalPath('');
    updateSetting('defaultProjectPath', '');
    toast.success('Default project path cleared');
  };

  return (
    <div
      className="rounded-lg border border-slate-700 bg-slate-800 p-6"
      data-testid="default-project-path-setting"
    >
      <h2 className="text-lg font-semibold text-slate-100 mb-1">Default Project Path</h2>
      <p className="text-sm text-slate-400 mb-4">
        Set a default path that will be pre-filled when creating new projects. This saves time if you
        keep projects in the same directory.
      </p>
      <div className="flex items-center gap-3">
        <Input
          type="text"
          value={localPath}
          onChange={(e) => {
            setLocalPath(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          placeholder="e.g. /home/user/projects or C:\Users\user\projects"
          className="flex-1 border-slate-700 bg-slate-900/80 text-slate-200 placeholder-slate-500 font-mono"
          data-testid="default-project-path-input"
          aria-label="Default project path"
        />
        <Button
          type="button"
          onClick={handleSave}
          disabled={localPath.trim() === (settings.defaultProjectPath || '')}
          className="bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
          data-testid="default-project-path-save"
        >
          {saved ? <FiCheck size={14} /> : <FiSave size={14} />}
          {saved ? 'Saved' : 'Save'}
        </Button>
        {settings.defaultProjectPath && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleClear}
            data-testid="default-project-path-clear"
          >
            <FiX size={14} />
            Clear
          </Button>
        )}
      </div>
      {settings.defaultProjectPath && (
        <p className="text-xs text-slate-400 mt-2">
          Current default:{' '}
          <span className="font-mono text-slate-300">{settings.defaultProjectPath}</span>
        </p>
      )}
    </div>
  );
}

// ── Keyboard Shortcuts Tab ───────────────────────────────────────────

function KeyboardShortcutsSettings() {
  const { shortcuts, loaded, loadShortcuts, updateShortcut, toggleShortcut, resetToDefaults, resetShortcut } =
    useKeyboardShortcutsStore();
  const [recordingId, setRecordingId] = useState<ShortcutAction | null>(null);
  const recordingRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!loaded) {
      loadShortcuts();
    }
  }, [loaded, loadShortcuts]);

  // Listen for key combo when recording
  useEffect(() => {
    if (!recordingId) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      const combo = eventToKeyCombo(e);
      if (!combo) return; // Modifier-only press

      // Check for conflicts
      const conflictEntry = Object.entries(shortcuts).find(
        ([id, s]) => id !== recordingId && s.enabled && s.keys === combo,
      );

      if (conflictEntry) {
        toast.error(
          `"${combo}" is already used by "${conflictEntry[1].label}". Choose a different shortcut.`,
        );
        return;
      }

      updateShortcut(recordingId!, combo);
      toast.success(`Shortcut updated to ${formatKeyCombo(combo)}`);
      setRecordingId(null);
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setRecordingId(null);
      }
    }

    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleEscape, true);
    // Small delay to avoid capturing the click event's key
    const timer = setTimeout(() => {
      window.addEventListener('keydown', handleKeyDown, true);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [recordingId, shortcuts, updateShortcut]);

  // Group shortcuts by category
  const categories = Object.entries(shortcuts).reduce(
    (acc, [id, shortcut]) => {
      if (!acc[shortcut.category]) acc[shortcut.category] = [];
      acc[shortcut.category].push({ action: id as ShortcutAction, ...shortcut });
      return acc;
    },
    {} as Record<string, (typeof shortcuts[ShortcutAction] & { action: ShortcutAction })[]>,
  );

  return (
    <div data-testid="keyboard-shortcuts-settings">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Keyboard Shortcuts</h2>
          <p className="text-sm text-slate-400 mt-1">
            Customize keyboard shortcuts for common actions. Click a shortcut to change it.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            resetToDefaults();
            toast.success('All shortcuts reset to defaults');
          }}
          className="gap-2"
          data-testid="reset-all-shortcuts-btn"
        >
          <FiRotateCcw size={14} />
          Reset All
        </Button>
      </div>

      {Object.entries(categories).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
            {category}
          </h3>
          <div className="space-y-2">
            {items.map((shortcut) => {
              const isRecording = recordingId === shortcut.action;
              const isModified = shortcut.keys !== DEFAULT_SHORTCUTS[shortcut.action].keys;

              return (
                <div
                  key={shortcut.action}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    isRecording
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50'
                  }`}
                  data-testid={`shortcut-row-${shortcut.action}`}
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={shortcut.enabled}
                      onCheckedChange={(checked) => {
                        toggleShortcut(shortcut.action, checked);
                        toast.success(
                          `${shortcut.label} shortcut ${checked ? 'enabled' : 'disabled'}`,
                        );
                      }}
                      className="data-[state=checked]:bg-blue-600"
                      data-testid={`shortcut-toggle-${shortcut.action}`}
                      aria-label={`Enable ${shortcut.label} shortcut`}
                    />
                    <span
                      className={`text-sm ${shortcut.enabled ? 'text-slate-200' : 'text-slate-500'}`}
                    >
                      {shortcut.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isModified && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          resetShortcut(shortcut.action);
                          toast.success(`Reset "${shortcut.label}" to default`);
                        }}
                        className="h-7 w-7 text-slate-500 hover:text-slate-300"
                        title="Reset to default"
                        data-testid={`shortcut-reset-${shortcut.action}`}
                      >
                        <FiRotateCcw size={12} />
                      </Button>
                    )}

                    <Button
                      ref={isRecording ? recordingRef : undefined}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (isRecording) {
                          setRecordingId(null);
                        } else {
                          setRecordingId(shortcut.action);
                        }
                      }}
                      disabled={!shortcut.enabled}
                      className={`min-w-[120px] font-mono ${
                        isRecording
                          ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 animate-pulse hover:bg-blue-600/25 hover:text-blue-300'
                          : ''
                      }`}
                      data-testid={`shortcut-key-${shortcut.action}`}
                    >
                      {isRecording ? 'Press keys...' : formatKeyCombo(shortcut.keys)}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/30 p-4">
        <p className="text-xs text-slate-400">
          <strong className="text-slate-300">Tip:</strong> Click on a shortcut binding, then press
          your desired key combination (e.g., Ctrl+Shift+A). Press Escape to cancel. Shortcuts
          require at least one modifier key (Ctrl, Shift, Alt).
        </p>
      </div>
    </div>
  );
}

// ── Profiles Tab ─────────────────────────────────────────────────────

function ProfilesSettings() {
  const [profiles, setProfiles] = useState<ConfigProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      const result = await window.electronAPI.profileList();
      if (result.data) {
        setProfiles(result.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const handleDelete = async (id: string, name: string) => {
    try {
      const result = await window.electronAPI.profileDelete(id);
      if (result.data) {
        setStatusMessage({ type: 'success', text: `Deleted profile "${name}"` });
        toast.success(`Deleted profile "${name}"`);
        loadProfiles();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to delete' });
        toast.error(result.error || 'Failed to delete profile');
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to delete profile' });
      toast.error('Failed to delete profile');
    }
  };

  const handleDuplicate = async (profile: ConfigProfile) => {
    try {
      const baseName = profile.name.replace(/\s*\(Copy(?:\s*\d+)?\)\s*$/, '');
      // Find unique copy name
      let copyName = `${baseName} (Copy)`;
      let counter = 2;
      const existingNames = profiles.map((p) => p.name);
      while (existingNames.includes(copyName)) {
        copyName = `${baseName} (Copy ${counter})`;
        counter++;
      }
      const id = `profile-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const result = await window.electronAPI.profileCreate({
        id,
        name: copyName,
        description: profile.description || undefined,
        max_hierarchy_depth: profile.max_hierarchy_depth,
        max_concurrent_agents: profile.max_concurrent_agents,
        max_agents_per_lead: profile.max_agents_per_lead,
        default_capability: profile.default_capability,
        default_model: profile.default_model,
      });
      if (result.data) {
        setStatusMessage({ type: 'success', text: `Duplicated profile as "${copyName}"` });
        toast.success(`Duplicated profile as "${copyName}"`);
        loadProfiles();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to duplicate profile' });
        toast.error(result.error || 'Failed to duplicate profile');
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to duplicate profile' });
      toast.error('Failed to duplicate profile');
    }
  };

  const handleActivate = async (id: string, name: string) => {
    try {
      const result = await window.electronAPI.profileActivate(id);
      if (result.data) {
        setStatusMessage({ type: 'success', text: `Activated profile "${name}"` });
        toast.success(`Activated profile "${name}"`);
        loadProfiles();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to activate' });
        toast.error(result.error || 'Failed to activate profile');
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to activate profile' });
      toast.error('Failed to activate profile');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <FiRefreshCw className="animate-spin text-slate-400 mr-2" size={20} />
        <span className="text-slate-400">Loading profiles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusMessage.type === 'success'
              ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300'
              : 'border-red-700 bg-red-900/30 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Configuration Profiles</h2>
          <p className="text-sm text-slate-400 mt-1">
            Create named profiles with different agent configurations (e.g., "Fast Build", "Careful
            Review").
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="gap-2 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
        >
          <FiPlus size={16} />
          New Profile
        </Button>
      </div>

      {/* Profile List */}
      {profiles.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-12 text-center">
          <div className="text-slate-400 text-4xl mb-3">
            <FiStar className="mx-auto" />
          </div>
          <p className="text-slate-400 text-sm">No configuration profiles yet.</p>
          <p className="text-slate-400 text-xs mt-1">
            Create a profile to quickly switch between different agent configurations.
          </p>
        </div>
      ) : (
        <AnimatedCardContainer className="grid gap-4">
          {profiles.map((profile) => (
            <AnimatedCard key={profile.id}>
              <ProfileCard
                profile={profile}
                isEditing={editingId === profile.id}
                onEdit={() => setEditingId(profile.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => {
                  setEditingId(null);
                  loadProfiles();
                }}
                onDelete={() => handleDelete(profile.id, profile.name)}
                onActivate={() => handleActivate(profile.id, profile.name)}
                onDuplicate={() => handleDuplicate(profile)}
                existingNames={profiles.filter((p) => p.id !== profile.id).map((p) => p.name)}
                setStatusMessage={setStatusMessage}
              />
            </AnimatedCard>
          ))}
        </AnimatedCardContainer>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <ProfileCreateDialog
          existingNames={profiles.map((p) => p.name)}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            setStatusMessage({ type: 'success', text: 'Profile created successfully' });
            loadProfiles();
          }}
          setStatusMessage={setStatusMessage}
        />
      )}
    </div>
  );
}

// ── Profile Card ─────────────────────────────────────────────────────

function ProfileCard({
  profile,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onActivate,
  onDuplicate,
  existingNames,
  setStatusMessage,
}: {
  profile: ConfigProfile;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onDuplicate: () => void;
  existingNames: string[];
  setStatusMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (isEditing) {
    return (
      <ProfileEditForm
        profile={profile}
        existingNames={existingNames}
        onCancel={onCancelEdit}
        onSaved={onSaveEdit}
        setStatusMessage={setStatusMessage}
      />
    );
  }

  const capabilityColors: Record<string, string> = {
    scout: 'text-cyan-400 bg-cyan-900/30',
    builder: 'text-blue-400 bg-blue-900/30',
    reviewer: 'text-cyan-400 bg-cyan-900/30',
    lead: 'text-amber-400 bg-amber-900/30',
    merger: 'text-emerald-400 bg-emerald-900/30',
    coordinator: 'text-red-400 bg-red-900/30',
    monitor: 'text-teal-400 bg-teal-900/30',
  };

  return (
    <div
      className={`rounded-lg border bg-slate-800 p-5 ${
        profile.is_active ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-100">{profile.name}</h3>
            {profile.is_active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-300">
                <FiCheck size={12} />
                Active
              </span>
            ) : null}
          </div>
          {profile.description && (
            <p className="text-sm text-slate-400 mt-1">{profile.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span className="text-xs text-slate-400">
              Depth: <span className="text-slate-300">{profile.max_hierarchy_depth}</span>
            </span>
            <span className="text-xs text-slate-400">
              Max Agents: <span className="text-slate-300">{profile.max_concurrent_agents}</span>
            </span>
            <span className="text-xs text-slate-400">
              Per Lead: <span className="text-slate-300">{profile.max_agents_per_lead}</span>
            </span>
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                capabilityColors[profile.default_capability] || 'text-slate-400 bg-slate-700'
              }`}
            >
              {profile.default_capability}
            </span>
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium text-slate-300 bg-slate-700">
              {profile.default_model}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-4">
          {!profile.is_active && (
            <Tooltip content="Activate this profile">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onActivate}
                className="text-slate-400 hover:text-blue-400"
              >
                <FiStar size={16} />
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Edit profile">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              className="text-slate-400 hover:text-slate-200"
            >
              <FiEdit2 size={16} />
            </Button>
          </Tooltip>
          <Tooltip content="Duplicate profile">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDuplicate}
              className="text-slate-400 hover:text-emerald-400"
            >
              <FiCopy size={16} />
            </Button>
          </Tooltip>
          <Tooltip content="Delete profile">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-slate-400 hover:text-red-400"
              data-testid="profile-delete-btn"
            >
              <FiTrash2 size={16} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md border-red-500/30 bg-gray-900" data-testid="profile-delete-confirm-dialog">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <FiTrash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <DialogTitle>Delete Profile</DialogTitle>
                <DialogDescription>This action cannot be undone</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-gray-300 mb-6">
            Are you sure you want to delete the profile{' '}
            <span className="font-semibold text-white">"{profile.name}"</span>? All configuration
            settings in this profile will be permanently removed.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              data-testid="profile-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete();
              }}
              data-testid="profile-delete-confirm"
            >
              Delete Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Profile Create Dialog ────────────────────────────────────────────

function ProfileCreateDialog({
  existingNames,
  onClose,
  onCreated,
  setStatusMessage,
}: {
  existingNames: string[];
  onClose: () => void;
  onCreated: () => void;
  setStatusMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}) {
  const [form, setForm] = useState<ProfileFormData>({ ...DEFAULT_PROFILE_FORM });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = (): boolean => {
    // Add uniqueness refinement dynamically
    const schemaWithUniqueness = profileSchema.refine(
      (data) => !existingNames.includes(data.name),
      { message: 'A profile with this name already exists', path: ['name'] },
    );

    const result = schemaWithUniqueness.safeParse(form);
    if (!result.success) {
      const fieldErrors: ProfileFormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ProfileFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const id = `profile-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const result = await window.electronAPI.profileCreate({
        id,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        max_hierarchy_depth: form.max_hierarchy_depth,
        max_concurrent_agents: form.max_concurrent_agents,
        max_agents_per_lead: form.max_agents_per_lead,
        default_capability: form.default_capability,
        default_model: form.default_model,
      });
      if (result.data) {
        toast.success(`Profile "${form.name.trim()}" created`);
        onCreated();
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to create profile',
        });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to create profile' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg border-slate-700 bg-slate-800">
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
          <DialogDescription>Create a new configuration profile for agent settings.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ProfileFormFields form={form} setForm={setForm} errors={errors} />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
          >
            {submitting ? <FiRefreshCw className="animate-spin" size={14} /> : <FiPlus size={14} />}
            Create Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Profile Edit Form (inline) ───────────────────────────────────────

function ProfileEditForm({
  profile,
  existingNames,
  onCancel,
  onSaved,
  setStatusMessage,
}: {
  profile: ConfigProfile;
  existingNames: string[];
  onCancel: () => void;
  onSaved: () => void;
  setStatusMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}) {
  const [form, setForm] = useState<ProfileFormData>({
    name: profile.name,
    description: profile.description || '',
    max_hierarchy_depth: profile.max_hierarchy_depth,
    max_concurrent_agents: profile.max_concurrent_agents,
    max_agents_per_lead: profile.max_agents_per_lead,
    default_capability: profile.default_capability as ProfileFormData['default_capability'],
    default_model: profile.default_model as ProfileFormData['default_model'],
  });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const schemaWithUniqueness = profileSchema.refine(
      (data) => !existingNames.includes(data.name),
      { message: 'A profile with this name already exists', path: ['name'] },
    );

    const result = schemaWithUniqueness.safeParse(form);
    if (!result.success) {
      const fieldErrors: ProfileFormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ProfileFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const result = await window.electronAPI.profileUpdate(profile.id, {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        max_hierarchy_depth: form.max_hierarchy_depth,
        max_concurrent_agents: form.max_concurrent_agents,
        max_agents_per_lead: form.max_agents_per_lead,
        default_capability: form.default_capability,
        default_model: form.default_model,
      });
      if (result.data) {
        setStatusMessage({ type: 'success', text: `Updated profile "${form.name}"` });
        toast.success(`Profile "${form.name}" saved`);
        onSaved();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to update' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-500/50 bg-slate-800 p-5">
      <h3 className="text-base font-semibold text-slate-100 mb-4">Edit Profile</h3>
      <ProfileFormFields form={form} setForm={setForm} errors={errors} />
      <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-slate-700">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="gap-2 bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
        >
          {submitting ? <FiRefreshCw className="animate-spin" size={14} /> : <FiSave size={14} />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ── Shared Form Fields ───────────────────────────────────────────────

function ProfileFormFields({
  form,
  setForm,
  errors,
}: {
  form: ProfileFormData;
  setForm: (form: ProfileFormData) => void;
  errors: ProfileFormErrors;
}) {
  return (
    <>
      {/* Name */}
      <div>
        <Label className="text-sm font-medium text-slate-200 mb-1">
          Profile Name <span className="text-red-400">*</span>
        </Label>
        <Input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder='e.g., "Fast Build" or "Careful Review"'
          className={`w-full bg-slate-700 text-slate-100 ${
            errors.name
              ? 'border-red-500 focus-visible:ring-red-500'
              : 'border-slate-600'
          }`}
        />
        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
      </div>

      {/* Description */}
      <div>
        <Label className="text-sm font-medium text-slate-200 mb-1">Description</Label>
        <Input
          type="text"
          value={form.description || ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Brief description of this profile's purpose"
          className={`w-full bg-slate-700 text-slate-100 ${
            errors.description
              ? 'border-red-500 focus-visible:ring-red-500'
              : 'border-slate-600'
          }`}
        />
        {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
      </div>

      {/* Agent config row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-xs font-medium text-slate-300 mb-1">
            Max Hierarchy Depth
          </Label>
          <NumberInput
            value={form.max_hierarchy_depth}
            min={1}
            max={10}
            onChange={(v) => setForm({ ...form, max_hierarchy_depth: v })}
          />
          {errors.max_hierarchy_depth && (
            <p className="mt-1 text-xs text-red-400">{errors.max_hierarchy_depth}</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium text-slate-300 mb-1">Max Concurrent</Label>
          <NumberInput
            value={form.max_concurrent_agents}
            min={1}
            max={50}
            onChange={(v) => setForm({ ...form, max_concurrent_agents: v })}
          />
          {errors.max_concurrent_agents && (
            <p className="mt-1 text-xs text-red-400">{errors.max_concurrent_agents}</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium text-slate-300 mb-1">Per Lead</Label>
          <NumberInput
            value={form.max_agents_per_lead}
            min={1}
            max={20}
            onChange={(v) => setForm({ ...form, max_agents_per_lead: v })}
          />
          {errors.max_agents_per_lead && (
            <p className="mt-1 text-xs text-red-400">{errors.max_agents_per_lead}</p>
          )}
        </div>
      </div>

      {/* Default Capability & Model row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-medium text-slate-300 mb-1">
            Default Capability
          </Label>
          <Select
            value={form.default_capability}
            onValueChange={(value) =>
              setForm({
                ...form,
                default_capability: value as ProfileFormData['default_capability'],
              })
            }
          >
            <SelectTrigger className={`w-full bg-slate-700 text-slate-100 ${
              errors.default_capability
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-600'
            }`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPABILITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.default_capability && (
            <p className="mt-1 text-xs text-red-400">{errors.default_capability}</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-medium text-slate-300 mb-1">Default Model</Label>
          <Select
            value={form.default_model}
            onValueChange={(value) =>
              setForm({
                ...form,
                default_model: value as ProfileFormData['default_model'],
              })
            }
          >
            <SelectTrigger className={`w-full bg-slate-700 text-slate-100 ${
              errors.default_model
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-600'
            }`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.default_model && (
            <p className="mt-1 text-xs text-red-400">{errors.default_model}</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Watchdog Settings Tab ────────────────────────────────────────────

function WatchdogSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const [watchdogStatus, setWatchdogStatus] = useState<{
    running: boolean;
    checkCount: number;
    lastCheckAt: string | null;
    trackedAgents: number;
  } | null>(null);

  // Load watchdog status on mount
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await window.electronAPI.watchdogStatus();
        if (result.data) {
          setWatchdogStatus(result.data);
        }
      } catch {
        // ignore
      }
    };
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Apply watchdog config changes to the backend
  const applyWatchdogConfig = useCallback(async () => {
    try {
      await window.electronAPI.watchdogConfigure({
        enabled: settings.watchdogEnabled,
        intervalMs: settings.watchdogIntervalMs,
        staleThresholdMs: settings.watchdogStaleThresholdMs,
        zombieThresholdMs: settings.watchdogZombieThresholdMs,
      });
      // Refresh status
      const result = await window.electronAPI.watchdogStatus();
      if (result.data) {
        setWatchdogStatus(result.data);
      }
    } catch {
      // ignore
    }
  }, [settings]);

  // Helper to format ms to human-readable
  const formatDuration = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = seconds % 60;
    return remainingSec > 0 ? `${minutes}m ${remainingSec}s` : `${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {watchdogStatus && (
        <div
          className={`rounded-lg border px-4 py-3 flex items-center justify-between ${
            watchdogStatus.running
              ? 'border-emerald-700 bg-emerald-900/20'
              : 'border-amber-700 bg-amber-900/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <FiEye
              className={watchdogStatus.running ? 'text-emerald-400' : 'text-amber-400'}
              size={16}
            />
            <span
              className={`text-sm font-medium ${watchdogStatus.running ? 'text-emerald-300' : 'text-amber-300'}`}
            >
              {watchdogStatus.running ? 'Watchdog Active' : 'Watchdog Stopped'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>Checks: {watchdogStatus.checkCount}</span>
            <span>Tracking: {watchdogStatus.trackedAgents} agents</span>
            {watchdogStatus.lastCheckAt && (
              <span>Last check: {new Date(watchdogStatus.lastCheckAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FiAlertTriangle className="text-amber-400" size={20} />
          <h2 className="text-lg font-semibold text-slate-100">Watchdog Health Monitor</h2>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          The watchdog daemon monitors agent activity and applies progressive nudging when agents
          become stalled. Agents with no output beyond the stale threshold are flagged, and those
          exceeding the zombie threshold are terminated.
        </p>

        {/* Enable/Disable */}
        <SettingRow
          label="Enable Watchdog"
          description="Enable or disable the watchdog health monitoring daemon."
        >
          <Switch
            checked={settings.watchdogEnabled}
            onCheckedChange={(checked) => updateSetting('watchdogEnabled', checked)}
            className="data-[state=checked]:bg-blue-600"
          />
        </SettingRow>

        {/* Check Interval */}
        <SettingRow
          label="Check Interval"
          description={`How often the watchdog checks agent health. Current: ${formatDuration(settings.watchdogIntervalMs)}`}
        >
          <div className="flex items-center gap-2">
            <NumberInput
              value={Math.round(settings.watchdogIntervalMs / 1000)}
              min={5}
              max={300}
              onChange={(v) => updateSetting('watchdogIntervalMs', v * 1000)}
            />
            <span className="text-xs text-slate-400">sec</span>
          </div>
        </SettingRow>

        {/* Stale Threshold */}
        <SettingRow
          label="Stale Threshold"
          description={`Duration of inactivity before an agent is flagged as stalled. Current: ${formatDuration(settings.watchdogStaleThresholdMs)}`}
        >
          <div className="flex items-center gap-2">
            <NumberInput
              value={Math.round(settings.watchdogStaleThresholdMs / 60000)}
              min={1}
              max={60}
              onChange={(v) => updateSetting('watchdogStaleThresholdMs', v * 60000)}
            />
            <span className="text-xs text-slate-400">min</span>
          </div>
        </SettingRow>

        {/* Zombie Threshold */}
        <SettingRow
          label="Zombie Threshold"
          description={`Duration of inactivity before a stalled agent is terminated. Current: ${formatDuration(settings.watchdogZombieThresholdMs)}. Must be greater than stale threshold.`}
        >
          <div className="flex items-center gap-2">
            <NumberInput
              value={Math.round(settings.watchdogZombieThresholdMs / 60000)}
              min={2}
              max={120}
              onChange={(v) => updateSetting('watchdogZombieThresholdMs', v * 60000)}
            />
            <span className="text-xs text-slate-400">min</span>
          </div>
        </SettingRow>

        {/* Escalation levels preview */}
        <div className="mt-6 pt-4 border-t border-slate-700">
          <p className="text-sm text-slate-300 font-medium mb-3">Escalation Timeline</p>
          <div className="flex items-center gap-0">
            {[
              {
                label: 'Warning',
                time: formatDuration(settings.watchdogStaleThresholdMs),
                color: 'amber',
              },
              {
                label: 'Nudge',
                time: formatDuration(
                  settings.watchdogStaleThresholdMs +
                    (settings.watchdogZombieThresholdMs - settings.watchdogStaleThresholdMs) * 0.33,
                ),
                color: 'amber',
              },
              {
                label: 'Escalate',
                time: formatDuration(
                  settings.watchdogStaleThresholdMs +
                    (settings.watchdogZombieThresholdMs - settings.watchdogStaleThresholdMs) * 0.66,
                ),
                color: 'orange',
              },
              {
                label: 'Terminate',
                time: formatDuration(settings.watchdogZombieThresholdMs),
                color: 'red',
              },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center">
                {i > 0 && <div className="w-8 h-0.5 bg-slate-600" />}
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full bg-${step.color}-500`} />
                  <span className={`text-xs text-${step.color}-400 mt-1 font-medium`}>
                    {step.label}
                  </span>
                  <span className="text-xs text-slate-400">{step.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Apply & Reset Buttons */}
      <div className="flex justify-between">
        <Button
          type="button"
          onClick={applyWatchdogConfig}
          className="gap-2 bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
        >
          <FiSave size={14} />
          Apply to Watchdog
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            updateSetting('watchdogEnabled', DEFAULT_SETTINGS.watchdogEnabled);
            updateSetting('watchdogIntervalMs', DEFAULT_SETTINGS.watchdogIntervalMs);
            updateSetting('watchdogStaleThresholdMs', DEFAULT_SETTINGS.watchdogStaleThresholdMs);
            updateSetting('watchdogZombieThresholdMs', DEFAULT_SETTINGS.watchdogZombieThresholdMs);
          }}
        >
          Reset Watchdog Settings to Defaults
        </Button>
      </div>
    </div>
  );
}

// ── Agent Settings Tab ───────────────────────────────────────────────

// ── Zod schemas for settings validation ──────────────────────────────

const agentSettingsSchema = z.object({
  maxHierarchyDepth: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Minimum depth is 1')
    .max(10, 'Maximum depth is 10'),
  maxConcurrentAgents: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Minimum is 1 agent')
    .max(50, 'Maximum is 50 agents'),
  maxAgentsPerLead: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Minimum is 1 agent per lead')
    .max(20, 'Maximum is 20 agents per lead'),
});

/** Validate a single field against its schema and return error message or null */
function validateSettingField<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  field: string,
  value: unknown,
): string | null {
  const fieldSchema = schema.shape[field];
  if (!fieldSchema) return null;
  const result = fieldSchema.safeParse(value);
  if (result.success) return null;
  return result.error.errors[0]?.message || 'Invalid value';
}

function AgentSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const handleChange = (
    key: 'maxHierarchyDepth' | 'maxConcurrentAgents' | 'maxAgentsPerLead',
    value: number,
  ) => {
    const error = validateSettingField(agentSettingsSchema, key, value);
    setErrors((prev) => ({ ...prev, [key]: error }));
    if (!error) {
      updateSetting(key, value);
    }
  };

  /** Handle non-numeric text errors from ValidatedNumberInput */
  const handleNonNumericError = (
    key: 'maxHierarchyDepth' | 'maxConcurrentAgents' | 'maxAgentsPerLead',
    error: string | null,
  ) => {
    if (error) {
      setErrors((prev) => ({ ...prev, [key]: error }));
    }
    // If null (cleared), only clear if the current error was a non-numeric error
    // (Zod range errors are handled by handleChange)
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Agent Hierarchy</h2>

        {/* Max Hierarchy Depth */}
        <SettingRow
          label="Max Hierarchy Depth"
          description="Maximum depth of the agent hierarchy tree (coordinator → leads → workers). Default is 2."
          error={errors.maxHierarchyDepth}
        >
          <ValidatedNumberInput
            value={settings.maxHierarchyDepth}
            min={1}
            max={10}
            onChange={(v) => handleChange('maxHierarchyDepth', v)}
            hasError={!!errors.maxHierarchyDepth}
            onNonNumericError={(err) => handleNonNumericError('maxHierarchyDepth', err)}
          />
        </SettingRow>

        {/* Max Concurrent Agents */}
        <SettingRow
          label="Max Concurrent Agents"
          description="Maximum number of agents that can run simultaneously."
          error={errors.maxConcurrentAgents}
        >
          <div data-testid="setting-max-concurrent-agents" data-default-value="10">
            <ValidatedNumberInput
              value={settings.maxConcurrentAgents}
              min={1}
              max={50}
              onChange={(v) => handleChange('maxConcurrentAgents', v)}
              hasError={!!errors.maxConcurrentAgents}
              onNonNumericError={(err) => handleNonNumericError('maxConcurrentAgents', err)}
            />
          </div>
        </SettingRow>

        {/* Max Agents Per Lead */}
        <SettingRow
          label="Max Agents Per Lead"
          description="Maximum number of worker agents a single lead can manage."
          error={errors.maxAgentsPerLead}
        >
          <div data-testid="setting-max-agents-per-lead" data-default-value="5">
            <ValidatedNumberInput
              value={settings.maxAgentsPerLead}
              min={1}
              max={20}
              onChange={(v) => handleChange('maxAgentsPerLead', v)}
              hasError={!!errors.maxAgentsPerLead}
              onNonNumericError={(err) => handleNonNumericError('maxAgentsPerLead', err)}
            />
          </div>
        </SettingRow>
      </div>

      {/* Model Defaults Per Capability */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Model Defaults Per Capability</h2>
        <p className="text-sm text-slate-400 mb-4">
          Set the default Claude model for each agent capability type. When spawning a new agent,
          the model picker will pre-select the configured default.
        </p>

        {(
          [
            { cap: 'scout' as const, label: 'Scout', color: 'text-cyan-400' },
            { cap: 'builder' as const, label: 'Builder', color: 'text-blue-400' },
            { cap: 'reviewer' as const, label: 'Reviewer', color: 'text-cyan-400' },
            { cap: 'lead' as const, label: 'Lead', color: 'text-amber-400' },
            { cap: 'merger' as const, label: 'Merger', color: 'text-emerald-400' },
            { cap: 'coordinator' as const, label: 'Coordinator', color: 'text-red-400' },
            { cap: 'monitor' as const, label: 'Monitor', color: 'text-teal-400' },
          ] as const
        ).map(({ cap, label, color }) => (
          <SettingRow
            key={cap}
            label={<span className={color}>{label}</span>}
            description={`Default model when spawning ${label.toLowerCase()} agents.`}
          >
            <Select
              value={settings.modelDefaultsPerCapability?.[cap] ?? DEFAULT_MODEL_DEFAULTS[cap]}
              onValueChange={(value) => {
                const current = settings.modelDefaultsPerCapability ?? {
                  ...DEFAULT_MODEL_DEFAULTS,
                };
                updateSetting('modelDefaultsPerCapability', {
                  ...current,
                  [cap]: value,
                } as ModelDefaultsPerCapability);
              }}
            >
              <SelectTrigger className="w-[180px] border-slate-600 bg-slate-700 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="haiku">Haiku (fast)</SelectItem>
                <SelectItem value="sonnet">Sonnet (balanced)</SelectItem>
                <SelectItem value="opus">Opus (most capable)</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        ))}
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setErrors({});
            updateSetting('maxHierarchyDepth', DEFAULT_SETTINGS.maxHierarchyDepth);
            updateSetting('maxConcurrentAgents', DEFAULT_SETTINGS.maxConcurrentAgents);
            updateSetting('maxAgentsPerLead', DEFAULT_SETTINGS.maxAgentsPerLead);
            updateSetting('modelDefaultsPerCapability', { ...DEFAULT_MODEL_DEFAULTS });
          }}
        >
          Reset Agent Settings to Defaults
        </Button>
      </div>
    </div>
  );
}

// ── Theme Settings Tab ───────────────────────────────────────────────

function ThemeSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const currentAccent = (settings.accentColor || 'blue') as AccentColorKey;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Accent Color</h2>
        <p className="text-sm text-slate-400 mb-6">
          Customize the accent color used throughout the interface. The dark theme is always active.
        </p>

        {/* Color palette grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {(
            Object.entries(ACCENT_COLORS) as [
              AccentColorKey,
              (typeof ACCENT_COLORS)[AccentColorKey],
            ][]
          ).map(([key, color]) => (
            <Button
              key={key}
              variant="ghost"
              type="button"
              onClick={() => updateSetting('accentColor', key)}
              className={`relative flex h-auto flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                currentAccent === key
                  ? 'border-white bg-slate-700/50 shadow-lg'
                  : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/30'
              }`}
              data-testid={`accent-color-${key}`}
            >
              {/* Color swatch */}
              <div
                className="w-10 h-10 rounded-full shadow-inner"
                style={{ backgroundColor: color.primary }}
              />
              {/* Label */}
              <span className="text-xs font-medium text-slate-300">{color.label}</span>
              {/* Selected indicator */}
              {currentAccent === key && (
                <div className="absolute top-2 right-2">
                  <FiCheck size={14} className="text-white" />
                </div>
              )}
            </Button>
          ))}
        </div>

        {/* Preview */}
        <div className="border-t border-slate-700 pt-4">
          <p className="text-sm text-slate-400 mb-3">Preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              type="button"
              className="h-auto rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: ACCENT_COLORS[currentAccent].primary }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor =
                  ACCENT_COLORS[currentAccent].hover;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor =
                  ACCENT_COLORS[currentAccent].primary;
              }}
            >
              Primary Button
            </Button>
            <span
              className="text-sm font-medium"
              style={{ color: ACCENT_COLORS[currentAccent].text }}
            >
              Accent Link
            </span>
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{
                borderColor: ACCENT_COLORS[currentAccent].border,
                color: ACCENT_COLORS[currentAccent].text,
                backgroundColor: ACCENT_COLORS[currentAccent].bgSubtle,
              }}
            >
              Badge
            </span>
            <div
              className="h-8 w-8 rounded-md border-2"
              style={{ borderColor: ACCENT_COLORS[currentAccent].primary }}
            />
            <Input
              type="text"
              readOnly
              value="Input focus"
              className="rounded-md border bg-slate-700 px-3 py-1.5 text-sm text-slate-100 focus:outline-none"
              style={{ borderColor: ACCENT_COLORS[currentAccent].primary }}
            />
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => updateSetting('accentColor', DEFAULT_SETTINGS.accentColor)}
        >
          Reset to Default (Blue)
        </Button>
      </div>
    </div>
  );
}

// ── Terminal Settings Tab ────────────────────────────────────────────

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
          <Select
            value={settings.terminalFontFamily}
            onValueChange={(value) => updateSetting('terminalFontFamily', value)}
          >
            <SelectTrigger className="w-56 border-slate-600 bg-slate-700 text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fontFamilyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            updateSetting('terminalFontFamily', DEFAULT_SETTINGS.terminalFontFamily);
            updateSetting('terminalFontSize', DEFAULT_SETTINGS.terminalFontSize);
          }}
        >
          Reset Terminal Settings to Defaults
        </Button>
      </div>
    </div>
  );
}

// ── Reusable components ──────────────────────────────────────────────

function SettingRow({
  label,
  description,
  error,
  children,
}: {
  label: React.ReactNode;
  description: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-700 last:border-0">
      <div className="pr-8 flex-1">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="text-xs text-slate-400 mt-1">{description}</p>
        {error && (
          <p
            className="text-xs text-red-400 mt-1.5 flex items-center gap-1"
            data-testid="validation-error"
          >
            <FiAlertTriangle size={12} />
            {error}
          </p>
        )}
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
  onError,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Called with error message or null to report validation state */
  onError?: (error: string | null) => void;
}) {
  const [rawValue, setRawValue] = useState(String(value));
  const [inputError, setInputError] = useState<string | null>(null);

  // Sync rawValue when value prop changes externally
  useEffect(() => {
    setRawValue(String(value));
  }, [value]);

  const handleChange = (text: string) => {
    setRawValue(text);

    if (text.trim() === '') {
      const err = 'A number is required';
      setInputError(err);
      onError?.(err);
      return;
    }

    const parsed = Number.parseInt(text, 10);

    if (Number.isNaN(parsed) || String(parsed) !== text.trim()) {
      const err = 'Must be a valid whole number';
      setInputError(err);
      onError?.(err);
      return;
    }

    if (parsed < min) {
      const err = `Minimum is ${min}`;
      setInputError(err);
      onError?.(err);
      onChange(parsed);
      return;
    }

    if (parsed > max) {
      const err = `Maximum is ${max}`;
      setInputError(err);
      onError?.(err);
      onChange(parsed);
      return;
    }

    setInputError(null);
    onError?.(null);
    onChange(parsed);
  };

  const borderClass = inputError
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500';

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const next = Math.max(min, value - 1);
            setRawValue(String(next));
            setInputError(null);
            onError?.(null);
            onChange(next);
          }}
          disabled={value <= min}
          className="h-8 w-8 border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"
        >
          -
        </Button>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={rawValue}
          onChange={(e) => handleChange(e.target.value)}
          className={`w-16 text-center bg-slate-700 text-slate-100 ${borderClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          data-testid="number-input"
          aria-invalid={!!inputError}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const next = Math.min(max, value + 1);
            setRawValue(String(next));
            setInputError(null);
            onError?.(null);
            onChange(next);
          }}
          disabled={value >= max}
          className="h-8 w-8 border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"
        >
          +
        </Button>
      </div>
      {inputError && (
        <p className="mt-1 text-xs text-red-400" data-testid="number-input-error">
          {inputError}
        </p>
      )}
    </div>
  );
}

/** Number input that allows typing raw values (including invalid ones) with visual error feedback */
function ValidatedNumberInput({
  value,
  min,
  max,
  onChange,
  hasError,
  onNonNumericError,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hasError?: boolean;
  /** Called when non-numeric text is entered; null clears the error */
  onNonNumericError?: (error: string | null) => void;
}) {
  const [rawValue, setRawValue] = useState(String(value));
  const [localNonNumericError, setLocalNonNumericError] = useState(false);

  // Sync rawValue when value prop changes (e.g., from reset)
  useEffect(() => {
    setRawValue(String(value));
  }, [value]);

  const handleRawChange = (text: string) => {
    setRawValue(text);

    // Empty field
    if (text.trim() === '') {
      setLocalNonNumericError(true);
      onNonNumericError?.('A number is required');
      return;
    }

    const parsed = Number.parseInt(text, 10);

    // Non-numeric text (e.g., "abc", "1.2.3")
    if (Number.isNaN(parsed) || String(parsed) !== text.trim()) {
      setLocalNonNumericError(true);
      onNonNumericError?.('Must be a valid whole number');
      return;
    }

    // Valid number - clear non-numeric error and let Zod validate range
    setLocalNonNumericError(false);
    onNonNumericError?.(null);
    onChange(parsed); // Let Zod validate - don't clamp
  };

  const showError = hasError || localNonNumericError;
  const borderClass = showError
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500';

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => {
          const next = Math.max(min, value - 1);
          setRawValue(String(next));
          setLocalNonNumericError(false);
          onNonNumericError?.(null);
          onChange(next);
        }}
        disabled={value <= min}
        className="h-8 w-8 border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"
        data-testid="numeric-decrement"
      >
        -
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={rawValue}
        onChange={(e) => handleRawChange(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (!/^-?\d+$/.test(pasted.trim())) {
            e.preventDefault();
            setLocalNonNumericError(true);
            onNonNumericError?.('Must be a valid whole number');
          }
        }}
        className={`w-16 text-center bg-slate-700 text-slate-100 ${borderClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        data-testid="validated-number-input"
        aria-invalid={showError}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => {
          const next = Math.min(max, value + 1);
          setRawValue(String(next));
          setLocalNonNumericError(false);
          onNonNumericError?.(null);
          onChange(next);
        }}
        disabled={value >= max}
        className="h-8 w-8 border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"
        data-testid="numeric-increment"
      >
        +
      </Button>
    </div>
  );
}

// ── Quality Gates Tab ─────────────────────────────────────────────────

const GATE_TYPE_OPTIONS = [
  { label: 'Test', value: 'test' },
  { label: 'Lint', value: 'lint' },
  { label: 'Typecheck', value: 'typecheck' },
  { label: 'Custom', value: 'custom' },
];

const GATE_TYPE_COLORS: Record<string, string> = {
  test: 'bg-green-500/20 text-green-400 border-green-500/30',
  lint: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  typecheck: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  custom: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const DEFAULT_COMMANDS: Record<string, string> = {
  test: 'npm test',
  lint: 'npm run lint',
  typecheck: 'npx tsc --noEmit',
  custom: '',
};

function QualityGatesSettings() {
  const { activeProject } = useProjectStore();
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Create form state
  const [newGateType, setNewGateType] = useState('test');
  const [newGateName, setNewGateName] = useState('');
  const [newGateCommand, setNewGateCommand] = useState('npm test');

  // Gate results state
  const [gateResults, setGateResults] = useState<QualityGateResult[]>([]);
  const [runningGates, setRunningGates] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editGateType, setEditGateType] = useState('test');

  const loadGates = useCallback(async () => {
    if (!activeProject) {
      setGates([]);
      setLoading(false);
      return;
    }
    try {
      const result = await window.electronAPI.qualityGateList(activeProject.id);
      if (result.data) {
        setGates(result.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  const loadResults = useCallback(async () => {
    if (!activeProject) return;
    try {
      const result = await window.electronAPI.qualityGateResults({
        project_id: activeProject.id,
        limit: 20,
      });
      if (result.data) {
        setGateResults(result.data);
      }
    } catch {
      // ignore
    }
  }, [activeProject]);

  useEffect(() => {
    loadGates();
    loadResults();
  }, [loadGates, loadResults]);

  const handleRunGates = async () => {
    if (!activeProject) return;
    setRunningGates(true);
    try {
      const result = await window.electronAPI.qualityGateRun(activeProject.id);
      if (result.error) {
        showStatus('error', result.error);
      } else if (result.data) {
        if (result.data.all_passed) {
          showStatus('success', 'All quality gates passed!');
        } else {
          showStatus(
            'error',
            `Some quality gates failed: ${result.data.results
              .filter((r) => r.status !== 'passed')
              .map((r) => r.gate_name)
              .join(', ')}`,
          );
        }
        loadResults();
      }
    } catch (err) {
      showStatus('error', String(err));
    } finally {
      setRunningGates(false);
    }
  };

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
    if (type === 'success') toast.success(text);
    else toast.error(text);
  };

  const handleCreate = async () => {
    if (!activeProject) return;
    const name =
      newGateName.trim() ||
      GATE_TYPE_OPTIONS.find((o) => o.value === newGateType)?.label ||
      newGateType;
    const command = newGateCommand.trim();
    if (!command) {
      showStatus('error', 'Command is required');
      return;
    }
    try {
      const id = `qg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result = await window.electronAPI.qualityGateCreate({
        id,
        project_id: activeProject.id,
        gate_type: newGateType,
        name,
        command,
        sort_order: gates.length,
      });
      if (result.error) {
        showStatus('error', result.error);
      } else {
        showStatus('success', `Quality gate "${name}" created`);
        setShowCreateForm(false);
        setNewGateType('test');
        setNewGateName('');
        setNewGateCommand('npm test');
        loadGates();
      }
    } catch (err) {
      showStatus('error', String(err));
    }
  };

  const handleToggle = async (gate: QualityGate) => {
    try {
      await window.electronAPI.qualityGateUpdate(gate.id, {
        enabled: !gate.enabled,
      });
      loadGates();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (gate: QualityGate) => {
    try {
      await window.electronAPI.qualityGateDelete(gate.id);
      showStatus('success', `Quality gate "${gate.name}" deleted`);
      loadGates();
    } catch (err) {
      showStatus('error', String(err));
    }
  };

  const handleSaveEdit = async (gateId: string) => {
    const name = editName.trim();
    const command = editCommand.trim();
    if (!command) {
      showStatus('error', 'Command is required');
      return;
    }
    try {
      const result = await window.electronAPI.qualityGateUpdate(gateId, {
        name: name || editGateType,
        command,
        gate_type: editGateType,
      });
      if (result.error) {
        showStatus('error', result.error);
      } else {
        showStatus('success', 'Quality gate updated');
        setEditingId(null);
        loadGates();
      }
    } catch (err) {
      showStatus('error', String(err));
    }
  };

  const startEdit = (gate: QualityGate) => {
    setEditingId(gate.id);
    setEditName(gate.name);
    setEditCommand(gate.command);
    setEditGateType(gate.gate_type);
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newGates = [...gates];
    const temp = newGates[index];
    newGates[index] = newGates[index - 1];
    newGates[index - 1] = temp;
    const reorderData = newGates.map((g, i) => ({ id: g.id, sort_order: i }));
    try {
      await window.electronAPI.qualityGateReorder(reorderData);
      loadGates();
    } catch {
      // ignore
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= gates.length - 1) return;
    const newGates = [...gates];
    const temp = newGates[index];
    newGates[index] = newGates[index + 1];
    newGates[index + 1] = temp;
    const reorderData = newGates.map((g, i) => ({ id: g.id, sort_order: i }));
    try {
      await window.electronAPI.qualityGateReorder(reorderData);
      loadGates();
    } catch {
      // ignore
    }
  };

  if (!activeProject) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
        <FiShield className="mx-auto mb-3 text-slate-400" size={32} />
        <p className="text-slate-400 text-sm">Select a project to configure quality gates.</p>
        <p className="text-slate-400 text-xs mt-1">Quality gates are stored per project.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <FiRefreshCw className="animate-spin text-slate-400 mr-2" size={20} />
        <span className="text-slate-400">Loading quality gates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="quality-gates-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FiShield size={18} />
            Quality Gates
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure test, lint, and typecheck commands as quality gates for{' '}
            <span className="text-slate-200 font-medium">{activeProject.name}</span>.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setShowCreateForm(true);
            setNewGateType('test');
            setNewGateName('');
            setNewGateCommand(DEFAULT_COMMANDS.test);
          }}
          className="gap-1.5 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
          data-testid="add-quality-gate-btn"
        >
          <FiPlus size={14} />
          Add Gate
        </Button>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <FiCheck className="inline mr-1.5" size={14} />
          ) : (
            <FiAlertTriangle className="inline mr-1.5" size={14} />
          )}
          {statusMessage.text}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div
          className="rounded-lg border border-slate-600 bg-slate-800 p-4 space-y-4"
          data-testid="create-quality-gate-form"
        >
          <h3 className="text-sm font-medium text-slate-200">Add Quality Gate</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="qg-gate-type" className="text-xs text-slate-400 mb-1">
                Gate Type
              </Label>
              <Select
                value={newGateType}
                onValueChange={(value) => {
                  setNewGateType(value);
                  setNewGateCommand(DEFAULT_COMMANDS[value] || '');
                }}
              >
                <SelectTrigger
                  className="w-full border-slate-600 bg-slate-700 text-slate-100"
                  data-testid="gate-type-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GATE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qg-gate-name" className="text-xs text-slate-400 mb-1">
                Name (optional)
              </Label>
              <Input
                id="qg-gate-name"
                type="text"
                value={newGateName}
                onChange={(e) => setNewGateName(e.target.value)}
                placeholder={
                  GATE_TYPE_OPTIONS.find((o) => o.value === newGateType)?.label || 'Gate name'
                }
                className="w-full border-slate-600 bg-slate-700 text-slate-100 placeholder:text-slate-400"
                data-testid="gate-name-input"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="qg-gate-command" className="text-xs text-slate-400 mb-1">
              Command
            </Label>
            <Input
              id="qg-gate-command"
              type="text"
              value={newGateCommand}
              onChange={(e) => setNewGateCommand(e.target.value)}
              placeholder="e.g., npm test"
              className="w-full border-slate-600 bg-slate-700 text-slate-100 font-mono placeholder:text-slate-400"
              data-testid="gate-command-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              className="gap-1 bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
              data-testid="save-quality-gate-btn"
            >
              <FiSave size={14} />
              Save Gate
            </Button>
          </div>
        </div>
      )}

      {/* Gates list */}
      {gates.length === 0 && !showCreateForm ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
          <FiShield className="mx-auto mb-3 text-slate-400" size={28} />
          <p className="text-slate-400 text-sm mb-1">No quality gates configured</p>
          <p className="text-slate-400 text-xs">
            Add test, lint, or typecheck commands to enforce code quality.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="quality-gates-list">
          {gates.map((gate, index) => (
            <div
              key={gate.id}
              className={`rounded-lg border bg-slate-800/50 p-4 transition-colors ${
                gate.enabled ? 'border-slate-700' : 'border-slate-700/50 opacity-60'
              }`}
              data-testid={`quality-gate-${gate.id}`}
            >
              {editingId === gate.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="qg-edit-type" className="text-xs text-slate-400 mb-1">
                        Type
                      </Label>
                      <Select
                        value={editGateType}
                        onValueChange={(value) => setEditGateType(value)}
                      >
                        <SelectTrigger className="w-full border-slate-600 bg-slate-700 text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GATE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="qg-edit-name" className="text-xs text-slate-400 mb-1">
                        Name
                      </Label>
                      <Input
                        id="qg-edit-name"
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border-slate-600 bg-slate-700 text-slate-100"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="qg-edit-command" className="text-xs text-slate-400 mb-1">
                      Command
                    </Label>
                    <Input
                      id="qg-edit-command"
                      type="text"
                      value={editCommand}
                      onChange={(e) => setEditCommand(e.target.value)}
                      className="w-full border-slate-600 bg-slate-700 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveEdit(gate.id)}
                      className="gap-1 bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
                    >
                      <FiCheck size={14} />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                // Display mode
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="h-6 w-6 text-slate-400 hover:text-slate-300"
                        title="Move up"
                      >
                        <FiChevronUp size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveDown(index)}
                        disabled={index >= gates.length - 1}
                        className="h-6 w-6 text-slate-400 hover:text-slate-300"
                        title="Move down"
                      >
                        <FiChevronDown size={14} />
                      </Button>
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={!!gate.enabled}
                      onCheckedChange={() => handleToggle(gate)}
                      className="data-[state=checked]:bg-green-600"
                      title={gate.enabled ? 'Disable gate' : 'Enable gate'}
                      data-testid={`toggle-gate-${gate.id}`}
                    />

                    {/* Gate info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{gate.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            GATE_TYPE_COLORS[gate.gate_type] || GATE_TYPE_COLORS.custom
                          }`}
                        >
                          {gate.gate_type}
                        </span>
                      </div>
                      <code className="text-xs text-slate-400 font-mono">{gate.command}</code>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Tooltip content="Edit gate">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(gate)}
                        className="h-8 w-8 text-slate-400 hover:text-slate-200"
                        data-testid={`edit-gate-${gate.id}`}
                      >
                        <FiEdit2 size={14} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Delete gate">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(gate)}
                        className="h-8 w-8 text-slate-400 hover:text-red-400"
                        data-testid={`delete-gate-${gate.id}`}
                      >
                        <FiTrash2 size={14} />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Run Gates Button */}
      {gates.length > 0 && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            onClick={handleRunGates}
            disabled={runningGates}
            className="gap-1.5 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
            data-testid="run-quality-gates-btn"
          >
            {runningGates ? (
              <FiRefreshCw className="animate-spin" size={14} />
            ) : (
              <FiPlay size={14} />
            )}
            {runningGates ? 'Running Gates...' : 'Run All Gates'}
          </Button>
          <span className="text-xs text-slate-400">Test your quality gates manually</span>
        </div>
      )}

      {/* Recent Gate Results */}
      {gateResults.length > 0 && (
        <div className="space-y-3" data-testid="gate-results-section">
          <h3 className="text-sm font-medium text-slate-200">Recent Gate Results</h3>
          <div className="space-y-1.5">
            {gateResults.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2"
                data-testid={`gate-result-${result.id}`}
              >
                <div className="flex items-center gap-2">
                  {result.status === 'passed' ? (
                    <FiCheck className="text-green-400" size={14} />
                  ) : result.status === 'failed' ? (
                    <FiX className="text-red-400" size={14} />
                  ) : (
                    <FiAlertTriangle className="text-amber-400" size={14} />
                  )}
                  <span className="text-sm text-slate-200">{result.gate_name}</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0 text-xs ${
                      GATE_TYPE_COLORS[result.gate_type] || GATE_TYPE_COLORS.custom
                    }`}
                  >
                    {result.gate_type}
                  </span>
                  {result.agent_name && (
                    <span className="text-xs text-slate-400">by {result.agent_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-medium ${
                      result.status === 'passed'
                        ? 'text-green-400'
                        : result.status === 'failed'
                          ? 'text-red-400'
                          : 'text-amber-400'
                    }`}
                  >
                    {result.status}
                  </span>
                  {result.duration_ms != null && (
                    <span className="text-xs text-slate-400">
                      {result.duration_ms > 1000
                        ? `${(result.duration_ms / 1000).toFixed(1)}s`
                        : `${result.duration_ms}ms`}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {new Date(result.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** General Settings - Window behavior & setup */
function GeneralSettings() {
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const { updateSetting } = useSettingsStore();

  useEffect(() => {
    window.electronAPI.storeGet('minimizeToTray').then((val) => {
      setMinimizeToTray(val === true);
    });
  }, []);

  const handleToggle = () => {
    const newValue = !minimizeToTray;
    setMinimizeToTray(newValue);
    window.electronAPI.storeSet('minimizeToTray', newValue);
  };

  const handleRerunSetup = () => {
    window.electronAPI.storeSet('setupCompleted', false);
    updateSetting('setupCompleted', false);
    window.location.hash = '';
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Window Behavior</h2>
        <p className="text-sm text-slate-400 mb-6">
          Configure how the application window behaves when minimized.
        </p>

        <SettingRow
          label="Minimize to System Tray"
          description="When enabled, minimizing the window hides it to the system tray instead of the taskbar."
        >
          <Switch
            checked={minimizeToTray}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-blue-600"
          />
        </SettingRow>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Setup</h2>
        <p className="text-sm text-slate-400 mb-6">
          Re-run the initial setup wizard to verify CLI detection, version, and authentication.
        </p>

        <SettingRow
          label="Setup Wizard"
          description="Re-run the setup wizard to check your Claude CLI installation and authentication status."
        >
          <Button
            type="button"
            variant="secondary"
            onClick={handleRerunSetup}
          >
            Re-run Setup
          </Button>
        </SettingRow>
      </div>
    </div>
  );
}

/** CLI Status Settings - Auth decision tree */
function CliStatusSettings() {
  return (
    <div data-testid="cli-status-settings">
      <h2 className="text-lg font-semibold text-slate-100 mb-2">Claude Code CLI Status</h2>
      <p className="text-sm text-slate-400 mb-6">
        Fleet Command requires the Claude Code CLI to be installed and authenticated. The decision
        tree below shows the current state.
      </p>
      <AuthDecisionTree />
    </div>
  );
}

// ── Notification Preferences Tab ─────────────────────────────────────

const NOTIFICATION_EVENT_LABELS: Record<
  keyof NotificationPreferences,
  { label: string; description: string }
> = {
  agent_completed: {
    label: 'Agent Completed',
    description: 'When an agent finishes its work successfully.',
  },
  agent_stalled: {
    label: 'Agent Stalled',
    description: 'When an agent appears idle beyond the stale threshold.',
  },
  agent_zombie: {
    label: 'Zombie Agent',
    description: 'When an agent is unresponsive and may need termination.',
  },
  agent_error: {
    label: 'Agent Error',
    description: 'When an agent encounters an error during execution.',
  },
  merge_ready: {
    label: 'Merge Ready',
    description: 'When a branch is ready for merge review.',
  },
  merge_failed: {
    label: 'Merge Failed',
    description: 'When a merge operation has failed.',
  },
  health_alert: {
    label: 'Health Alert',
    description: 'Fleet-wide health issues (e.g., multiple agents stalled).',
  },
};

function NotificationPreferencesSettings() {
  const { settings, updateSetting } = useSettingsStore();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const prefs = settings.notificationPreferences ?? { ...DEFAULT_NOTIFICATION_PREFERENCES };

  // Check if notifications are supported on mount
  useEffect(() => {
    const check = async () => {
      try {
        const result = await window.electronAPI.notificationIsSupported();
        setSupported(result.data);
      } catch {
        setSupported(false);
      }
    };
    check();
  }, []);

  // Sync preferences to notification service on mount & changes
  useEffect(() => {
    const sync = async () => {
      try {
        await window.electronAPI.notificationSetPreferences(
          prefs as unknown as Record<string, boolean>,
        );
      } catch {
        // Ignore sync errors
      }
    };
    sync();
  }, [prefs]);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    await updateSetting('notificationPreferences', updated);
    try {
      await window.electronAPI.notificationSetPreferences(
        updated as unknown as Record<string, boolean>,
      );
      setStatusMessage({
        type: 'success',
        text: `${NOTIFICATION_EVENT_LABELS[key].label} notifications ${updated[key] ? 'enabled' : 'disabled'}`,
      });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to update notification preferences' });
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleEnableAll = async () => {
    const allEnabled = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    await updateSetting('notificationPreferences', allEnabled);
    await window.electronAPI.notificationSetPreferences(
      allEnabled as unknown as Record<string, boolean>,
    );
    setStatusMessage({ type: 'success', text: 'All notifications enabled' });
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const handleDisableAll = async () => {
    const allDisabled: NotificationPreferences = {
      agent_completed: false,
      agent_stalled: false,
      agent_zombie: false,
      agent_error: false,
      merge_ready: false,
      merge_failed: false,
      health_alert: false,
    };
    await updateSetting('notificationPreferences', allDisabled);
    await window.electronAPI.notificationSetPreferences(
      allDisabled as unknown as Record<string, boolean>,
    );
    setStatusMessage({ type: 'success', text: 'All notifications disabled' });
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const enabledCount = Object.values(prefs).filter(Boolean).length;
  const totalCount = Object.keys(prefs).length;

  return (
    <div data-testid="notification-preferences-settings">
      <div className="flex items-center gap-3 mb-2">
        <FiBell className="text-blue-400" size={20} />
        <h2 className="text-lg font-semibold text-slate-100">Notification Preferences</h2>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Toggle which events trigger desktop notifications. Disable notifications for events you
        don't want to be alerted about.
      </p>

      {supported === false && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-900/30 border border-amber-700/50 px-4 py-3">
          <FiAlertTriangle className="text-amber-400 shrink-0" size={16} />
          <span className="text-sm text-amber-300">
            Desktop notifications are not supported on this platform.
          </span>
        </div>
      )}

      {statusMessage && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-900/30 border border-emerald-700/50'
              : 'bg-red-900/30 border border-red-700/50'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <FiCheck className="text-emerald-400 shrink-0" size={16} />
          ) : (
            <FiAlertTriangle className="text-red-400 shrink-0" size={16} />
          )}
          <span
            className={`text-sm ${statusMessage.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {statusMessage.text}
          </span>
        </div>
      )}

      {/* Summary & bulk actions */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-400">
          {enabledCount}/{totalCount} event types enabled
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEnableAll}
            className="text-xs"
          >
            Enable All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDisableAll}
            className="text-xs"
          >
            Disable All
          </Button>
        </div>
      </div>

      {/* Event type toggles */}
      <div className="space-y-1">
        {(Object.keys(NOTIFICATION_EVENT_LABELS) as Array<keyof NotificationPreferences>).map(
          (key) => {
            const { label, description } = NOTIFICATION_EVENT_LABELS[key];
            const enabled = prefs[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3 hover:bg-slate-800 transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="text-sm font-medium text-slate-200">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{description}</div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => handleToggle(key)}
                  className="data-[state=checked]:bg-blue-600 shrink-0"
                  data-testid={`notification-toggle-${key}`}
                />
              </div>
            );
          },
        )}
      </div>

      {/* Reset to defaults */}
      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleEnableAll}
        >
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

// ── Updates Tab ──────────────────────────────────────────────────────

function UpdateSettings() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [installing, setInstalling] = useState(false);

  // Load initial status on mount
  useEffect(() => {
    window.electronAPI.updateStatus().then((result) => {
      if (result.data) {
        setStatus(result.data);
      }
    });

    // Listen for live update events
    const handleStatus = (data: unknown) => {
      const s = data as UpdateStatus;
      setStatus(s);
      setChecking(false);
    };

    const handleDownloadProgress = (data: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }) => {
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              downloadProgress: data.percent,
              downloadedBytes: data.transferred,
              totalBytes: data.total,
              downloadSpeed: data.bytesPerSecond,
              isDownloading: true,
            }
          : null,
      );
    };

    const handleDownloaded = (data: { version: string; releaseNotes?: string | null }) => {
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isDownloaded: true,
              isDownloading: false,
              downloadProgress: 100,
              latestVersion: data.version,
              releaseNotes: data.releaseNotes ?? prev.releaseNotes,
            }
          : null,
      );
    };

    const handleError = (data: { message: string }) => {
      setChecking(false);
      setInstalling(false);
      setStatus((prev) => (prev ? { ...prev, error: data.message, isDownloading: false } : null));
    };

    const unsubStatus = window.electronAPI.onUpdateStatus(handleStatus);
    const unsubProgress = window.electronAPI.onUpdateDownloadProgress(handleDownloadProgress);
    const unsubDownloaded = window.electronAPI.onUpdateDownloaded(handleDownloaded);
    const unsubError = window.electronAPI.onUpdateError(handleError);

    return () => {
      unsubStatus();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setChecking(true);
    setStatus((prev) => (prev ? { ...prev, error: null } : null));
    try {
      const result = await window.electronAPI.updateCheck();
      if (result.data) {
        setStatus(result.data);
      }
      if (result.error) {
        setStatus((prev) => (prev ? { ...prev, error: result.error } : null));
      }
      setLastChecked(new Date());
    } catch {
      setStatus((prev) => (prev ? { ...prev, error: 'Failed to check for updates' } : null));
    } finally {
      setChecking(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    setStatus((prev) => (prev ? { ...prev, isDownloading: true, error: null } : null));
    window.electronAPI.updateDownload();
  }, []);

  const handleInstall = useCallback(() => {
    setInstalling(true);
    window.electronAPI.updateInstall();
  }, []);

  const formatBytes = (bytes: number | null): string => {
    if (!bytes) return '0 B';
    if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const formatSpeed = (bps: number | null): string => {
    if (!bps) return '';
    if (bps > 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bps > 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  };

  const progressPercent =
    status?.downloadProgress != null ? Math.round(status.downloadProgress) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Software Updates</h2>
        <p className="text-sm text-slate-400 mt-1">
          Check for and install updates to Fleet Command.
        </p>
      </div>

      {/* Current Version Card */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Current Version</p>
            <p className="text-xl font-bold text-slate-100 mt-1">
              v{status?.currentVersion ?? '...'}
            </p>
            {lastChecked && (
              <p className="text-xs text-slate-400 mt-1">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
          <Button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={checking || status?.isDownloading}
            className="gap-2 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
            data-testid="check-updates-btn"
          >
            <FiRefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Check for Updates'}
          </Button>
        </div>
      </div>

      {/* Result Display */}
      {status && !checking && (
        <>
          {/* Update Available */}
          {status.updateAvailable && !status.isDownloaded && !status.isDownloading && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-5">
              <div className="flex items-start gap-3">
                <FiDownload className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-300">Update Available</h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Version <strong className="text-white">v{status.latestVersion}</strong> is
                    available for download.
                  </p>
                  {status.releaseDate && (
                    <p className="text-xs text-slate-400 mt-1">
                      Released{' '}
                      {new Date(status.releaseDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={handleDownload}
                    className="mt-3 gap-2 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
                  >
                    <FiDownload className="w-4 h-4" />
                    Download Update
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Downloading */}
          {status.isDownloading && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-5">
              <div className="flex items-start gap-3">
                <FiDownload className="w-5 h-5 text-blue-400 mt-0.5 shrink-0 animate-bounce" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-300">Downloading Update</h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Downloading v{status.latestVersion}...
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>
                        {formatBytes(status.downloadedBytes)} / {formatBytes(status.totalBytes)}
                      </span>
                      <span className="flex items-center gap-2">
                        {status.downloadSpeed ? formatSpeed(status.downloadSpeed) : null}
                        <span className="font-mono font-bold text-slate-200">
                          {progressPercent}%
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Downloaded - Ready to Install */}
          {status.isDownloaded && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-5">
              <div className="flex items-start gap-3">
                <FiCheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-green-300">Ready to Install</h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Version <strong className="text-white">v{status.latestVersion}</strong> has been
                    downloaded and is ready to install. The app will restart to apply the update.
                  </p>
                  <Button
                    type="button"
                    onClick={handleInstall}
                    disabled={installing}
                    className="mt-3 gap-2 bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
                  >
                    <FiRefreshCw className={`w-4 h-4 ${installing ? 'animate-spin' : ''}`} />
                    {installing ? 'Installing...' : 'Restart & Install'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Up to Date */}
          {!status.updateAvailable && !status.isDownloaded && lastChecked && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-5">
              <div className="flex items-center gap-3">
                <FiCheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-green-300">You're up to date!</h3>
                  <p className="text-sm text-slate-300 mt-0.5">
                    Fleet Command v{status.currentVersion} is the latest version.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Release Notes */}
          {status.releaseNotes && status.updateAvailable && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FiFileText className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Release Notes</h3>
              </div>
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                {status.releaseNotes}
              </div>
            </div>
          )}

          {/* Error */}
          {status.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5">
              <div className="flex items-center gap-3">
                <FiAlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-300">Update Error</h3>
                  <p className="text-sm text-slate-300 mt-0.5">{status.error}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Auto-update info */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
        <p className="text-xs text-slate-400">
          Fleet Command automatically checks for updates on startup. Downloaded updates are
          installed when you quit the application.
        </p>
      </div>
    </div>
  );
}

// ── Cleanup Settings Tab ─────────────────────────────────────────────

type CleanupTarget = 'mail' | 'sessions' | 'metrics' | 'events' | 'issues' | 'all';

function CleanupSettings() {
  const [confirmTarget, setConfirmTarget] = useState<CleanupTarget | null>(null);
  const [wiping, setWiping] = useState(false);
  const [lastResult, setLastResult] = useState<{ target: string; success: boolean } | null>(null);

  const targets: {
    id: CleanupTarget;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'mail',
      label: 'Wipe Mail Database',
      description:
        'Delete all messages from the mail inbox. This removes all agent-to-agent and system messages.',
      icon: <FiTrash2 size={16} />,
    },
    {
      id: 'sessions',
      label: 'Wipe Sessions Database',
      description:
        'Delete all agent session records. This removes session history, handoffs, and logs.',
      icon: <FiTrash2 size={16} />,
    },
    {
      id: 'metrics',
      label: 'Wipe Metrics Database',
      description:
        'Delete all metrics and token usage data. This removes cost tracking and performance records.',
      icon: <FiTrash2 size={16} />,
    },
    {
      id: 'events',
      label: 'Wipe Events Database',
      description: 'Delete all event feed entries. This removes the activity log and timeline.',
      icon: <FiTrash2 size={16} />,
    },
    {
      id: 'issues',
      label: 'Wipe Issues Database',
      description: 'Delete all tracked issues and tasks.',
      icon: <FiTrash2 size={16} />,
    },
    {
      id: 'all',
      label: 'Nuclear Cleanup — Wipe Everything',
      description:
        'Delete ALL data from all tables: mail, sessions, metrics, events, merge queue, checkpoints, and issues. This cannot be undone.',
      icon: <FiAlertTriangle size={16} />,
    },
  ];

  const handleWipe = async (target: CleanupTarget) => {
    setWiping(true);
    setLastResult(null);
    try {
      const result = await window.electronAPI.cleanupExecute(
        target === 'all' ? undefined : { target },
      );
      setLastResult({ target, success: !!result.data });
      setConfirmTarget(null);
    } catch (err) {
      console.error('Cleanup failed:', err);
      toast.error('Cleanup failed');
      setLastResult({ target, success: false });
      setConfirmTarget(null);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="cleanup-settings">
      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-800/50 bg-amber-900/20 p-4">
        <FiAlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-300">Nuclear Cleanup</h3>
          <p className="mt-1 text-xs text-amber-400/80">
            These actions permanently delete data from the database. Each action requires explicit
            confirmation. This cannot be undone.
          </p>
        </div>
      </div>

      {/* Success/failure notification */}
      {lastResult && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            lastResult.success
              ? 'border-green-800 bg-green-900/20 text-green-400'
              : 'border-red-800 bg-red-900/20 text-red-400'
          }`}
        >
          {lastResult.success ? <FiCheckCircle size={14} /> : <FiAlertTriangle size={14} />}
          {lastResult.success
            ? `Successfully wiped ${lastResult.target === 'all' ? 'all databases' : `${lastResult.target} database`}.`
            : `Failed to wipe ${lastResult.target} database.`}
        </div>
      )}

      {/* Cleanup actions */}
      <div className="space-y-3">
        {targets.map((target) => (
          <div
            key={target.id}
            className={`rounded-lg border p-4 transition-colors ${
              target.id === 'all'
                ? 'border-red-800/50 bg-red-900/10'
                : 'border-slate-700 bg-slate-800/50'
            }`}
            data-testid={`cleanup-${target.id}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3
                  className={`text-sm font-medium ${target.id === 'all' ? 'text-red-300' : 'text-slate-200'}`}
                >
                  {target.label}
                </h3>
                <p className="mt-1 text-xs text-slate-400">{target.description}</p>
              </div>
              <Button
                type="button"
                onClick={() => setConfirmTarget(target.id)}
                disabled={wiping}
                className="gap-2 bg-slate-800/90 border border-red-500/30 text-red-300 hover:bg-slate-700/90 hover:border-red-400/40 shadow-sm"
                data-testid={`cleanup-btn-${target.id}`}
              >
                {target.icon}
                Wipe
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <DialogContent className="max-w-md border-slate-600 bg-slate-800" data-testid="cleanup-confirm-dialog">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/50">
                <FiAlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <DialogTitle>Confirm Wipe</DialogTitle>
                <DialogDescription>This action cannot be undone</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <p className="mb-6 text-sm text-slate-300">
            Are you sure you want to{' '}
            <span className="font-semibold text-red-400">
              {confirmTarget === 'all'
                ? 'wipe ALL databases'
                : `wipe the ${confirmTarget} database`}
            </span>
            ? All data will be permanently deleted.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmTarget(null)}
              disabled={wiping}
              data-testid="cleanup-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirmTarget && handleWipe(confirmTarget)}
              disabled={wiping}
              className="gap-2"
              data-testid="cleanup-confirm-btn"
            >
              {wiping ? (
                <>
                  <FiRefreshCw size={14} className="animate-spin" />
                  Wiping...
                </>
              ) : (
                <>
                  <FiTrash2 size={14} />
                  Confirm Wipe
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
