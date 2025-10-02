import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, UserPlus, Edit2, Trash2, RotateCw } from 'lucide-react';
import { getAllUsers, deleteUser, updateUser } from '../../services/firestore';
import { User, AttendanceEntry } from '../../types';
import { calculateMonthlyHours, calculateBreaksWithCount } from '../../utils/timeCalculations';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';
import AddUserModal from '../AddUserModal';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../Modal';

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


type UserWithMonthAttendance = User & { monthAttendance: AttendanceEntry[] };

const AdminMain: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithMonthAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return firstDayOfMonth.getFullYear() + '-' + 
           String(firstDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + 
           String(firstDayOfMonth.getDate()).padStart(2, '0');
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const today = new Date();
    return today.getFullYear() + '-' + 
           String(today.getMonth() + 1).padStart(2, '0') + '-' + 
           String(today.getDate()).padStart(2, '0');
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const { isDarkMode } = useTheme();
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filterUsers = useCallback(() => {
    // Parse date range
    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(endDate + 'T23:59:59') : null; // Include full end day

    const filtered = users
      .map(user => {
        // Filter attendanceLog for the selected date range
        const monthAttendance = (user.attendanceLog || []).filter(entry => {
          if (!rangeStart && !rangeEnd) return true;
          const entryDate = new Date(entry.timestamp);
          if (rangeStart && entryDate < rangeStart) return false;
          if (rangeEnd && entryDate > rangeEnd) return false;
          return true;
        });
        return {
          ...user,
          monthAttendance
        };
      })
      .filter(user => {
        // Always show all users except admin, filtered by search
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.secretCode.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      });

    setFilteredUsers(filtered);
  }, [users, searchTerm, startDate, endDate]);

  useEffect(() => {
    loadUsers();
    const interval = setInterval(() => {
      setIsRefreshing(true);
      loadUsers();
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterUsers();
  }, [filterUsers]);

  const loadUsers = async () => {
    try {
      const allUsers = await getAllUsers();
      const filtered = allUsers.filter(user => user.id !== 'admin');
      setUsers(filtered);
      // After setting users, check and update amount if needed
      filtered.forEach(async (user) => {
        const now = new Date();
        const calculatedAmount = Number((calculateMonthlyHours(user.attendanceLog || [], now.getMonth(), now.getFullYear()) * user.hourlyRate).toFixed(2));
        if (user.amount !== calculatedAmount) {
          try {
            await updateUser(user.id, { amount: calculatedAmount });
          } catch (err) {
            console.error(`Failed to update amount for user ${user.id}:`, err);
          }
        }
      });
    } catch (error){
      console.error('Error loading users:', error);
    }finally{
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleUserAdded = () => {
    loadUsers(); // Reload the users list
  };

  // Calculate hours for the selected date range
  // Breaks are PAID, so we count total time from START_WORK to STOP_WORK
  const calculateHoursForRange = (attendanceLog: AttendanceEntry[]) => {
    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(endDate + 'T23:59:59') : null;
    
    const filteredEntries = attendanceLog.filter(entry => {
      if (!rangeStart && !rangeEnd) return true;
      const entryDate = new Date(entry.timestamp);
      if (rangeStart && entryDate < rangeStart) return false;
      if (rangeEnd && entryDate > rangeEnd) return false;
      return true;
    });

    // Sort entries by timestamp
    const sortedEntries = [...filteredEntries].sort((a, b) => 
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
          // Breaks are paid - don't stop counting work time
          break;
        case 'STOP_BREAK':
          // Breaks are paid - continue work timing
          break;
        case 'STOP_WORK':
          if (workStartTime) {
            // Add total time from work start to work stop (including breaks - they're paid)
            totalWorkMinutes += (new Date(entry.timestamp).getTime() - workStartTime.getTime()) / (1000 * 60);
            workStartTime = null; // Reset work start time
          }
          break;
      }
    }
    
    return totalWorkMinutes / 60;
  };

  // Calculate breaks for the selected date range
  const calculateBreaksForRange = (attendanceLog: AttendanceEntry[]) => {
    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(endDate + 'T23:59:59') : null;
    
    const filteredEntries = attendanceLog.filter(entry => {
      if (!rangeStart && !rangeEnd) return true;
      const entryDate = new Date(entry.timestamp);
      if (rangeStart && entryDate < rangeStart) return false;
      if (rangeEnd && entryDate > rangeEnd) return false;
      return true;
    });

    // Use the new state-based calculation logic
    const breakData = calculateBreaksWithCount(filteredEntries);
    return {
      totalHours: breakData.totalHours,
      count: breakData.count
    };
  };

  const exportToExcel = () => {
    const data = filteredUsers.map(user => {
      const breaks = calculateBreaksForRange(user.attendanceLog || []);
      const workHours = calculateHoursForRange(user.attendanceLog || []);
      const workOnlyHours = workHours - breaks.totalHours;
      return {
        Name: user.name,
        'Secret Code': user.secretCode,
        'Hourly Rate': user.hourlyRate || 0,
        'Total Amount': Math.max(0, workOnlyHours * user.hourlyRate).toFixed(2),
        'Total Amount (Including Breaks)': (workHours * user.hourlyRate).toFixed(2),
        'Work Hours (Excluding Breaks)': workOnlyHours.toFixed(2),
        'Total Hours (Including Breaks)': workHours.toFixed(2),
        'Break Time': `${breaks.totalHours.toFixed(2)} hours`,
        'Number of Breaks': breaks.count
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, `attendance_report_${startDate}_to_${endDate}.xlsx`);
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Secret Code', 'Hourly Rate', 'Total Amount', 'Total Amount (Including Breaks)', 'Work Hours (Excluding Breaks)', 'Total Hours (Including Breaks)', 'Break Time', 'Number of Breaks'];
    const csvData = [
      headers.join(','),
      ...filteredUsers.map(user => {
        const breaks = calculateBreaksForRange(user.attendanceLog || []);
        const workHours = calculateHoursForRange(user.attendanceLog || []);
        const workOnlyHours = workHours - breaks.totalHours;
        return [
          user.name,
          user.secretCode,
          user.hourlyRate || 0,
          Math.max(0, workOnlyHours * user.hourlyRate).toFixed(2),
          (workHours * user.hourlyRate).toFixed(2),
          workOnlyHours.toFixed(2),
          workHours.toFixed(2),
          `${breaks.totalHours.toFixed(2)} hours`,
          breaks.count
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${startDate}_to_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('Attendance Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 36);
    
    // Prepare data for table
    const tableData = filteredUsers.map(user => {
      const breaks = calculateBreaksForRange(user.attendanceLog || []);
      const workHours = calculateHoursForRange(user.attendanceLog || []);
      const workOnlyHours = workHours - breaks.totalHours;
      return [
        user.name,
        user.secretCode,
        `£${user.hourlyRate || 0}/hr`,
        `£${Math.max(0, workOnlyHours * user.hourlyRate).toFixed(2)}`,
        `£${(workHours * user.hourlyRate).toFixed(2)}`,
        `${formatHoursAndMinutes(breaks.totalHours)} (${breaks.count})`
      ];
    });

    // Add table using autoTable
    autoTable(doc, {
      startY: 45,
      head: [['Name', 'Code', 'Rate', 'Amount', 'Amount (w/ Breaks)', 'Break Time']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    // Save the PDF
    doc.save(`attendance_report_${startDate}_to_${endDate}.pdf`);
  };



  const handleDeleteUser = (userId: string) => {
    setDeleteUserId(userId);
    setDeleteModalOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserId) return;
    setDeleteLoadingId(deleteUserId);
    try {
      await deleteUser(deleteUserId);
      setDeleteModalOpen(false);
      setDeleteUserId(null);
      loadUsers();
    } catch (error) {
      alert('Failed to delete user.');
      console.error('Error deleting user:', error);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleEditUser = (user: User) => {
    setEditUser(user);
    setEditModalOpen(true);
    setEditError('');
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    if (!editUser.name.trim() || !editUser.secretCode.trim()) {
      setEditError('Please fill in all required fields');
      return;
    }
    if (editUser.secretCode.length !== 8) {
      setEditError('Secret code must be exactly 8 digits');
      return;
    }
    setEditLoading(true);
    setEditError('');
    try {
      await updateUser(editUser.id, {
        name: editUser.name.trim(),
        secretCode: editUser.secretCode.trim(),
        hourlyRate: editUser.hourlyRate
      });
      setEditModalOpen(false);
      setEditUser(null);
      loadUsers();
    } catch (error) {
      setEditError('Failed to update user. Please try again.');
      console.error('Error updating user:', error);
    } finally {
      setEditLoading(false);
    }
  };

  // Add a utility function to format hours as 'X hours Y minutes'
  function formatHoursAndMinutes(decimalHours: number): string {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours} hours ${minutes} minutes`;
  }

  // Add manual refresh handler
  const handleManualRefresh = () => {
    loadUsers();
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
              User Management
            </h2>
            <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              View and manage all users' attendance records and earnings.
            </p>
          </div>
          <motion.button
            onClick={() => setIsAddUserModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <UserPlus size={16} />
            <span>Add User</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
          <div className="flex-1 flex flex-col md:flex-row md:items-end gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'} w-5 h-5`} />
              <input
                type="text"
                placeholder="Search by name or secret code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                    : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
                }`}
              />
            </div>

            {/* Date Range Filter */}
            <div className="flex items-center space-x-2">
              <Filter className={`${isDarkMode ? 'text-slate-400' : 'text-slate-400'} w-5 h-5`} />
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`border rounded-md px-3 py-2 focus:ring-2 focus:border-transparent text-sm ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                      : 'border-slate-300 text-slate-800 focus:ring-blue-500'
                  }`}
                />
                <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`border rounded-md px-3 py-2 focus:ring-2 focus:border-transparent text-sm ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                      : 'border-slate-300 text-slate-800 focus:ring-blue-500'
                  }`}
                />
              </div>
            </div>
          </div>
          <div className="flex space-x-2 items-center mt-4 md:mt-0">
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
      </motion.div>

      {/* Users Table */}
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
                  Name
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Secret Code
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Hourly Rate
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Total Amount
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Total Amount (Including Breaks)
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Break Time (Info)
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Hours (Date Range)
                </th>
                <th className={`px-6 py-3 text-right text-xs font-medium uppercase tracking-wider ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y divide-slate-200`}>
              {filteredUsers.map((user, index) => {
                const isEmptyMonth = (user.monthAttendance || []).length === 0;
                const highlight = isEmptyMonth;
                return (
                  <motion.tr 
                    key={user.id} 
                    className={`transition-colors ${highlight ? (isDarkMode ? 'bg-yellow-900/30' : 'bg-yellow-100/80') : (isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50')}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}> 
                      {user.name}
                      {highlight && (
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${isDarkMode ? 'bg-yellow-700 text-yellow-200' : 'bg-yellow-200 text-yellow-800'}`}>No Data This Month</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                      {user.secretCode}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      £{user.hourlyRate || 0}/hr
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                      {(() => {
                        const workHours = calculateHoursForRange(user.attendanceLog || []);
                        const breaks = calculateBreaksForRange(user.attendanceLog || []);
                        const workOnlyHours = workHours - breaks.totalHours;
                        const earnings = workOnlyHours * user.hourlyRate;
                        // Show 0 instead of negative values until earnings become positive
                        return `£${Math.max(0, earnings).toFixed(2)}`;
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                      {(() => {
                        const workHours = calculateHoursForRange(user.attendanceLog || []);
                        return `£${(workHours * user.hourlyRate).toFixed(2)}`;
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                      {(() => {
                        const breaks = calculateBreaksForRange(user.attendanceLog || []);
                        return `${formatHoursAndMinutes(breaks.totalHours)} (${breaks.count} breaks)`;
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>{formatHoursAndMinutes(calculateHoursForRange(user.attendanceLog || []))}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className={`p-1 ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} transition-colors`}
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className={`p-1 ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} transition-colors`}
                        disabled={deleteLoadingId === user.id}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {users.length === 0 ? 'No users found. Add your first user using the "Add User" button above.' : 'No users found matching your criteria.'}
            </p>
          </div>
        )}
      </motion.div>

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onUserAdded={handleUserAdded}
      />

      {/* Edit User Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditUser(null); }}
        title="Edit User"
        size="md"
      >
        {editUser && (
          <form onSubmit={e => { e.preventDefault(); handleEditSave(); }} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                Full Name *
              </label>
              <input
                type="text"
                value={editUser.name}
                onChange={e => setEditUser({ ...editUser, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20' : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'}`}
                placeholder="Enter full name"
                required
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                Secret Code *
              </label>
              <input
                type="text"
                value={editUser.secretCode}
                onChange={e => setEditUser({ ...editUser, secretCode: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20' : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'}`}
                placeholder="8-digit code"
                maxLength={8}
                required
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                Hourly Rate (£)
              </label>
              <input
                type="number"
                value={editUser.hourlyRate}
                onChange={e => setEditUser({ ...editUser, hourlyRate: Number(e.target.value) })}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20' : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'}`}
                placeholder="15.00"
                min="0"
                step="0.01"
                required
              />
            </div>
            {editError && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`p-3 rounded-md ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'}`}>{editError}</motion.div>
            )}
            <div className="flex justify-end space-x-3 pt-4">
              <motion.button
                type="button"
                onClick={() => { setEditModalOpen(false); setEditUser(null); }}
                className={`px-4 py-2 border rounded-md transition-colors ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                disabled={editLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {editLoading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : null}
                <span>Save</span>
              </motion.button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteUserId(null); }}
        title="Confirm Delete"
        size="sm"
      >
        <div className="space-y-4">
          <p>Are you sure you want to delete this user? This action cannot be undone.</p>
          <div className="flex justify-end space-x-3 pt-2">
            <motion.button
              type="button"
              onClick={() => { setDeleteModalOpen(false); setDeleteUserId(null); }}
              className={`px-4 py-2 border rounded-md transition-colors ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              onClick={confirmDeleteUser}
              disabled={deleteLoadingId === deleteUserId}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {deleteLoadingId === deleteUserId ? 'Deleting...' : 'Delete'}
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminMain; 