export interface User {
  id: string;
  name: string;
  secretCode: string;
  amount: number;
  hourlyRate: number;
  attendanceLog: AttendanceEntry[];
  currentState?: UserState;
}

export interface UserState {
  isWorking: boolean;
  isOnBreak: boolean;
  lastWorkStart?: Date;
  lastBreakStart?: Date;
  lastAction: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK' | null;
  lastActionTime?: Date;
}

export interface AttendanceEntry {
  timestamp: Date;
  type: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK';
}

export interface AttendanceRecord {
  id?: string;
  userId: string;
  name: string;
  timestamp: Date;
  type: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK';
  hourlyRate: number;
  amountEarned?: number;
  date: string;
}

export interface HolidayRequest {
  id: string;
  userId: string;
  userName: string;
  secretCode: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  adminNotes?: string;
}