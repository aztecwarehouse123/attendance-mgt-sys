import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, RotateCw, Clock, LogIn, LogOut } from 'lucide-react';
import { getAttendanceRecords, getAllUsers } from '../../services/firestore';
import { AttendanceRecord, User } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';

interface LogEntry extends AttendanceRecord {
  userName: string;
  formattedTime: string;
  formattedDate: string;
  actionLabel: string;
}

const AdminLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isDarkMode } = useTheme();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return today.getFullYear() + '-' + 
           String(today.getMonth() + 1).padStart(2, '0') + '-' + 
           String(today.getDate()).padStart(2, '0');
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const today = new Date();
    return today.getFullYear() + '-' + 
           String(today.getMonth() + 1).padStart(2, '0') + '-' + 
           String(today.getDate()).padStart(2, '0');
  });
  const [logType, setLogType] = useState<string>('all'); // 'all', 'IN', 'OUT'

  // Function to determine action label based on punch sequence
  const getActionLabel = (userId: string, timestamp: Date, type: 'IN' | 'OUT', allRecords: AttendanceRecord[]): string => {
    // Get all records for this user on the same date, sorted by time
    const userRecords = allRecords
      .filter(record => record.userId === userId)
      .filter(record => {
        const recordDate = new Date(record.timestamp);
        const targetDate = new Date(timestamp);
        return recordDate.toDateString() === targetDate.toDateString();
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Find the index of current record
    const currentIndex = userRecords.findIndex(record => 
      new Date(record.timestamp).getTime() === new Date(timestamp).getTime() && record.type === type
    );

    if (currentIndex === -1) return type === 'IN' ? 'Punch In' : 'Punch Out';

    // Determine label based on sequence
    if (type === 'IN') {
      if (currentIndex === 0) return 'Started Work';
      return 'Ended Break';
    } else { // type === 'OUT'
      if (currentIndex === 0) return 'Started Break';
      return 'Ended Work';
    }
  };

  const loadData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [attendanceRecords, allUsers] = await Promise.all([
        getAttendanceRecords(),
        getAllUsers()
      ]);

      // Filter out admin user
      const filteredUsers = allUsers.filter(user => user.id !== 'admin');
      setUsers(filteredUsers);

      // Create a user lookup map
      const userMap = new Map(filteredUsers.map(user => [user.id, user.name]));

      // Transform attendance records to log entries
      const logEntries: LogEntry[] = attendanceRecords.map(record => {
        const userName = userMap.get(record.userId) || 'Unknown User';
        const date = new Date(record.timestamp);
        const actionLabel = getActionLabel(record.userId, record.timestamp, record.type, attendanceRecords);
        
        return {
          ...record,
          userName,
          actionLabel,
          formattedTime: date.toLocaleTimeString('en-US', { 
            hour12: true, 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
          }),
          formattedDate: date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        };
      });

      // Sort by timestamp descending (most recent first)
      logEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setLogs(logEntries);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const filterLogs = useCallback(() => {
    let filtered = [...logs];

    // Filter by search term (name or secret code)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.userName.toLowerCase().includes(term) ||
        log.name.toLowerCase().includes(term)
      );
    }

    // Filter by selected user
    if (selectedUser !== 'all') {
      filtered = filtered.filter(log => log.userId === selectedUser);
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter(log => new Date(log.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      filtered = filtered.filter(log => new Date(log.timestamp) <= end);
    }

    // Filter by log type
    if (logType !== 'all') {
      filtered = filtered.filter(log => log.type === logType);
    }

    setFilteredLogs(filtered);
  }, [logs, searchTerm, selectedUser, startDate, endDate, logType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    filterLogs();
  }, [filterLogs]);

  const exportToExcel = () => {
    const data = filteredLogs.map(log => ({
      'Date': log.formattedDate,
      'Time': log.formattedTime,
      'User Name': log.userName,
      'Action': log.actionLabel
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Logs');
    XLSX.writeFile(wb, `attendance_logs_${startDate}_to_${endDate}.xlsx`);
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'User Name', 'Action'];
    const csvData = [
      headers.join(','),
      ...filteredLogs.map(log => [
        log.formattedDate,
        log.formattedTime,
        `"${log.userName}"`,
        `"${log.actionLabel}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_logs_${startDate}_to_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleManualRefresh = () => {
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${isDarkMode ? 'border-blue-400' : 'border-blue-600'}`}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <div className="flex justify-between items-center">
          <div>
            <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-2`}>
              Attendance Logs
            </h2>
            <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              View detailed punch-in and punch-out records for all users.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors"
            >
              <Download size={16} />
              <span>Export Excel</span>
            </button>
            <button
              onClick={exportToCSV}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors"
            >
              <Download size={16} />
              <span>Export CSV</span>
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
      </motion.div>

      {/* Filters */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'} w-5 h-5`} />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
              }`}
            />
          </div>

          {/* User Filter */}
          <div>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
            >
              <option value="all">All Users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          {/* Log Type Filter */}
          <div>
            <select
              value={logType}
              onChange={(e) => setLogType(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
            >
              <option value="all">All Actions</option>
              <option value="IN">Work Actions</option>
              <option value="OUT">Break Actions</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
            />
          </div>
        </div>
      </motion.div>

      {/* Logs Table */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow overflow-hidden border`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className={`${isDarkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Date
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Time
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  User
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y divide-slate-200`}>
              {filteredLogs.map((log, index) => (
                <motion.tr 
                  key={`${log.id}-${log.timestamp}`}
                  className={`${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                      {log.formattedDate}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {log.formattedTime}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                        log.type === 'IN' 
                          ? (isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-600')
                          : (isDarkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600')
                      }`}>
                        {log.type === 'IN' ? <LogIn size={16} /> : <LogOut size={16} />}
                      </div>
                      <div className="ml-3">
                        <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {log.userName}
                        </div>
                        <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {log.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      log.type === 'IN'
                        ? isDarkMode 
                          ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                          : 'bg-green-100 text-green-800 border border-green-200'
                        : isDarkMode
                          ? 'bg-red-900/30 text-red-400 border border-red-800/50'
                          : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      {log.actionLabel}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <div className={`mx-auto h-12 w-12 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
              <Clock size={48} />
            </div>
            <h3 className={`mt-2 text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-900'}`}>
              No logs found
            </h3>
            <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {logs.length === 0 
                ? 'No attendance records found. Records will appear here when users punch in/out.'
                : 'No logs match your current filters. Try adjusting your search criteria.'
              }
            </p>
          </div>
        )}

        {/* Summary Stats */}
        {filteredLogs.length > 0 && (
          <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-slate-700 bg-slate-700/50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between text-sm">
              <div className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Showing {filteredLogs.length} of {logs.length} records
              </div>
              <div className="flex items-center space-x-4">
                <div className={`flex items-center space-x-1 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                  <LogIn size={16} />
                  <span>
                    {filteredLogs.filter(log => log.type === 'IN').length} Work Actions
                  </span>
                </div>
                <div className={`flex items-center space-x-1 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                  <LogOut size={16} />
                  <span>
                    {filteredLogs.filter(log => log.type === 'OUT').length} Break Actions
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminLogs;