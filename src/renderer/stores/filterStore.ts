import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { create } from 'zustand';

interface AgentsPageFilters {
  viewMode: 'table' | 'cards' | 'hierarchy' | 'scope';
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  capabilityFilter: string;
}

interface TasksPageFilters {
  activeTab: 'issues' | 'groups' | 'ready' | 'completed';
  viewMode: 'list' | 'kanban';
  filterStatus: string;
  filterPriority: string;
  filterType: string;
}

interface FilterStore {
  agentsFilters: AgentsPageFilters;
  tasksFilters: TasksPageFilters;
  setAgentsFilters: (filters: Partial<AgentsPageFilters>) => void;
  setTasksFilters: (filters: Partial<TasksPageFilters>) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  agentsFilters: {
    viewMode: 'table',
    sorting: [],
    columnFilters: [],
    globalFilter: '',
    capabilityFilter: 'all',
  },
  tasksFilters: {
    activeTab: 'issues',
    viewMode: 'kanban',
    filterStatus: '',
    filterPriority: '',
    filterType: '',
  },
  setAgentsFilters: (filters) =>
    set((state) => ({
      agentsFilters: { ...state.agentsFilters, ...filters },
    })),
  setTasksFilters: (filters) =>
    set((state) => ({
      tasksFilters: { ...state.tasksFilters, ...filters },
    })),
}));
