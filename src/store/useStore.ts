import { create } from 'zustand';
import { AppUser, Expense, Attendance } from '../models/types';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
}

interface AppState {
  currentAppUser: AppUser | null;
  activeTeamId: string | null;
  userTeams: any[];
  currency: string;
  darkMode: boolean;
  expenses: Expense[];
  serverExpenses: Expense[];
  members: AppUser[];
  serverMembers: AppUser[];
  attendance: Attendance[];
  serverAttendance: Attendance[];
  categoryColors: Record<string, string>;
  toast: ToastMessage | null;

  setCurrentAppUser: (user: AppUser | null) => void;
  setActiveTeamId: (teamId: string | null) => void;
  setUserTeams: (teams: any[]) => void;
  setCurrency: (currency: string) => void;
  setDarkMode: (darkMode: boolean) => void;
  setExpenses: (expenses: Expense[]) => void;
  setServerExpenses: (expenses: Expense[]) => void;
  setMembers: (members: AppUser[]) => void;
  setServerMembers: (members: AppUser[]) => void;
  setAttendance: (attendance: Attendance[]) => void;
  setServerAttendance: (attendance: Attendance[]) => void;
  setCategoryColor: (category: string, color: string) => void;
  showToast: (message: string, type?: ToastType, title?: string) => void;
  hideToast: () => void;
}

export const useStore = create<AppState>((set) => ({
  currentAppUser: null,
  activeTeamId: null,
  userTeams: [],
  currency: 'PKR',
  darkMode: false,
  expenses: [],
  serverExpenses: [],
  members: [],
  serverMembers: [],
  attendance: [],
  serverAttendance: [],
  categoryColors: {
    breakfast: '#FFA726',
    lunch: '#4CAF50',
    dinner: '#5C6BC0',
    utility: '#EF5350',
  },
  toast: null,

  setCurrentAppUser: (user) => set({ currentAppUser: user, activeTeamId: user ? user.teamId : null }),
  setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
  setUserTeams: (teams) => set({ userTeams: teams }),
  setCurrency: (currency) => set({ currency }),
  setDarkMode: (darkMode) => set({ darkMode }),
  setExpenses: (expenses) => set({ expenses, serverExpenses: expenses }),
  setServerExpenses: (expenses) => set({ serverExpenses: expenses, expenses }),
  setMembers: (members) => set({ members, serverMembers: members }),
  setServerMembers: (members) => set({ serverMembers: members, members }),
  setAttendance: (attendance) => set({ attendance, serverAttendance: attendance }),
  setServerAttendance: (attendance) => set({ serverAttendance: attendance, attendance }),
  setCategoryColor: (category, color) => 
    set((state) => ({
      categoryColors: {
        ...state.categoryColors,
        [category]: color
      }
    })),
  showToast: (message, type = 'info', title) => 
    set({
      toast: {
        id: Date.now().toString(),
        message,
        type,
        title,
      }
    }),
  hideToast: () => set({ toast: null }),
}));
