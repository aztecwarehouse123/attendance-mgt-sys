export interface User {
  id: string;
  name: string;
  secretCode: string;
  amount: number;
  hourlyRate: number;
  attendanceLog: AttendanceEntry[];
}

export interface AttendanceEntry {
  timestamp: Date;
  type: 'IN' | 'OUT';
}

export interface AttendanceRecord {
  id?: string;
  userId: string;
  name: string;
  timestamp: Date;
  type: 'IN' | 'OUT';
  hourlyRate: number;
  amountEarned?: number;
  date: string;
}