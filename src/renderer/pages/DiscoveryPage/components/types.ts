import {
  FiCheckCircle,
  FiCode,
  FiFolder,
  FiLayers,
  FiPackage,
  FiSettings,
} from 'react-icons/fi';
import type { DiscoveryCategory } from '../../../../shared/types';

export const DISCOVERY_CATEGORIES: {
  id: DiscoveryCategory;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    icon: FiLayers,
    description: 'Project structure, folder layout, design patterns, and component organization',
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    icon: FiPackage,
    description: 'Package dependencies, version compatibility, and third-party integrations',
  },
  {
    id: 'testing',
    label: 'Testing',
    icon: FiCheckCircle,
    description: 'Test frameworks, coverage, test patterns, and testing conventions',
  },
  {
    id: 'apis',
    label: 'APIs',
    icon: FiCode,
    description: 'API endpoints, data contracts, communication protocols, and integrations',
  },
  {
    id: 'config',
    label: 'Configuration',
    icon: FiSettings,
    description: 'Build tools, environment variables, deployment configs, and CI/CD',
  },
  {
    id: 'conventions',
    label: 'Conventions',
    icon: FiFolder,
    description: 'Coding style, naming conventions, file patterns, and implicit rules',
  },
];

/** Safely parse JSON with a fallback to prevent console errors */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
