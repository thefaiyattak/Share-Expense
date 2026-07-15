import { create } from 'zustand';
import { AppUser, Expense, Attendance } from '../models/types';

interface AppState {
  currentAppUser: AppUser | null;
  activeTeamId: string | null;
  userTeams: any[];
  currency: string;
  darkMode: boolean;
  expenses: Expense[];
  members: AppUser[];
  attendance: Attendance[];
  categoryColors: Record<string, string>;

  setCurrentAppUser: (user: AppUser | null) => void;
  setActiveTeamId: (teamId: string | null) => void;
  setUserTeams: (teams: any[]) => void;
  setCurrency: (currency: string) => void;
  setDarkMode: (darkMode: boolean) => void;
  setExpenses: (expenses: Expense[]) => void;
  setMembers: (members: AppUser[]) => void;
  setAttendance: (attendance: Attendance[]) => void;
  setCategoryColor: (category: string, color: string) => void;
}

export const useStore = create<AppState>((set) => ({
  currentAppUser: null,
  activeTeamId: null,
  userTeams: [],
  currency: 'Rs.',
  darkMode: false,
  expenses: [],
  members: [],
  attendance: [],
  categoryColors: {
    breakfast: '#FFA726',
    lunch: '#4CAF50',
    dinner: '#5C6BC0',
    utility: '#EF5350',
  },

  setCurrentAppUser: (user) => set({ currentAppUser: user, activeTeamId: user ? user.teamId : null }),
  setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
  setUserTeams: (teams) => set({ userTeams: teams }),
  setCurrency: (currency) => set({ currency }),
  setDarkMode: (darkMode) => set({ darkMode }),
  setExpenses: (expenses) => set({ expenses }),
  setMembers: (members) => set({ members }),
  setAttendance: (attendance) => set({ attendance }),
  setCategoryColor: (category, color) => 
    set((state) => ({
      categoryColors: {
        ...state.categoryColors,
        [category]: color
      }
    })),
}));
