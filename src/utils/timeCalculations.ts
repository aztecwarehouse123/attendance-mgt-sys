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
  
  if (todayEntries.length < 2) return 0;
  
  let totalHours = 0;
  for (let i = 0; i < todayEntries.length; i += 2) {
    const inEntry = todayEntries[i];
    const outEntry = todayEntries[i + 1];
    
    if (inEntry && outEntry && inEntry.type === 'IN' && outEntry.type === 'OUT') {
      const minutesWorked = differenceInMinutes(
        new Date(outEntry.timestamp), 
        new Date(inEntry.timestamp)
      );
      totalHours += minutesWorked / 60;
    }
  }
  
  return totalHours;
};

export const getLastPunchType = (attendanceLog: AttendanceEntry[]): 'IN' | 'OUT' | null => {
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
  
  let totalHours = 0;
  const dailyEntries = new Map<string, AttendanceEntry[]>();
  
  monthEntries.forEach(entry => {
    const dateKey = formatDate(new Date(entry.timestamp));
    if (!dailyEntries.has(dateKey)) {
      dailyEntries.set(dateKey, []);
    }
    dailyEntries.get(dateKey)!.push(entry);
  });
  
  dailyEntries.forEach(entries => {
    for (let i = 0; i < entries.length; i += 2) {
      const inEntry = entries[i];
      const outEntry = entries[i + 1];
      
      if (inEntry && outEntry && inEntry.type === 'IN' && outEntry.type === 'OUT') {
        const minutesWorked = differenceInMinutes(
          new Date(outEntry.timestamp), 
          new Date(inEntry.timestamp)
        );
        totalHours += minutesWorked / 60;
      }
    }
  });
  
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
    
    for (let i = 0; i < entries.length - 1; i++) {
      const currentEntry = entries[i];
      const nextEntry = entries[i + 1];
      
      // Break occurs when current entry is OUT and next entry is IN
      if (currentEntry.type === 'OUT' && nextEntry.type === 'IN') {
        const breakMinutes = differenceInMinutes(
          new Date(nextEntry.timestamp),
          new Date(currentEntry.timestamp)
        );
        totalBreakMinutes += breakMinutes;
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
    
    for (let i = 0; i < entries.length - 1; i++) {
      const currentEntry = entries[i];
      const nextEntry = entries[i + 1];
      
      // Break occurs when current entry is OUT and next entry is IN
      if (currentEntry.type === 'OUT' && nextEntry.type === 'IN') {
        const breakMinutes = differenceInMinutes(
          new Date(nextEntry.timestamp),
          new Date(currentEntry.timestamp)
        );
        totalBreakMinutes += breakMinutes;
        breakCount++;
      }
    }
  });
  
  return {
    totalHours: totalBreakMinutes / 60, // Convert to hours
    count: breakCount
  };
};