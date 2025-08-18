import React, { useEffect, useState } from 'react';
import { getAllUsers } from '../../services/firestore';
import { User, AttendanceEntry } from '../../types';
import { getLastPunchType } from '../../utils/timeCalculations';
import { startOfDay } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
import { RotateCw, Coffee } from 'lucide-react';

const CurrentlyWorking: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isDarkMode } = useTheme();

  const fetchUsers = async () => {
    setIsRefreshing(true);
    setLoading(true);
    const allUsers = await getAllUsers();
    setUsers(allUsers.filter(u => u.id !== 'admin'));
    setLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 300000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Helper to get last IN punch time for today
  const getLastInTime = (attendanceLog: AttendanceEntry[]): Date | null => {
    const todayStart = startOfDay(new Date());
    const todayEntries = attendanceLog.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= todayStart;
    });
    for (let i = todayEntries.length - 1; i >= 0; i--) {
      if (todayEntries[i].type === 'IN') {
        return new Date(todayEntries[i].timestamp);
      }
    }
    return null;
  };

  // Helper to get last OUT punch time for today
  const getLastOutTime = (attendanceLog: AttendanceEntry[]): Date | null => {
    const todayStart = startOfDay(new Date());
    const todayEntries = attendanceLog.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= todayStart;
    });
    for (let i = todayEntries.length - 1; i >= 0; i--) {
      if (todayEntries[i].type === 'OUT') {
        return new Date(todayEntries[i].timestamp);
      }
    }
    return null;
  };

  // Helper to determine if user is currently on break
  const isUserOnBreak = (attendanceLog: AttendanceEntry[]): boolean => {
    const todayStart = startOfDay(new Date());
    const todayEntries = attendanceLog.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= todayStart;
    });

    if (todayEntries.length === 0) return false;

    const lastPunchType = todayEntries[todayEntries.length - 1].type;
    if (lastPunchType !== 'OUT') return false;

    // Use the same logic as in CodeEntry: determine break status by entry count
    const entryCount = todayEntries.length;
    
    // If entries divisible by 4 ending with OUT → user is done for day (positions 4, 8, 12...)
    // If entries mod 4 equals 2 ending with OUT → user is on break (positions 2, 6, 10...)
    if (entryCount % 4 === 2) {
      return true; // Positions 2, 6, 10... = on break
    } else if (entryCount % 4 === 0) {
      return false; // Positions 4, 8, 12... = done for day
    } else {
      return false; // Other positions shouldn't happen with OUT as last entry
    }
  };

  // Helper to group attendance by date and find missed punch outs
  const getForgotToPunchOut = () => {
    const todayStr = new Date().toDateString();
    const result: { user: User; dates: string[] }[] = [];
    users.forEach(user => {
      // Group entries by date string
      const byDate: { [date: string]: AttendanceEntry[] } = {};
      user.attendanceLog.forEach(entry => {
        const entryDate = new Date(entry.timestamp);
        const dateStr = entryDate.toDateString();
        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(entry);
      });
      // For each day except today, check if last punch is IN
      const missedDates: string[] = [];
      Object.entries(byDate).forEach(([dateStr, entries]) => {
        if (dateStr === todayStr) return;
        if (entries.length === 0) return;
        const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (sorted[sorted.length - 1].type === 'IN') {
          missedDates.push(dateStr);
        }
      });
      if (missedDates.length > 0) {
        result.push({ user, dates: missedDates });
      }
    });
    return result;
  };

  const currentlyWorking = users.filter(user => getLastPunchType(user.attendanceLog) === 'IN');
  const currentlyOnBreak = users.filter(user => isUserOnBreak(user.attendanceLog));
  const forgotToPunchOut = getForgotToPunchOut();

  return (
    <div className="py-8 relative">
      <div className="absolute top-0 right-0 flex items-center space-x-2 mr-8 mt-2">
        {isRefreshing && <span className="text-xs text-slate-400">Refreshing...</span>}
        <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''} text-blue-400`} aria-label="Refreshing" />
      </div>
      <h2 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
        Currently Working 
        <span className={`ml-2 px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800'}`}>
          {currentlyWorking.length}
        </span>
      </h2>
      <div className={`mb-6 p-4 rounded-lg shadow-lg ${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>
        {loading ? (
          <div>Loading...</div>
        ) : currentlyWorking.length === 0 ? (
          <div>No users are currently working.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-800'}>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Secret Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Working Since</th>
                  <th className="px-4 py-2 text-left font-semibold">Time Elapsed</th>
                </tr>
              </thead>
              <tbody className={isDarkMode ? 'bg-slate-700' : 'bg-white'}>
                {currentlyWorking.map(user => {
                  const lastIn = getLastInTime(user.attendanceLog);
                  let timeElapsed = '';
                  if (lastIn) {
                    const now = new Date();
                    const diffMs = now.getTime() - lastIn.getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
                    const seconds = Math.floor((diffMs / 1000) % 60);
                    timeElapsed = `${hours}h ${minutes}m ${seconds}s`;
                  }
                  return (
                    <tr key={user.id} className="border-b border-gray-300">
                      <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{lastIn ? lastIn.toLocaleTimeString() : '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{timeElapsed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Currently on Break Section */}
      <div className="flex items-center mb-4">
        <Coffee className={`w-6 h-6 mr-2 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`} />
        <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Currently on Break</h3>
        <span className={`ml-2 px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-800'}`}>
          {currentlyOnBreak.length}
        </span>
      </div>
      <div className={`mb-6 p-4 rounded-lg shadow-lg border-l-4 ${isDarkMode ? 'bg-slate-700 text-slate-200 border-orange-400' : 'bg-orange-50 text-slate-800 border-orange-500'}`}>
        {loading ? (
          <div>Loading...</div>
        ) : currentlyOnBreak.length === 0 ? (
          <div>No users are currently on break.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-800'}>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Secret Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Break Started</th>
                  <th className="px-4 py-2 text-left font-semibold">Break Duration</th>
                </tr>
              </thead>
              <tbody className={isDarkMode ? 'bg-slate-700' : 'bg-white'}>
                {currentlyOnBreak.map(user => {
                  const lastOut = getLastOutTime(user.attendanceLog);
                  let breakDuration = '';
                  if (lastOut) {
                    const now = new Date();
                    const diffMs = now.getTime() - lastOut.getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
                    const seconds = Math.floor((diffMs / 1000) % 60);
                    breakDuration = `${hours}h ${minutes}m ${seconds}s`;
                  }
                  return (
                    <tr key={user.id} className="border-b border-gray-300">
                      <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{lastOut ? lastOut.toLocaleTimeString() : '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{breakDuration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Forgot to Punch Out Section */}
      <h3 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Forgot to Punch Out</h3>
      <div className={`mb-6 p-4 rounded-lg shadow-lg ${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>
        {forgotToPunchOut.length === 0 ? (
          <div>No users forgot to punch out on previous days.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-800'}>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Secret Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Date(s)</th>
                </tr>
              </thead>
              <tbody className={isDarkMode ? 'bg-slate-700' : 'bg-white'}>
                {forgotToPunchOut.map(({ user, dates }) => (
                  <tr key={user.id} className="border-b border-gray-300">
                    <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{dates.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CurrentlyWorking; 