import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiEdit2,
  FiEye,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiShield,
  FiStar,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { z } from 'zod';
import type { ConfigProfile, QualityGate, QualityGateResult } from '../../shared/types';
import { AuthDecisionTree } from '../components/AuthDecisionTree';
import { ProjectConfigEditor } from '../components/ProjectConfigEditor';
import { useProjectStore } from '../stores/projectStore';
import {
  ACCENT_COLORS,
  type AccentColorKey,
  DEFAULT_MODEL_DEFAULTS,
  DEFAULT_SETTINGS,
  type ModelDefaultsPerCapability,
  useSettingsStore,
} from '../stores/settingsStore';

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
    | 'cli-status'
    | 'agents'
    | 'watchdog'
    | 'terminal'
    | 'theme'
    | 'profiles'
    | 'quality-gates'
    | 'project-config'
    | 'notifications'
  >('agents');

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
    { id: 'cli-status' as const, label: 'CLI Status' },
    { id: 'agents' as const, label: 'Agents' },
    { id: 'watchdog' as const, label: 'Watchdog' },
    { id: 'terminal' as const, label: 'Terminal' },
    { id: 'theme' as const, label: 'Theme' },
    { id: 'profiles' as const, label: 'Profiles' },
    { id: 'quality-gates' as const, label: 'Quality Gates' },
    { id: 'notifications' as const, label: 'Notifications' },
    { id: 'project-config' as const, label: 'Project Config' },
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
                ? 'border-transparent'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
            style={
              activeTab === tab.id
                ? {
                    borderBottomColor: 'var(--accent-primary)',
                    color: 'var(--accent-text)',
                  }
                : undefined
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'cli-status' && <CliStatusSettings />}
      {activeTab === 'agents' && <AgentSettings />}
      {activeTab === 'watchdog' && <WatchdogSettings />}
      {activeTab === 'terminal' && <TerminalSettings />}
      {activeTab === 'theme' && <ThemeSettings />}
      {activeTab === 'profiles' && <ProfilesSettings />}
      {activeTab === 'quality-gates' && <QualityGatesSettings />}
      {activeTab === 'notifications' && <NotificationPreferencesSettings />}
      {activeTab === 'project-config' && <ProjectConfigEditor />}
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
        loadProfiles();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to delete' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to delete profile' });
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
        loadProfiles();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to duplicate profile' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to duplicate profile' });
    }
  };

  const handleActivate = async (id: string, name: string) => {
    try {
      const result = await window.electronAPI.profileActivate(id);
      if (result.data) {
        setStatusMessage({ type: 'success', text: `Activated profile "${name}"` });
        loadProfiles();
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to activate' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to activate profile' });
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
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <FiPlus size={16} />
          New Profile
        </button>
      </div>

      {/* Profile List */}
      {profiles.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-12 text-center">
          <div className="text-slate-500 text-4xl mb-3">
            <FiStar className="mx-auto" />
          </div>
          <p className="text-slate-400 text-sm">No configuration profiles yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Create a profile to quickly switch between different agent configurations.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
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
          ))}
        </div>
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
    scout: 'text-purple-400 bg-purple-900/30',
    builder: 'text-blue-400 bg-blue-900/30',
    reviewer: 'text-cyan-400 bg-cyan-900/30',
    lead: 'text-amber-400 bg-amber-900/30',
    merger: 'text-emerald-400 bg-emerald-900/30',
    coordinator: 'text-rose-400 bg-rose-900/30',
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
            <span className="text-xs text-slate-500">
              Depth: <span className="text-slate-300">{profile.max_hierarchy_depth}</span>
            </span>
            <span className="text-xs text-slate-500">
              Max Agents: <span className="text-slate-300">{profile.max_concurrent_agents}</span>
            </span>
            <span className="text-xs text-slate-500">
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
            <button
              type="button"
              onClick={onActivate}
              title="Activate this profile"
              className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-blue-400 transition-colors"
            >
              <FiStar size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Edit profile"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <FiEdit2 size={16} />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate profile"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-emerald-400 transition-colors"
          >
            <FiCopy size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete profile"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors"
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-100">Create Profile</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <FiX size={20} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <ProfileFormFields form={form} setForm={setForm} errors={errors} />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {submitting ? <FiRefreshCw className="animate-spin" size={14} /> : <FiPlus size={14} />}
            Create Profile
          </button>
        </div>
      </div>
    </div>
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
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? <FiRefreshCw className="animate-spin" size={14} /> : <FiSave size={14} />}
          Save Changes
        </button>
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
        {/* biome-ignore lint/a11y/noLabelWithoutControl: input is rendered below label in same container */}
        <label className="block text-sm font-medium text-slate-200 mb-1">
          Profile Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder='e.g., "Fast Build" or "Careful Review"'
          className={`w-full rounded-md border bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 ${
            errors.name
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
      </div>

      {/* Description */}
      <div>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: input is rendered below label in same container */}
        <label className="block text-sm font-medium text-slate-200 mb-1">Description</label>
        <input
          type="text"
          value={form.description || ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Brief description of this profile's purpose"
          className={`w-full rounded-md border bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 ${
            errors.description
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
      </div>

      {/* Agent config row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: NumberInput is a custom component */}
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Max Hierarchy Depth
          </label>
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
          {/* biome-ignore lint/a11y/noLabelWithoutControl: NumberInput is a custom component */}
          <label className="block text-xs font-medium text-slate-300 mb-1">Max Concurrent</label>
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
          {/* biome-ignore lint/a11y/noLabelWithoutControl: NumberInput is a custom component */}
          <label className="block text-xs font-medium text-slate-300 mb-1">Per Lead</label>
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
          {/* biome-ignore lint/a11y/noLabelWithoutControl: select is rendered below label */}
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Default Capability
          </label>
          <select
            value={form.default_capability}
            onChange={(e) =>
              setForm({
                ...form,
                default_capability: e.target.value as ProfileFormData['default_capability'],
              })
            }
            className={`w-full rounded-md border bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 ${
              errors.default_capability
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
            }`}
          >
            {CAPABILITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.default_capability && (
            <p className="mt-1 text-xs text-red-400">{errors.default_capability}</p>
          )}
        </div>
        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: select is rendered below label */}
          <label className="block text-xs font-medium text-slate-300 mb-1">Default Model</label>
          <select
            value={form.default_model}
            onChange={(e) =>
              setForm({
                ...form,
                default_model: e.target.value as ProfileFormData['default_model'],
              })
            }
            className={`w-full rounded-md border bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 ${
              errors.default_model
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
            }`}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
          <button
            type="button"
            onClick={() => updateSetting('watchdogEnabled', !settings.watchdogEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.watchdogEnabled ? 'bg-blue-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.watchdogEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
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
                  <span className="text-xs text-slate-500">{step.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Apply & Reset Buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={applyWatchdogConfig}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <FiSave size={14} />
          Apply to Watchdog
        </button>
        <button
          type="button"
          onClick={() => {
            updateSetting('watchdogEnabled', DEFAULT_SETTINGS.watchdogEnabled);
            updateSetting('watchdogIntervalMs', DEFAULT_SETTINGS.watchdogIntervalMs);
            updateSetting('watchdogStaleThresholdMs', DEFAULT_SETTINGS.watchdogStaleThresholdMs);
            updateSetting('watchdogZombieThresholdMs', DEFAULT_SETTINGS.watchdogZombieThresholdMs);
          }}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Reset Watchdog Settings to Defaults
        </button>
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
          />
        </SettingRow>

        {/* Max Concurrent Agents */}
        <SettingRow
          label="Max Concurrent Agents"
          description="Maximum number of agents that can run simultaneously."
          error={errors.maxConcurrentAgents}
        >
          <ValidatedNumberInput
            value={settings.maxConcurrentAgents}
            min={1}
            max={50}
            onChange={(v) => handleChange('maxConcurrentAgents', v)}
            hasError={!!errors.maxConcurrentAgents}
          />
        </SettingRow>

        {/* Max Agents Per Lead */}
        <SettingRow
          label="Max Agents Per Lead"
          description="Maximum number of worker agents a single lead can manage."
          error={errors.maxAgentsPerLead}
        >
          <ValidatedNumberInput
            value={settings.maxAgentsPerLead}
            min={1}
            max={20}
            onChange={(v) => handleChange('maxAgentsPerLead', v)}
            hasError={!!errors.maxAgentsPerLead}
          />
        </SettingRow>
      </div>

      {/* Model Defaults Per Capability */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Model Defaults Per Capability</h2>
        <p className="text-sm text-slate-400 mb-4">
          Set the default Claude model for each agent capability type. When spawning a new agent, the model picker will pre-select the configured default.
        </p>

        {(
          [
            { cap: 'scout' as const, label: 'Scout', color: 'text-purple-400' },
            { cap: 'builder' as const, label: 'Builder', color: 'text-blue-400' },
            { cap: 'reviewer' as const, label: 'Reviewer', color: 'text-cyan-400' },
            { cap: 'lead' as const, label: 'Lead', color: 'text-amber-400' },
            { cap: 'merger' as const, label: 'Merger', color: 'text-emerald-400' },
            { cap: 'coordinator' as const, label: 'Coordinator', color: 'text-rose-400' },
            { cap: 'monitor' as const, label: 'Monitor', color: 'text-teal-400' },
          ] as const
        ).map(({ cap, label, color }) => (
          <SettingRow
            key={cap}
            label={<span className={color}>{label}</span>}
            description={`Default model when spawning ${label.toLowerCase()} agents.`}
          >
            <select
              value={settings.modelDefaultsPerCapability?.[cap] ?? DEFAULT_MODEL_DEFAULTS[cap]}
              onChange={(e) => {
                const current = settings.modelDefaultsPerCapability ?? { ...DEFAULT_MODEL_DEFAULTS };
                updateSetting('modelDefaultsPerCapability', {
                  ...current,
                  [cap]: e.target.value,
                } as ModelDefaultsPerCapability);
              }}
              className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="haiku">Haiku (fast)</option>
              <option value="sonnet">Sonnet (balanced)</option>
              <option value="opus">Opus (most capable)</option>
            </select>
          </SettingRow>
        ))}
      </div>

      {/* Reset Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setErrors({});
            updateSetting('maxHierarchyDepth', DEFAULT_SETTINGS.maxHierarchyDepth);
            updateSetting('maxConcurrentAgents', DEFAULT_SETTINGS.maxConcurrentAgents);
            updateSetting('maxAgentsPerLead', DEFAULT_SETTINGS.maxAgentsPerLead);
            updateSetting('modelDefaultsPerCapability', { ...DEFAULT_MODEL_DEFAULTS });
          }}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Reset Agent Settings to Defaults
        </button>
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
            <button
              key={key}
              type="button"
              onClick={() => updateSetting('accentColor', key)}
              className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
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
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="border-t border-slate-700 pt-4">
          <p className="text-sm text-slate-400 mb-3">Preview</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
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
            </button>
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
            <input
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
        <button
          type="button"
          onClick={() => updateSetting('accentColor', DEFAULT_SETTINGS.accentColor)}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Reset to Default (Blue)
        </button>
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

/** Number input that allows typing raw values (including invalid ones) with visual error feedback */
function ValidatedNumberInput({
  value,
  min,
  max,
  onChange,
  hasError,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hasError?: boolean;
}) {
  const [rawValue, setRawValue] = useState(String(value));

  // Sync rawValue when value prop changes (e.g., from reset)
  useEffect(() => {
    setRawValue(String(value));
  }, [value]);

  const handleRawChange = (text: string) => {
    setRawValue(text);
    const parsed = Number.parseInt(text, 10);
    if (!Number.isNaN(parsed)) {
      onChange(parsed); // Let Zod validate - don't clamp
    }
  };

  const borderClass = hasError
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          const next = Math.max(min, value - 1);
          setRawValue(String(next));
          onChange(next);
        }}
        disabled={value <= min}
        className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        -
      </button>
      <input
        type="number"
        value={rawValue}
        min={min}
        max={max}
        onChange={(e) => handleRawChange(e.target.value)}
        className={`w-16 rounded-md border bg-slate-700 px-2 py-1 text-center text-sm text-slate-100 focus:outline-none focus:ring-1 ${borderClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        data-testid="validated-number-input"
      />
      <button
        type="button"
        onClick={() => {
          const next = Math.min(max, value + 1);
          setRawValue(String(next));
          onChange(next);
        }}
        disabled={value >= max}
        className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        +
      </button>
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
  typecheck: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
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
        <FiShield className="mx-auto mb-3 text-slate-500" size={32} />
        <p className="text-slate-400 text-sm">Select a project to configure quality gates.</p>
        <p className="text-slate-500 text-xs mt-1">Quality gates are stored per project.</p>
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
        <button
          type="button"
          onClick={() => {
            setShowCreateForm(true);
            setNewGateType('test');
            setNewGateName('');
            setNewGateCommand(DEFAULT_COMMANDS.test);
          }}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          data-testid="add-quality-gate-btn"
        >
          <FiPlus size={14} />
          Add Gate
        </button>
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
              <label htmlFor="qg-gate-type" className="block text-xs text-slate-400 mb-1">
                Gate Type
              </label>
              <select
                id="qg-gate-type"
                value={newGateType}
                onChange={(e) => {
                  setNewGateType(e.target.value);
                  setNewGateCommand(DEFAULT_COMMANDS[e.target.value] || '');
                }}
                className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="gate-type-select"
              >
                {GATE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qg-gate-name" className="block text-xs text-slate-400 mb-1">
                Name (optional)
              </label>
              <input
                id="qg-gate-name"
                type="text"
                value={newGateName}
                onChange={(e) => setNewGateName(e.target.value)}
                placeholder={
                  GATE_TYPE_OPTIONS.find((o) => o.value === newGateType)?.label || 'Gate name'
                }
                className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="gate-name-input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="qg-gate-command" className="block text-xs text-slate-400 mb-1">
              Command
            </label>
            <input
              id="qg-gate-command"
              type="text"
              value={newGateCommand}
              onChange={(e) => setNewGateCommand(e.target.value)}
              placeholder="e.g., npm test"
              className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 font-mono placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="gate-command-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
              data-testid="save-quality-gate-btn"
            >
              <FiSave className="inline mr-1" size={14} />
              Save Gate
            </button>
          </div>
        </div>
      )}

      {/* Gates list */}
      {gates.length === 0 && !showCreateForm ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
          <FiShield className="mx-auto mb-3 text-slate-500" size={28} />
          <p className="text-slate-400 text-sm mb-1">No quality gates configured</p>
          <p className="text-slate-500 text-xs">
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
                      <label htmlFor="qg-edit-type" className="block text-xs text-slate-400 mb-1">
                        Type
                      </label>
                      <select
                        id="qg-edit-type"
                        value={editGateType}
                        onChange={(e) => setEditGateType(e.target.value)}
                        className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {GATE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="qg-edit-name" className="block text-xs text-slate-400 mb-1">
                        Name
                      </label>
                      <input
                        id="qg-edit-name"
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="qg-edit-command" className="block text-xs text-slate-400 mb-1">
                      Command
                    </label>
                    <input
                      id="qg-edit-command"
                      type="text"
                      value={editCommand}
                      onChange={(e) => setEditCommand(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(gate.id)}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                    >
                      <FiCheck className="inline mr-1" size={14} />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                // Display mode
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Move up"
                      >
                        <FiChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(index)}
                        disabled={index >= gates.length - 1}
                        className="text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Move down"
                      >
                        <FiChevronDown size={14} />
                      </button>
                    </div>

                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggle(gate)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        gate.enabled ? 'bg-green-600' : 'bg-slate-600'
                      }`}
                      title={gate.enabled ? 'Disable gate' : 'Enable gate'}
                      data-testid={`toggle-gate-${gate.id}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          gate.enabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>

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
                    <button
                      type="button"
                      onClick={() => startEdit(gate)}
                      className="rounded p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                      title="Edit gate"
                      data-testid={`edit-gate-${gate.id}`}
                    >
                      <FiEdit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(gate)}
                      className="rounded p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                      title="Delete gate"
                      data-testid={`delete-gate-${gate.id}`}
                    >
                      <FiTrash2 size={14} />
                    </button>
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
          <button
            type="button"
            onClick={handleRunGates}
            disabled={runningGates}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="run-quality-gates-btn"
          >
            {runningGates ? (
              <FiRefreshCw className="animate-spin" size={14} />
            ) : (
              <FiPlay size={14} />
            )}
            {runningGates ? 'Running Gates...' : 'Run All Gates'}
          </button>
          <span className="text-xs text-slate-500">Test your quality gates manually</span>
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
                    <span className="text-xs text-slate-500">by {result.agent_name}</span>
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
                    <span className="text-xs text-slate-500">
                      {result.duration_ms > 1000
                        ? `${(result.duration_ms / 1000).toFixed(1)}s`
                        : `${result.duration_ms}ms`}
                    </span>
                  )}
                  <span className="text-xs text-slate-600">
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
