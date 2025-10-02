import React, { useEffect, useState } from 'react';
import { getAllUsers } from '../../services/firestore';
import { User, AttendanceEntry } from '../../types';
import { getCurrentUserState } from '../../utils/timeCalculations';
import { useTheme } from '../../contexts/ThemeContext';
import { RotateCw, Coffee, UserX, CheckCircle } from 'lucide-react';

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

  // Helper to get current user state
  const getUserCurrentState = (attendanceLog: AttendanceEntry[]) => {
    return getCurrentUserState(attendanceLog);
  };



  // Helper to group attendance by date and find missed punch outs
  const getForgotToPunchOut = () => {
    const todayStr = new Date().toDateString();
    const result: { user: User; dates: string[] }[] = [];
    users.forEach(user => {
      // Filter only new state-based actions
      const newEntries = user.attendanceLog.filter(entry => 
        entry.type === 'START_WORK' || 
        entry.type === 'STOP_WORK' || 
        entry.type === 'START_BREAK' || 
        entry.type === 'STOP_BREAK'
      );
      
      // Group entries by date string
      const byDate: { [date: string]: AttendanceEntry[] } = {};
      newEntries.forEach(entry => {
        const entryDate = new Date(entry.timestamp);
        const dateStr = entryDate.toDateString();
        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(entry);
      });
      // For each day except today, check if last action was work or break start
      const missedDates: string[] = [];
      Object.entries(byDate).forEach(([dateStr, entries]) => {
        if (dateStr === todayStr) return;
        if (entries.length === 0) return;
        const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const lastEntry = sorted[sorted.length - 1];
        if (lastEntry.type === 'START_WORK' || lastEntry.type === 'START_BREAK') {
          missedDates.push(dateStr);
        }
      });
      if (missedDates.length > 0) {
        result.push({ user, dates: missedDates });
      }
    });
    return result;
  };

  const currentlyWorking = users.filter(user => {
    const state = getUserCurrentState(user.attendanceLog);
    return state.isWorking && !state.isOnBreak;
  });
  const currentlyOnBreak = users.filter(user => {
    const state = getUserCurrentState(user.attendanceLog);
    return state.isOnBreak;
  });

  // Helper to get users who don't have attendance for today
  const getNotWorkingToday = () => {
    const todayStr = new Date().toDateString();
    return users.filter(user => {
      // Check if user has any attendance entries for today
      const todayEntries = user.attendanceLog.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate.toDateString() === todayStr;
      });
      
      // User has no attendance for today
      return todayEntries.length === 0;
    });
  };

  // Helper to get users who have completed their work for today
  const getCompletedWorkToday = () => {
    const todayStr = new Date().toDateString();
    return users.filter(user => {
      // Check if user has any attendance entries for today
      const todayEntries = user.attendanceLog.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate.toDateString() === todayStr;
      });
      
      // User has attendance today
      if (todayEntries.length === 0) return false;
      
      // Sort entries by timestamp to get the latest one
      const sortedEntries = [...todayEntries].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      const lastEntry = sortedEntries[sortedEntries.length - 1];
      
      // User's last action for today was STOP_WORK
      return lastEntry.type === 'STOP_WORK';
    });
  };

  // Helper function to calculate detailed time breakdown
  const getDetailedTimeBreakdown = (user: User, state: { isWorking: boolean; lastAction?: string | null; lastActionTime?: Date | null }) => {
    const todayStr = new Date().toDateString();
    const todayEntries = user.attendanceLog.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate.toDateString() === todayStr;
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalWorkTimeBeforeBreaks = 0;
    let totalBreakTime = 0;
    let currentWorkTimeSinceBreak = 0;
    
    let workStartTime: Date | null = null;
    let breakStartTime: Date | null = null;
    let lastBreakEndTime: Date | null = null;
    let isAfterBreak = false;

    for (const entry of todayEntries) {
      const entryTime = new Date(entry.timestamp);
      
      switch (entry.type) {
        case 'START_WORK':
          workStartTime = entryTime;
          isAfterBreak = false;
          break;
        case 'STOP_WORK':
          if (workStartTime) {
            if (isAfterBreak) {
              // This is work after a break
              currentWorkTimeSinceBreak += entryTime.getTime() - workStartTime.getTime();
            } else {
              // This is work before any breaks
              totalWorkTimeBeforeBreaks += entryTime.getTime() - workStartTime.getTime();
            }
          }
          workStartTime = null;
          break;
        case 'START_BREAK':
          if (workStartTime) {
            // End current work session before break
            if (isAfterBreak) {
              currentWorkTimeSinceBreak += entryTime.getTime() - workStartTime.getTime();
            } else {
              totalWorkTimeBeforeBreaks += entryTime.getTime() - workStartTime.getTime();
            }
          }
          breakStartTime = entryTime;
          workStartTime = null;
          break;
        case 'STOP_BREAK':
          if (breakStartTime) {
            totalBreakTime += entryTime.getTime() - breakStartTime.getTime();
          }
          lastBreakEndTime = entryTime;
          isAfterBreak = true;
          breakStartTime = null;
          // If currently working, this will be the start time for post-break work
          if (state.isWorking && state.lastAction === 'STOP_BREAK') {
            workStartTime = entryTime;
          }
          break;
      }
    }

    // If currently working, add current session time
    if (state.isWorking && state.lastActionTime) {
      const now = new Date();
      const currentSessionStart = state.lastActionTime;
      
      if (isAfterBreak && lastBreakEndTime && currentSessionStart.getTime() >= lastBreakEndTime.getTime()) {
        // Currently working after a break
        currentWorkTimeSinceBreak += now.getTime() - currentSessionStart.getTime();
      } else if (!isAfterBreak) {
        // Currently working without any breaks
        totalWorkTimeBeforeBreaks += now.getTime() - currentSessionStart.getTime();
      }
    }

    // Format time in hours and minutes
    const formatTime = (ms: number) => {
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms / (1000 * 60)) % 60);
      return `${hours}h ${minutes}m`;
    };

    const hasWorkBeforeBreaks = totalWorkTimeBeforeBreaks > 0;
    const hasWorkAfterBreaks = currentWorkTimeSinceBreak > 0;
    const hasBreaks = totalBreakTime > 0;

    // Calculate total time
    const totalWorkTime = totalWorkTimeBeforeBreaks + currentWorkTimeSinceBreak;
    const totalTime = totalWorkTime + totalBreakTime;

    // Build breakdown details
    let breakdownDetails = '';
    const details = [];
    
    if (hasWorkBeforeBreaks) {
      details.push(`${formatTime(totalWorkTimeBeforeBreaks)} before break`);
    }
    if (hasBreaks) {
      details.push(`${formatTime(totalBreakTime)} break time`);
    }
    if (hasWorkAfterBreaks) {
      details.push(`${formatTime(currentWorkTimeSinceBreak)} since break end`);
    }

    if (details.length > 1) {
      breakdownDetails = `(${details.join(' + ')})`;
    } else if (details.length === 1) {
      breakdownDetails = `(${details[0]})`;
    }

    // Return format: total time + breakdown in brackets
    if (breakdownDetails) {
      return `${formatTime(totalTime)} ${breakdownDetails}`;
    } else {
      return formatTime(totalTime);
    }
  };

  const notWorkingToday = getNotWorkingToday();
  const completedWorkToday = getCompletedWorkToday();
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
                  const state = getUserCurrentState(user.attendanceLog);
                  const lastWorkStart = state.lastActionTime;
                  
                  // Check if user resumed work after a break
                  const isAfterBreak = state.lastAction === 'STOP_BREAK';
                  
                  // Get detailed time breakdown
                  const detailedTimeBreakdown = getDetailedTimeBreakdown(user, state);
                  
                  return (
                    <tr key={user.id} className="border-b border-gray-300">
                      <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {lastWorkStart ? (
                          <div className="flex flex-col">
                            <span>{lastWorkStart.toLocaleTimeString()}</span>
                            {isAfterBreak && (
                              <span className={`text-xs italic ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                                (After break)
                              </span>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm">
                          {detailedTimeBreakdown}
                        </div>
                      </td>
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
                  const state = getUserCurrentState(user.attendanceLog);
                  const lastBreakStart = state.lastActionTime;
                  let breakDuration = '';
                  if (lastBreakStart) {
                    const now = new Date();
                    const diffMs = now.getTime() - lastBreakStart.getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
                    const seconds = Math.floor((diffMs / 1000) % 60);
                    breakDuration = `${hours}h ${minutes}m ${seconds}s`;
                  }
                  return (
                    <tr key={user.id} className="border-b border-gray-300">
                      <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{lastBreakStart ? lastBreakStart.toLocaleTimeString() : '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{breakDuration}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* No Attendance Today Section */}
      <div className="flex items-center mb-4">
        <UserX className={`w-6 h-6 mr-2 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
        <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>No Attendance Today</h3>
        <span className={`ml-2 px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'}`}>
          {notWorkingToday.length}
        </span>
      </div>
      <div className={`mb-6 p-4 rounded-lg shadow-lg border-l-4 ${isDarkMode ? 'bg-slate-700 text-slate-200 border-red-400' : 'bg-red-50 text-slate-800 border-red-300'}`}>
        {loading ? (
          <div>Loading...</div>
        ) : notWorkingToday.length === 0 ? (
          <div>All users have checked in today.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-800'}>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Secret Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Last Activity</th>
                </tr>
              </thead>
              <tbody className={isDarkMode ? 'bg-slate-700' : 'bg-white'}>
                {notWorkingToday.map(user => {
                  const lastActivity = user.attendanceLog.length > 0 
                    ? new Date(user.attendanceLog[user.attendanceLog.length - 1].timestamp).toLocaleDateString()
                    : 'Never';
                  
                  return (
                    <tr key={user.id} className="border-b border-gray-300">
                      <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          isDarkMode 
                            ? 'bg-red-900/50 text-red-300' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          No attendance today
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{lastActivity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Completed Work Today Section */}
      <div className="flex items-center mb-4">
        <CheckCircle className={`w-6 h-6 mr-2 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
        <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Completed Work Today</h3>
        <span className={`ml-2 px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800'}`}>
          {completedWorkToday.length}
        </span>
      </div>
      <div className={`mb-6 p-4 rounded-lg shadow-lg border-l-4 ${isDarkMode ? 'bg-slate-700 text-slate-200 border-green-400' : 'bg-green-50 text-slate-800 border-green-300'}`}>
        {loading ? (
          <div>Loading...</div>
        ) : completedWorkToday.length === 0 ? (
          <div>No users have completed their work for today.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className={isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-800'}>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Secret Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Work Completed At</th>
                  <th className="px-4 py-2 text-left font-semibold">Total Work Time</th>
                </tr>
              </thead>
              <tbody className={isDarkMode ? 'bg-slate-700' : 'bg-white'}>
                {completedWorkToday.map(user => {
                  const todayStr = new Date().toDateString();
                  const todayEntries = user.attendanceLog.filter(entry => {
                    const entryDate = new Date(entry.timestamp);
                    return entryDate.toDateString() === todayStr;
                  });
                  
                  // Sort entries by timestamp to get work completion time
                  const sortedEntries = [...todayEntries].sort((a, b) => 
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  );
                  
                  const lastEntry = sortedEntries[sortedEntries.length - 1];
                  const workCompletedAt = new Date(lastEntry.timestamp).toLocaleTimeString();
                  
                  // Calculate total work time for today
                  let totalWorkMinutes = 0;
                  let workStartTime: Date | null = null;
                  
                  for (const entry of sortedEntries) {
                    switch (entry.type) {
                      case 'START_WORK':
                        workStartTime = new Date(entry.timestamp);
                        break;
                      case 'START_BREAK':
                        // Breaks are paid - don't stop counting
                        break;
                      case 'STOP_BREAK':
                        // Breaks are paid - continue counting
                        break;
                      case 'STOP_WORK':
                        if (workStartTime) {
                          totalWorkMinutes += (new Date(entry.timestamp).getTime() - workStartTime.getTime()) / (1000 * 60);
                          workStartTime = null;
                        }
                        break;
                    }
                  }
                  
                  const totalHours = Math.floor(totalWorkMinutes / 60);
                  const remainingMinutes = Math.floor(totalWorkMinutes % 60);
                  const totalWorkTime = `${totalHours}h ${remainingMinutes}m`;
                  
                  return (
                    <tr key={user.id} className="border-b border-gray-300">
                      <td className="px-4 py-2 whitespace-nowrap">{user.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.secretCode}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{workCompletedAt}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{totalWorkTime}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Forgot to Stop Work/Break Section */}
      <h3 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Forgot to Stop Work/Break</h3>
      <div className={`mb-6 p-4 rounded-lg shadow-lg ${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>
        {forgotToPunchOut.length === 0 ? (
          <div>No users forgot to stop work or break on previous days.</div>
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