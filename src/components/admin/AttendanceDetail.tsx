import React, { useEffect, useState } from 'react';
import { getAllUsers } from '../../services/firestore';
import { User, AttendanceEntry } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { RotateCw } from 'lucide-react';

const AttendanceDetail: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Set default startDate to first day of current month, endDate to today
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(firstDayOfMonth.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(today.toISOString().slice(0, 10));
  const { isDarkMode } = useTheme();

  const fetchUsers = async () => {
    setIsLoading(true);
    setIsRefreshing(true);
    const allUsers = await getAllUsers();
    const filtered = allUsers.filter(u => u.id !== 'admin');
    setUsers(filtered);
    if (filtered.length > 0) setSelectedUserId(filtered[0].id);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    setIsLoading(true);
    const user = users.find(u => u.id === selectedUserId) || null;
    setSelectedUser(user);
    setIsLoading(false);
  }, [selectedUserId, users]);

  // Sort attendanceLog by timestamp descending
  const sortedAttendance: AttendanceEntry[] = selectedUser?.attendanceLog
    ? [...selectedUser.attendanceLog].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    : [];

  // Filter attendance by date range
  const filteredAttendance = sortedAttendance.filter(entry => {
    if (!startDate && !endDate) return true;
    const entryDate = format(entry.timestamp, 'yyyy-MM-dd');
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });

  // Export filtered punches to Excel
  const exportToExcel = () => {
    const data = filteredAttendance.map(entry => ({
      Date: entry.timestamp.toLocaleDateString(),
      Time: entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      Type: entry.type
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `attendance_detail_${selectedUser?.name || 'user'}.xlsx`);
  };

  // Export filtered punches to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Type'];
    const csvData = [
      headers.join(','),
      ...filteredAttendance.map(entry => [
        entry.timestamp.toISOString().slice(0, 10),
        entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        entry.type
      ].join(','))
    ].join('\n');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_detail_${selectedUser?.name || 'user'}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Add manual refresh handler
  const handleManualRefresh = () => {
    fetchUsers();
  };

  return (
    <div className="space-y-6 relative">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow overflow-hidden border`}
      >
        <div className="p-6">
          <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-2`}>
            Attendance Details
          </h2>
          <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'} mb-4`}>
            View and export detailed attendance punches for each user.
          </p>
          <div className="flex justify-end mb-4">
            <div className="flex space-x-2 items-center">
              <button
                onClick={exportToExcel}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors"
              >
                Export Excel
              </button>
              <button
                onClick={exportToCSV}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={handleManualRefresh}
                className="ml-2 p-2 rounded-full border border-transparent hover:border-blue-400 transition-colors"
                aria-label="Refresh"
                disabled={isRefreshing}
              >
                <RotateCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''} text-blue-400`} />
              </button>
              {isRefreshing && <span className="text-xs text-slate-400 ml-1">Refreshing...</span>}
            </div>
          </div>
          <div className="mb-6 flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>User</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 focus:ring-2 focus:border-transparent ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                    : 'border-slate-300 text-slate-800 focus:ring-blue-500'
                }`}
              >
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className={`border rounded-md px-2 py-1 text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className={`border rounded-md px-2 py-1 text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}
                />
              </div>
            </div>
          </div>
          {selectedUser && (
            <div className={`mb-6 p-4 rounded-lg ${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}> 
              <div className="font-semibold text-lg mb-2">{selectedUser.name}</div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div><b>Secret Code:</b> {selectedUser.secretCode}</div>
                <div><b>Hourly Rate:</b> £{selectedUser.hourlyRate}</div>
                <div>
                  <b>Total Amount:</b> £{(() => {
                    let total = 0;
                    // Sort and group by day
                    const logByDay: { [key: string]: typeof filteredAttendance } = {};
                    filteredAttendance.forEach(entry => {
                      const dateKey = format(entry.timestamp, 'yyyy-MM-dd');
                      if (!logByDay[dateKey]) logByDay[dateKey] = [];
                      logByDay[dateKey].push(entry);
                    });
                    Object.values(logByDay).forEach(log => {
                      // Calculate hours for each day
                      let hours = 0;
                      const sorted = [...log].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                      for (let i = 0; i < sorted.length - 1; i += 2) {
                        if (sorted[i].type === 'IN' && sorted[i + 1].type === 'OUT') {
                          hours += (sorted[i + 1].timestamp.getTime() - sorted[i].timestamp.getTime()) / (1000 * 60 * 60);
                        }
                      }
                      total += hours * (selectedUser?.hourlyRate || 0);
                    });
                    return total.toFixed(2);
                  })()}
                </div>
                <div>
                  <b>Total Punches:</b> {Math.floor(filteredAttendance.length / 2)}
                </div>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className={`${isDarkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Date</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Time</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Type</th>
                </tr>
              </thead>
              <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y divide-slate-200`}>
                {isLoading ? (
                  <tr><td colSpan={3} className="text-center py-8 text-white">Loading...</td></tr>
                ) : filteredAttendance.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-8 text-white">No attendance punches found.</td></tr>
                ) : filteredAttendance.map((entry, idx) => (
                  <tr key={idx} className={`${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors`}>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{entry.timestamp.toLocaleDateString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{entry.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AttendanceDetail; 