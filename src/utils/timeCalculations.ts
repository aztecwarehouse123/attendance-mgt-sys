import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { AttendanceEntry } from '../types';

export const calculateHoursWorked = (attendanceLog: AttendanceEntry[]): number => {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  
  const todayEntries = attendanceLog.filter(entry => {
    const entryDate = new Date(entry.timestamp);
    return entryDate >= todayStart && entryDate <= todayEnd;
  });
  
  if (todayEntries.length === 0) return 0;
  
  // Sort entries by timestamp
  const sortedEntries = [...todayEntries].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  let totalWorkMinutes = 0;
  let workStartTime: Date | null = null;
  
  for (const entry of sortedEntries) {
    switch (entry.type) {
      case 'START_WORK':
        workStartTime = new Date(entry.timestamp);
        break;
      case 'START_BREAK':
        // Don't stop counting work time - breaks are paid
        // Just continue, break time will be included
        break;
      case 'STOP_BREAK':
        // Continue work timing - breaks are paid
        break;
      case 'STOP_WORK':
        if (workStartTime) {
          // Add total time from work start to work stop (including breaks)
          totalWorkMinutes += (new Date(entry.timestamp).getTime() - workStartTime.getTime()) / (1000 * 60);
          workStartTime = null; // Reset work start time
        }
        break;
    }
  }
  
  return totalWorkMinutes / 60;
};

export const getLastPunchType = (attendanceLog: AttendanceEntry[]): 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK' | null => {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  
  const todayEntries = attendanceLog.filter(entry => {
    const entryDate = new Date(entry.timestamp);
    return entryDate >= todayStart && entryDate <= todayEnd;
  });
  
  if (todayEntries.length === 0) return null;
  
  const lastEntry = todayEntries[todayEntries.length - 1];
  return lastEntry.type;
};

export const formatDate = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

export const formatTime = (date: Date): string => {
  return format(date, 'HH:mm:ss');
};

export const calculateMonthlyHours = (attendanceLog: AttendanceEntry[], month: number, year: number): number => {
  const monthEntries = attendanceLog.filter(entry => {
    const entryDate = new Date(entry.timestamp);
    return entryDate.getMonth() === month && entryDate.getFullYear() === year;
  });
  
  // Sort ALL entries by timestamp (not grouped by day)
  // This allows overnight shifts to be calculated correctly
  const sortedEntries = [...monthEntries].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  let totalHours = 0;
  let workStartTime: Date | null = null;
  
  for (const entry of sortedEntries) {
    switch (entry.type) {
      case 'START_WORK':
        workStartTime = new Date(entry.timestamp);
        break;
      case 'START_BREAK':
        // Breaks are paid - don't stop counting work time
        break;
      case 'STOP_BREAK':
        // Breaks are paid - continue work timing
        break;
      case 'STOP_WORK':
        if (workStartTime) {
          // Add total time from work start to work stop (including breaks - they're paid)
          totalHours += (new Date(entry.timestamp).getTime() - workStartTime.getTime()) / (1000 * 60 * 60);
          workStartTime = null; // Reset work start time
        }
        break;
    }
  }
  
  return totalHours;
};

export const calculateTotalHoursThisMonth = (attendanceLog: AttendanceEntry[]): number => {
  const now = new Date();
  return calculateMonthlyHours(attendanceLog, now.getMonth(), now.getFullYear());
};

export const calculateTotalBreaks = (attendanceLog: AttendanceEntry[]): number => {
  let totalBreakMinutes = 0;
  const dailyEntries = new Map<string, AttendanceEntry[]>();
  
  // Group entries by date
  attendanceLog.forEach(entry => {
    const dateKey = formatDate(new Date(entry.timestamp));
    if (!dailyEntries.has(dateKey)) {
      dailyEntries.set(dateKey, []);
    }
    dailyEntries.get(dateKey)!.push(entry);
  });
  
  // Calculate breaks for each day
  dailyEntries.forEach(entries => {
    // Sort entries by timestamp
    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    let breakStartTime: Date | null = null;
    
    for (const entry of entries) {
      switch (entry.type) {
        case 'START_BREAK':
          breakStartTime = new Date(entry.timestamp);
          break;
        case 'STOP_BREAK':
          if (breakStartTime) {
            const breakMinutes = differenceInMinutes(
              new Date(entry.timestamp),
              breakStartTime
            );
            totalBreakMinutes += breakMinutes;
            breakStartTime = null; // Reset break start time
          }
          break;
        case 'START_WORK':
        case 'STOP_WORK':
          // Reset break start time if work starts/stops
          breakStartTime = null;
          break;
      }
    }
  });
  
  return totalBreakMinutes / 60; // Convert to hours
};

export const calculateBreaksWithCount = (attendanceLog: AttendanceEntry[]): { totalHours: number; count: number } => {
  let totalBreakMinutes = 0;
  let breakCount = 0;
  const dailyEntries = new Map<string, AttendanceEntry[]>();
  
  // Group entries by date
  attendanceLog.forEach(entry => {
    const dateKey = formatDate(new Date(entry.timestamp));
    if (!dailyEntries.has(dateKey)) {
      dailyEntries.set(dateKey, []);
    }
    dailyEntries.get(dateKey)!.push(entry);
  });
  
  // Calculate breaks for each day
  dailyEntries.forEach(entries => {
    // Sort entries by timestamp
    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    let breakStartTime: Date | null = null;
    
    for (const entry of entries) {
      switch (entry.type) {
        case 'START_BREAK':
          breakStartTime = new Date(entry.timestamp);
          breakCount++;
          break;
        case 'STOP_BREAK':
          if (breakStartTime) {
            const breakMinutes = differenceInMinutes(
              new Date(entry.timestamp),
              breakStartTime
            );
            totalBreakMinutes += breakMinutes;
            breakStartTime = null; // Reset break start time
          }
          break;
        case 'START_WORK':
        case 'STOP_WORK':
          // Reset break start time if work starts/stops
          breakStartTime = null;
          break;
      }
    }
  });
  
  return {
    totalHours: totalBreakMinutes / 60, // Convert to hours
    count: breakCount
  };
};

// New function to get current user state
export const getCurrentUserState = (attendanceLog: AttendanceEntry[]): {
  isWorking: boolean;
  isOnBreak: boolean;
  lastAction: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK' | null;
  lastActionTime: Date | null;
} => {
  if (attendanceLog.length === 0) {
    return {
      isWorking: false,
      isOnBreak: false,
      lastAction: null,
      lastActionTime: null
    };
  }

  // Sort by timestamp to get the latest entry
  const sortedLog = [...attendanceLog].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const lastEntry = sortedLog[0];

  // Determine current state based on last action
  let isWorking = false;
  let isOnBreak = false;

  switch (lastEntry.type) {
    case 'START_WORK':
      isWorking = true;
      isOnBreak = false;
      break;
    case 'START_BREAK':
      isWorking = false;
      isOnBreak = true;
      break;
    case 'STOP_BREAK':
      isWorking = true;
      isOnBreak = false;
      break;
    case 'STOP_WORK':
      isWorking = false;
      isOnBreak = false;
      break;
  }

  return {
    isWorking,
    isOnBreak,
    lastAction: lastEntry.type,
    lastActionTime: lastEntry.timestamp
  };
};