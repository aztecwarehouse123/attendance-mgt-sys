import React, { useEffect, useState } from 'react';
import { getAllUsers } from '../../services/firestore';
import { User, AttendanceEntry } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { calculateBreaksWithCount } from '../../utils/timeCalculations';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RotateCw } from 'lucide-react';

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

// Helper function to format hours as clock format 'HH:MM'
function formatHoursAsClock(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const AttendanceDetail: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Set default startDate to first day of current month, endDate to today
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(() => {
    // Ensure we get the correct first day of month in YYYY-MM-DD format
    const year = firstDayOfMonth.getFullYear();
    const month = String(firstDayOfMonth.getMonth() + 1).padStart(2, '0');
    const day = String(firstDayOfMonth.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    // Ensure we get today's date in YYYY-MM-DD format
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
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

  // Filter out old IN/OUT entries, only show new state-based actions
  const newStateEntries: AttendanceEntry[] = selectedUser?.attendanceLog
    ? selectedUser.attendanceLog.filter(entry => 
        entry.type === 'START_WORK' || 
        entry.type === 'STOP_WORK' || 
        entry.type === 'START_BREAK' || 
        entry.type === 'STOP_BREAK'
      )
    : [];

  // Sort by timestamp descending
  const sortedAttendance: AttendanceEntry[] = [...newStateEntries].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  // Filter attendance by date range
  const filteredAttendance = sortedAttendance.filter(entry => {
    if (!startDate && !endDate) return true;
    const entryDate = format(entry.timestamp, 'yyyy-MM-dd');
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });

  // Calculate hours for filtered attendance (breaks are paid)
  const calculateFilteredHours = () => {
    if (!filteredAttendance.length) return 0;
    
    const sorted = [...filteredAttendance].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    let totalWorkMinutes = 0;
    let workStartTime: Date | null = null;
    
    for (const entry of sorted) {
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
    
    return totalWorkMinutes / 60;
  };

  // Export filtered actions to Excel
  const exportToExcel = () => {
    const data = filteredAttendance.map(entry => ({
      Date: entry.timestamp.toLocaleDateString(),
      Time: entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      Action: getActionLabel(entry.type)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `attendance_detail_${selectedUser?.name || 'user'}.xlsx`);
  };

  // Get human-readable action label
  const getActionLabel = (type: string): string => {
    switch (type) {
      case 'START_WORK': return 'Started Work';
      case 'STOP_WORK': return 'Stopped Work';
      case 'START_BREAK': return 'Started Break';
      case 'STOP_BREAK': return 'Stopped Break';
      default: return type;
    }
  };

  // Export filtered actions to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Action'];
    const csvData = [
      headers.join(','),
      ...filteredAttendance.map(entry => [
        entry.timestamp.toISOString().slice(0, 10),
        entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        `"${getActionLabel(entry.type)}"`
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

  // Export filtered actions to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const totalHours = calculateFilteredHours();
    const breaks = calculateBreaksWithCount(filteredAttendance);
    
    // Add title
    doc.setFontSize(16);
    doc.text('Attendance Details', 14, 22);
    doc.setFontSize(10);
    doc.text(`User: ${selectedUser?.name || 'Unknown'}`, 14, 30);
    doc.text(`Hourly Rate: \u00a3${selectedUser?.hourlyRate || 0}/hr`, 14, 36);
    doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 42);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 48);
    const startWork = filteredAttendance.filter(entry => entry.type === 'START_WORK').length;
    const startBreaks = filteredAttendance.filter(entry => entry.type === 'START_BREAK').length;
    doc.text(`Work Sessions: ${startWork}  |  Breaks: ${startBreaks}`, 14, 54);
    doc.text(`Total Hours: ${formatHoursAsClock(totalHours)}  |  Break Time: ${formatHoursAsClock(breaks.totalHours)}`, 14, 60);
    doc.text(`Total Amount: \u00a3${(totalHours * (selectedUser?.hourlyRate || 0)).toFixed(2)}`, 14, 66);
    
    // Prepare data for table
    const tableData = filteredAttendance.map(entry => [
      entry.timestamp.toLocaleDateString(),
      entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      getActionLabel(entry.type)
    ]);

    // Add table using autoTable
    autoTable(doc, {
      startY: 75,
      head: [['Date', 'Time', 'Action']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    // Save the PDF
    doc.save(`attendance_detail_${selectedUser?.name || 'user'}.pdf`);
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
            View and export detailed attendance actions for each user.
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
                onClick={exportToPDF}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors"
              >
                Export PDF
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
                    const totalHours = calculateFilteredHours();
                    return (totalHours * (selectedUser?.hourlyRate || 0)).toFixed(2);
                  })()}
                </div>
                <div>
                  <b>Work Sessions:</b> {(() => {
                    const startWork = filteredAttendance.filter(entry => entry.type === 'START_WORK').length;
                    const stopWork = filteredAttendance.filter(entry => entry.type === 'STOP_WORK').length;
                    const incomplete = startWork - stopWork;
                    return `${startWork} ${startWork === 1 ? 'session' : 'sessions'}${incomplete > 0 ? ` (${incomplete} incomplete)` : ''}`;
                  })()}
                </div>
                <div>
                  <b>Breaks:</b> {(() => {
                    const startBreaks = filteredAttendance.filter(entry => entry.type === 'START_BREAK').length;
                    const stopBreaks = filteredAttendance.filter(entry => entry.type === 'STOP_BREAK').length;
                    const incomplete = startBreaks - stopBreaks;
                    return `${startBreaks} ${startBreaks === 1 ? 'break' : 'breaks'}${incomplete > 0 ? ` (${incomplete} incomplete)` : ''}`;
                  })()}
                </div>
                <div>
                  <b>Total Hours:</b> {formatHoursAsClock(calculateFilteredHours())}
                </div>
                <div>
                  <b>Break Time:</b> {(() => {
                    const breaks = calculateBreaksWithCount(filteredAttendance);
                    return formatHoursAsClock(breaks.totalHours);
                  })()}
                </div>
                <div>
                  <b>Avg. Working Hours:</b> {(() => {
                    const startWork = filteredAttendance.filter(entry => entry.type === 'START_WORK').length;
                    if (startWork === 0) return '00:00';
                    
                    const totalHours = calculateFilteredHours();
                    const avgHours = totalHours / startWork;
                    return `${formatHoursAsClock(avgHours)} per session`;
                  })()}
                </div>
                <div>
                  <b>Max Working Hours:</b> {(() => {
                    // Calculate hours for each work session
                    const sorted = [...filteredAttendance].sort((a, b) => 
                      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                    
                    const sessionHours: number[] = [];
                    let workStart: Date | null = null;
                    
                    for (const entry of sorted) {
                      if (entry.type === 'START_WORK') {
                        workStart = new Date(entry.timestamp);
                      } else if (entry.type === 'STOP_WORK' && workStart) {
                        const hours = (new Date(entry.timestamp).getTime() - workStart.getTime()) / (1000 * 60 * 60);
                        sessionHours.push(hours);
                        workStart = null;
                      }
                    }
                    
                    if (sessionHours.length === 0) return '00:00';
                    const maxHours = Math.max(...sessionHours);
                    return formatHoursAsClock(maxHours);
                  })()}
                </div>
                <div>
                  <b>Min Working Hours:</b> {(() => {
                    // Calculate hours for each work session
                    const sorted = [...filteredAttendance].sort((a, b) => 
                      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                    
                    const sessionHours: number[] = [];
                    let workStart: Date | null = null;
                    
                    for (const entry of sorted) {
                      if (entry.type === 'START_WORK') {
                        workStart = new Date(entry.timestamp);
                      } else if (entry.type === 'STOP_WORK' && workStart) {
                        const hours = (new Date(entry.timestamp).getTime() - workStart.getTime()) / (1000 * 60 * 60);
                        sessionHours.push(hours);
                        workStart = null;
                      }
                    }
                    
                    if (sessionHours.length === 0) return '00:00';
                    const minHours = Math.min(...sessionHours);
                    return formatHoursAsClock(minHours);
                  })()}
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
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Action</th>
                </tr>
              </thead>
              <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y divide-slate-200`}>
                {isLoading ? (
                  <tr><td colSpan={3} className="text-center py-8 text-white">Loading...</td></tr>
                ) : filteredAttendance.length === 0 ? (
                  <tr><td colSpan={3} className={`text-center py-8 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>No attendance actions found.</td></tr>
                ) : filteredAttendance.map((entry, idx) => (
                  <tr key={idx} className={`${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors`}>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{entry.timestamp.toLocaleDateString()}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={`px-6 py-4 whitespace-nowrap`}>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        entry.type === 'START_WORK' || entry.type === 'STOP_WORK'
                          ? isDarkMode 
                            ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                            : 'bg-green-100 text-green-800 border border-green-200'
                          : entry.type === 'START_BREAK' || entry.type === 'STOP_BREAK'
                            ? isDarkMode
                              ? 'bg-orange-900/30 text-orange-400 border border-orange-800/50'
                              : 'bg-orange-100 text-orange-800 border border-orange-200'
                            : isDarkMode
                              ? 'bg-gray-700 text-gray-300'
                              : 'bg-gray-100 text-gray-700'
                      }`}>
                        {getActionLabel(entry.type)}
                      </span>
                    </td>
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