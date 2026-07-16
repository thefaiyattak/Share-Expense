export type UserRole = 'admin' | 'user';

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'utility' | 'none';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  teamId: string;
  walletBalance: number;
  profileImageUrl?: string;
  currency: string;
  createdAt: Date;
  deactivated?: boolean;
  deleted?: boolean;
  deleteAt?: any;
}

export interface Team {
  id: string;
  name: string;
  adminId: string;
  memberIds: string[];
  createdAt: Date;
}

export interface Expense {
  id: string;
  userId: string;
  userName: string;
  itemName: string;
  quantity: number;
  price: number;
  category: MealCategory;
  date: Date;
  teamId: string;
  receiptImageUrl?: string;
  isEdited: boolean;
  lastEditedBy?: string;
  lastEditedAt?: Date;
  createdAt: Date;
}

export interface Attendance {
  id: string;
  userId: string;
  teamId: string;
  date: Date;
  isPresent: boolean;
  attendedBreakfast: boolean;
  attendedLunch: boolean;
  attendedDinner: boolean;
}

export interface EditHistory {
  id: string;
  entityId: string;
  entityType: string;
  userId: string;
  userName: string;
  previousData: Record<string, any>;
  newData: Record<string, any>;
  timestamp: Date;
}
