import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, RotateCw, Clock, LogIn, LogOut, Edit, Trash2, CheckCircle } from 'lucide-react';
import { getAllUsers, updateAttendanceEntry, deleteAttendanceEntry } from '../../services/firestore';
import { AttendanceRecord, User } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Extend jsPDF type to include autoTable
interface AutoTableOptions {
  startY?: number;
  head?: string[][];
  body?: string[][];
  styles?: { fontSize?: number };
  headStyles?: { fillColor?: number[] };
  alternateRowStyles?: { fillColor?: number[] };
  margin?: { left?: number; right?: number };
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: AutoTableOptions) => jsPDF;
  }
}

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
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    time: '',
    type: 'START_WORK' as 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK'
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const { isDarkMode } = useTheme();

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (messageType === 'success' && message) {
      const timer = setTimeout(() => {
        setMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [messageType, message]);

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
  const [logType, setLogType] = useState<string>('all'); // 'all', 'START_WORK', 'START_BREAK', 'STOP_BREAK', 'STOP_WORK'

  // Function to determine action label based on new system
  const getActionLabel = (type: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK'): string => {
    switch (type) {
      case 'START_WORK':
        return 'Started Work';
      case 'START_BREAK':
        return 'Started Break';
      case 'STOP_BREAK':
        return 'Stopped Break';
      case 'STOP_WORK':
        return 'Stopped Work';
      default:
        return 'Unknown Action';
    }
  };

  const loadData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const allUsers = await getAllUsers();

      // Filter out admin user
      const filteredUsers = allUsers.filter(user => user.id !== 'admin');
      setUsers(filteredUsers);

      // Collect all attendance logs from all users
      const allLogEntries: LogEntry[] = [];
      
      filteredUsers.forEach(user => {
        // Filter out old IN/OUT records, only keep new state-based actions
        const newEntries = (user.attendanceLog || []).filter(entry => 
          entry.type === 'START_WORK' || 
          entry.type === 'STOP_WORK' || 
          entry.type === 'START_BREAK' || 
          entry.type === 'STOP_BREAK'
        );

        // Transform attendance entries to log entries
        newEntries.forEach(entry => {
          const date = new Date(entry.timestamp);
          const actionLabel = getActionLabel(entry.type);
          
          allLogEntries.push({
            id: `${user.id}_${entry.timestamp.getTime()}`, // Generate unique ID
            userId: user.id,
            name: user.name,
            timestamp: entry.timestamp,
            type: entry.type,
            hourlyRate: user.hourlyRate,
            date: date.toISOString().split('T')[0], // Add required date field
            userName: user.name,
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
          });
        });
      });

      // Sort by timestamp descending (most recent first)
      allLogEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setLogs(allLogEntries);
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
      const start = new Date(startDate + 'T00:00:00');
      filtered = filtered.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate >= start;
      });
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      filtered = filtered.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate <= end;
      });
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

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('Attendance Logs', 14, 22);
    doc.setFontSize(10);
    doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 36);
    doc.text(`Total Records: ${filteredLogs.length}`, 14, 42);
    
    // Prepare data for table
    const tableData = filteredLogs.map(log => [
      log.formattedDate,
      log.formattedTime,
      log.userName,
      log.actionLabel
    ]);

    // Add table using autoTable
    autoTable(doc, {
      startY: 50,
      head: [['Date', 'Time', 'User Name', 'Action']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    // Save the PDF
    doc.save(`attendance_logs_${startDate}_to_${endDate}.pdf`);
  };

  // Edit and delete functions with Firebase integration
  const handleEditLog = (log: LogEntry) => {
    setEditingLog(log);
    // Parse the log ID to get timestamp
    const [, timestampStr] = (log.id || '').split('_');
    const entryDate = new Date(parseInt(timestampStr));
    
    setEditForm({
      date: entryDate.toISOString().split('T')[0],
      time: entryDate.toTimeString().split(' ')[0].substring(0, 5),
      type: log.type
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLog || !editingLog.id) return;
    
    try {
      const [userId, timestampStr] = editingLog.id.split('_');
      const entryIndex = findEntryIndex(userId, parseInt(timestampStr));
      
      if (entryIndex === -1) {
        setMessage('Error: Could not find entry to update');
        setMessageType('error');
        return;
      }
      
      const newTimestamp = new Date(`${editForm.date}T${editForm.time}:00`);
      
      await updateAttendanceEntry(userId, entryIndex, {
        timestamp: newTimestamp,
        type: editForm.type
      });
      
      // Refresh the data
      await loadData();
      setEditingLog(null);
      setMessage('Attendance entry updated successfully!');
      setMessageType('success');
    } catch (error) {
      console.error('Error updating attendance entry:', error);
      setMessage('Error updating attendance entry');
      setMessageType('error');
    }
  };

  const findEntryIndex = (userId: string, timestamp: number): number => {
    const user = users.find(u => u.id === userId);
    if (!user) return -1;
    
    return user.attendanceLog.findIndex(entry => 
      entry.timestamp.getTime() === timestamp
    );
  };

  const handleDeleteLog = async (logId: string | undefined) => {
    if (!logId) return;
    
    if (window.confirm('Are you sure you want to delete this attendance entry? This action cannot be undone.')) {
      try {
        const [userId, timestampStr] = logId.split('_');
        const entryIndex = findEntryIndex(userId, parseInt(timestampStr));
        
        if (entryIndex === -1) {
          setMessage('Error: Could not find entry to delete');
          setMessageType('error');
          return;
        }
        
        await deleteAttendanceEntry(userId, entryIndex);
        
        // Refresh the data
        await loadData();
        setMessage('Attendance entry deleted successfully!');
        setMessageType('success');
      } catch (error) {
        console.error('Error deleting attendance entry:', error);
        setMessage('Error deleting attendance entry');
        setMessageType('error');
      }
    }
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
              View detailed attendance action records for all users.
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
              onClick={exportToPDF}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors"
            >
              <Download size={16} />
              <span>Export PDF</span>
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

      {/* Toast Notification */}
      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-center space-x-2 ${
            messageType === 'success' 
              ? isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800'
              : messageType === 'error' 
                ? isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'
                : isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {messageType === 'success' && <CheckCircle className="w-5 h-5" />}
          <span className="font-medium">{message}</span>
        </motion.div>
      )}

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
              <option value="START_WORK">Start Work</option>
              <option value="STOP_WORK">Stop Work</option>
              <option value="START_BREAK">Start Break</option>
              <option value="STOP_BREAK">Stop Break</option>
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
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Actions
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
                        log.type === 'START_WORK' || log.type === 'STOP_WORK'
                          ? (isDarkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-600')
                          : (isDarkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-600')
                      }`}>
                        {log.type === 'START_WORK' || log.type === 'STOP_WORK' ? <LogIn size={16} /> : <LogOut size={16} />}
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
                      log.type === 'START_WORK' || log.type === 'STOP_WORK'
                        ? isDarkMode 
                          ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                          : 'bg-green-100 text-green-800 border border-green-200'
                        : isDarkMode
                          ? 'bg-orange-900/30 text-orange-400 border border-orange-800/50'
                          : 'bg-orange-100 text-orange-800 border border-orange-200'
                    }`}>
                      {log.actionLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditLog(log)}
                        className={`p-2 rounded-md transition-colors ${
                          isDarkMode 
                            ? 'text-blue-400 hover:bg-slate-700 hover:text-blue-300' 
                            : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                        title="Edit entry"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className={`p-2 rounded-md transition-colors ${
                          isDarkMode 
                            ? 'text-red-400 hover:bg-slate-700 hover:text-red-300' 
                            : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                        }`}
                        title="Delete entry"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
                ? 'No attendance records found. Records will appear here when users perform attendance actions.'
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
                    {(() => {
                      // Count actual work sessions (each START_WORK counts as 1 session)
                      const startWork = filteredLogs.filter(log => log.type === 'START_WORK').length;
                      const stopWork = filteredLogs.filter(log => log.type === 'STOP_WORK').length;
                      const incompleteWork = startWork - stopWork;
                      
                      return `${startWork} Work ${startWork === 1 ? 'Session' : 'Sessions'}${incompleteWork > 0 ? ` (${incompleteWork} incomplete)` : ''}`;
                    })()}
                  </span>
                </div>
                <div className={`flex items-center space-x-1 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                  <LogOut size={16} />
                  <span>
                    {(() => {
                      // Count actual breaks (each START_BREAK counts as 1 break)
                      const startBreaks = filteredLogs.filter(log => log.type === 'START_BREAK').length;
                      const stopBreaks = filteredLogs.filter(log => log.type === 'STOP_BREAK').length;
                      const incompleteBreaks = startBreaks - stopBreaks;
                      
                      return `${startBreaks} ${startBreaks === 1 ? 'Break' : 'Breaks'}${incompleteBreaks > 0 ? ` (${incompleteBreaks} incomplete)` : ''}`;
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Edit Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md mx-4`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Edit Attendance Entry
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  User
                </label>
                <div className={`px-3 py-2 rounded-md ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-900'}`}>
                  {editingLog.userName}
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Date
                </label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Time
                </label>
                <input
                  type="time"
                  value={editForm.time}
                  onChange={(e) => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Action Type
                </label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value as 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK' }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="START_WORK">Start Work</option>
                  <option value="STOP_WORK">Stop Work</option>
                  <option value="START_BREAK">Start Break</option>
                  <option value="STOP_BREAK">Stop Break</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingLog(null)}
                className={`px-4 py-2 rounded-md border ${
                  isDarkMode 
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogs;