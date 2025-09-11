import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAllUsers } from '../../services/firestore';
import { User } from '../../types';
import { format } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';
// import { calculateTotalHoursThisMonth } from '../../utils/timeCalculations';

type DailyData = { date: string; punches: number; amount: number; hours: number; entries?: unknown[] };

function calculateTotalHoursForDay(log: { timestamp: string | Date, type: string }[]): number {
  let total = 0;
  const sorted = [...log].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (let i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].type === "IN" && sorted[i + 1].type === "OUT") {
      const inTime = new Date(sorted[i].timestamp).getTime();
      const outTime = new Date(sorted[i + 1].timestamp).getTime();
      total += (outTime - inTime) / (1000 * 60 * 60);
    }
  }
  return total;
}

// Calculate hours for a specific date range (similar to main page logic)
function calculateHoursForRange(attendanceLog: { timestamp: string | Date, type: string }[], startDate: Date, endDate: Date): number {
  const filteredEntries = attendanceLog.filter(entry => {
    const entryDate = new Date(entry.timestamp);
    return entryDate >= startDate && entryDate <= endDate;
  });

  let totalHours = 0;
  const dailyEntries = new Map<string, typeof attendanceLog>();
  
  filteredEntries.forEach(entry => {
    const dateKey = new Date(entry.timestamp).toISOString().split('T')[0];
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
        const minutesWorked = (new Date(outEntry.timestamp).getTime() - new Date(inEntry.timestamp).getTime()) / (1000 * 60);
        totalHours += minutesWorked / 60;
      }
    }
  });
  
  return totalHours;
}

function getDateRangeArray(start: Date, end: Date): string[] {
  const arr = [];
  for (const dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    arr.push(format(new Date(dt), 'MMM dd'));
  }
  return arr;
}

function formatHoursToHHMM(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return `${wholeHours}:${minutes.toString().padStart(2, '0')}`;
}

const AdminReports: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  // Set default startDate to first day of current month, endDate to today (using local timezone)
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(
    firstDayOfMonth.getFullYear() + '-' + 
    String(firstDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + 
    String(firstDayOfMonth.getDate()).padStart(2, '0')
  );
  const [endDate, setEndDate] = useState<string>(
    today.getFullYear() + '-' + 
    String(today.getMonth() + 1).padStart(2, '0') + '-' + 
    String(today.getDate()).padStart(2, '0')
  );
  const [chartData, setChartData] = useState<DailyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isDarkMode } = useTheme();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateChartData = useCallback(() => {
    const end = endDate
      ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
      : new Date();
    let start = startDate ? new Date(startDate) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
    if (!startDate && !endDate) {
      start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
    }
    const filteredUsers = users.filter(user => user.id !== 'admin' && (selectedUser === 'all' || user.id === selectedUser));
    const dailyData: { [key: string]: DailyData } = {};
    filteredUsers.forEach(user => {
      const filteredLog = (user.attendanceLog || []).filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= start && entryDate <= end;
      });
      const logByDay: { [key: string]: typeof user.attendanceLog } = {};
      filteredLog.forEach(entry => {
        const entryDate = new Date(entry.timestamp);
        const dateKey = format(entryDate, 'yyyy-MM-dd');
        if (!logByDay[dateKey]) logByDay[dateKey] = [];
        logByDay[dateKey].push(entry);
      });
      Object.entries(logByDay).forEach(([dateKey, log]) => {
        const punches = Math.floor(log.length / 2);
        const hours = calculateTotalHoursForDay(log);
        if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, punches: 0, amount: 0, hours: 0 };
        dailyData[dateKey].punches += punches;
        dailyData[dateKey].amount += hours * user.hourlyRate;
        dailyData[dateKey].hours += hours;
      });
    });
    // Fill in missing days with zeroes
    const allDates = getDateRangeArray(start, end);
    const chartDataMap = Object.values(dailyData).reduce((acc, item) => {
      const formattedDate = format(new Date(item.date), 'MMM dd');
      acc[formattedDate] = {
        ...item,
        date: formattedDate,
        amount: parseFloat(item.amount.toFixed(2)),
        hours: parseFloat(item.hours.toFixed(2))
      };
      return acc;
    }, {} as { [date: string]: DailyData });
    const filledChartData = allDates.map(date =>
      chartDataMap[date] || { date, punches: 0, amount: 0, hours: 0 }
    );
    setChartData(filledChartData);
  }, [users, selectedUser, startDate, endDate]);

  useEffect(() => {
    generateChartData();
  }, [generateChartData]);

  const getTotalStats = () => {
    const end = endDate
      ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
      : new Date();
    let start = startDate ? new Date(startDate) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
    if (!startDate && !endDate) {
      start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
    }
    const filteredUsers = users.filter(user => user.id !== 'admin' && (selectedUser === 'all' || user.id === selectedUser));
    let totalAmount = 0;
    let totalPunches = 0;
    let totalHours = 0;

    filteredUsers.forEach(user => {
      // Calculate hours for the selected date range using the same logic as main page
      const hours = calculateHoursForRange(user.attendanceLog || [], start, end);
      
      // Calculate punches for the selected date range
      const filteredLog = (user.attendanceLog || []).filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= start && entryDate <= end;
      });
      const punches = Math.floor(filteredLog.length / 2);
      
      totalPunches += punches;
      totalAmount += hours * user.hourlyRate;
      totalHours += hours;
    });
    
    const uniqueUsers = filteredUsers.length;
    return { totalPunches, totalAmount, totalHours, uniqueUsers };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${isDarkMode ? 'border-blue-400' : 'border-blue-600'}`}></div>
      </div>
    );
  }

  const stats = getTotalStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-4`}>
          Attendance Reports
        </h2>
        <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          View attendance trends and analytics over time.
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 ${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100'} rounded-full flex items-center justify-center`}>
                <span className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'} font-semibold`}>{stats.totalPunches}</span>
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Punches</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{stats.totalPunches}</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 ${isDarkMode ? 'bg-green-900/50' : 'bg-green-100'} rounded-full flex items-center justify-center`}>
                <span className={`${isDarkMode ? 'text-green-400' : 'text-green-600'} font-semibold`}>£</span>
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Amount</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>£{stats.totalAmount.toFixed(2)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 ${isDarkMode ? 'bg-orange-900/50' : 'bg-orange-100'} rounded-full flex items-center justify-center`}>
                <span className={`${isDarkMode ? 'text-orange-400' : 'text-orange-600'} font-semibold`}>⏱</span>
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Hours</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{formatHoursToHHMM(stats.totalHours)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 ${isDarkMode ? 'bg-purple-900/50' : 'bg-purple-100'} rounded-full flex items-center justify-center`}>
                <span className={`${isDarkMode ? 'text-purple-400' : 'text-purple-600'} font-semibold`}>{stats.uniqueUsers}</span>
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active Users</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{stats.uniqueUsers}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>User</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className={`w-full border rounded-md px-3 py-2 focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
            >
              <option value="all">All Users</option>
              {users.filter(user => user.id !== 'admin').map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-row gap-2 items-end">
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={`w-full border rounded-md px-2 py-1 text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}
              />
            </div>
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className={`w-full border rounded-md px-2 py-1 text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Charts */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-4`}>Attendance Trends</h3>
        
        {chartData.length === 0 ? (
          <div className="text-center py-12">
            <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No data available for the selected criteria.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Punches Chart */}
            <div>
              <h4 className={`text-md font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>Daily Punches</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#475569' : '#e2e8f0'} />
                  <XAxis 
                    dataKey="date" 
                    stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                    tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b' }}
                  />
                  <YAxis 
                    stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                    tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                      border: isDarkMode ? '1px solid #475569' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: isDarkMode ? '#f1f5f9' : '#1e293b'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="punches" 
                    stroke={isDarkMode ? '#3b82f6' : '#2563eb'} 
                    strokeWidth={2}
                    dot={{ fill: isDarkMode ? '#3b82f6' : '#2563eb' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Amount Chart */}
            <div>
              <h4 className={`text-md font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>Daily Earnings</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#475569' : '#e2e8f0'} />
                  <XAxis 
                    dataKey="date" 
                    stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                    tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b' }}
                  />
                  <YAxis 
                    stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                    tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                      border: isDarkMode ? '1px solid #475569' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: isDarkMode ? '#f1f5f9' : '#1e293b'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke={isDarkMode ? '#10b981' : '#059669'} 
                    strokeWidth={2}
                    dot={{ fill: isDarkMode ? '#10b981' : '#059669' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Hours Chart */}
            <div>
              <h4 className={`text-md font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>Daily Hours Worked</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#475569' : '#e2e8f0'} />
                  <XAxis 
                    dataKey="date" 
                    stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                    tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b' }}
                  />
                  <YAxis 
                    stroke={isDarkMode ? '#cbd5e1' : '#64748b'}
                    tick={{ fill: isDarkMode ? '#cbd5e1' : '#64748b' }}
                    tickFormatter={(value) => formatHoursToHHMM(value)}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                      border: isDarkMode ? '1px solid #475569' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: isDarkMode ? '#f1f5f9' : '#1e293b'
                    }}
                    formatter={(value) => [formatHoursToHHMM(value as number), 'Hours']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="hours" 
                    stroke={isDarkMode ? '#f59e0b' : '#d97706'} 
                    strokeWidth={2}
                    dot={{ fill: isDarkMode ? '#f59e0b' : '#d97706' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminReports; 