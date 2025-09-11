import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';
import { getAllHolidayRequests, updateHolidayRequestStatus } from '../../services/firestore';
import { HolidayRequest } from '../../types';
import { format } from 'date-fns';
import { Check, X, RotateCw, Calendar, User, Clock } from 'lucide-react';

const AdminHolidayRequests: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [requests, setRequests] = useState<HolidayRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<HolidayRequest | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [userFilter, setUserFilter] = useState<string>('all');
  // Set default date range to first day of current month to today
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [dateRangeFilter, setDateRangeFilter] = useState<{
    startDate: string;
    endDate: string;
  }>({
    startDate: firstDayOfMonth.getFullYear() + '-' + 
      String(firstDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + 
      String(firstDayOfMonth.getDate()).padStart(2, '0'),
    endDate: today.getFullYear() + '-' + 
      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
      String(today.getDate()).padStart(2, '0')
  });

  const loadRequests = async () => {
    try {
      const allRequests = await getAllHolidayRequests();
      setRequests(allRequests);
    } catch (error) {
      console.error('Error loading holiday requests:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadRequests();
  };

  const handleAction = (request: HolidayRequest, type: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(type);
    setAdminNotes('');
    setShowActionModal(true);
  };

  const handleProcessAction = async () => {
    if (!selectedRequest || !actionType) return;

    setIsProcessing(true);
    try {
      await updateHolidayRequestStatus(
        selectedRequest.id,
        actionType === 'approve' ? 'approved' : 'rejected',
        'Admin', // In a real app, you'd get this from auth context
        adminNotes || undefined
      );
      
      // Refresh the requests list
      await loadRequests();
      
      setShowActionModal(false);
      setSelectedRequest(null);
      setActionType(null);
      setAdminNotes('');
    } catch (error) {
      console.error('Error processing holiday request:', error);
      alert('Failed to process request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };


  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return isDarkMode ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800';
      case 'rejected':
        return isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800';
      default:
        return isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-800';
    }
  };

  // Get unique users for filter dropdown
  const uniqueUsers = Array.from(new Set(requests.map(request => request.userName))).sort();

  // Filter requests based on status, user, and date range
  const filteredRequests = requests.filter(request => {
    // Status filter
    if (statusFilter !== 'all' && request.status !== statusFilter) {
      return false;
    }

    // User filter
    if (userFilter !== 'all' && request.userName !== userFilter) {
      return false;
    }

    // Date range filter
    if (dateRangeFilter.startDate || dateRangeFilter.endDate) {
      // Handle both Date objects and Firestore Timestamps
      const requestDate = request.submittedAt instanceof Date 
        ? request.submittedAt 
        : new Date((request.submittedAt as { seconds: number }).seconds * 1000);
      
      // Create date objects for comparison (set time to start/end of day)
      const startDate = dateRangeFilter.startDate ? new Date(dateRangeFilter.startDate + 'T00:00:00') : null;
      const endDate = dateRangeFilter.endDate ? new Date(dateRangeFilter.endDate + 'T23:59:59') : null;

      // Normalize dates to local timezone for comparison
      const requestDateOnly = new Date(requestDate.getFullYear(), requestDate.getMonth(), requestDate.getDate());
      const startDateOnly = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
      const endDateOnly = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null;

      if (startDateOnly && requestDateOnly < startDateOnly) {
        return false;
      }
      if (endDateOnly && requestDateOnly > endDateOnly) {
        return false;
      }
    }

    return true;
  });

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
              Holiday Requests
            </h2>
            <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Review and manage employee holiday requests.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* Status Filter */}
            <div className="flex flex-col">
              <label className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                className={`px-3 py-2 border rounded-md text-sm ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'border-slate-300 text-slate-800'
                }`}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All Requests</option>
              </select>
            </div>

            {/* User Filter */}
            <div className="flex flex-col">
              <label className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                User
              </label>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className={`px-3 py-2 border rounded-md text-sm ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'border-slate-300 text-slate-800'
                }`}
              >
                <option value="all">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>

            {/* Date Range Filter */}
            <div className="flex flex-col">
              <label className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                From Date
              </label>
              <input
                type="date"
                value={dateRangeFilter.startDate}
                onChange={(e) => setDateRangeFilter(prev => ({ ...prev, startDate: e.target.value }))}
                className={`px-3 py-2 border rounded-md text-sm ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'border-slate-300 text-slate-800'
                }`}
              />
            </div>

            <div className="flex flex-col">
              <label className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                To Date
              </label>
              <input
                type="date"
                value={dateRangeFilter.endDate}
                onChange={(e) => setDateRangeFilter(prev => ({ ...prev, endDate: e.target.value }))}
                className={`px-3 py-2 border rounded-md text-sm ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'border-slate-300 text-slate-800'
                }`}
              />
            </div>

            {/* Clear Filters Button */}
            <div className="flex flex-col">
              <label className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                &nbsp;
              </label>
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setUserFilter('all');
                  setDateRangeFilter({
                    startDate: firstDayOfMonth.getFullYear() + '-' + 
                      String(firstDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(firstDayOfMonth.getDate()).padStart(2, '0'),
                    endDate: today.getFullYear() + '-' + 
                      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(today.getDate()).padStart(2, '0')
                  });
                }}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  isDarkMode
                    ? 'bg-slate-600 text-white hover:bg-slate-500'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Clear Filters
              </button>
            </div>
            <motion.button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`p-2 rounded-full border border-transparent hover:border-blue-400 transition-colors ${
                isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <RotateCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
        >
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 ${isDarkMode ? 'bg-yellow-900/50' : 'bg-yellow-100'} rounded-full flex items-center justify-center`}>
                <Clock className={`${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'} w-4 h-4`} />
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pending Requests</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {requests.filter(r => r.status === 'pending').length}
              </p>
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
                <Check className={`${isDarkMode ? 'text-green-400' : 'text-green-600'} w-4 h-4`} />
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Approved</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {requests.filter(r => r.status === 'approved').length}
              </p>
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
              <div className={`w-8 h-8 ${isDarkMode ? 'bg-red-900/50' : 'bg-red-100'} rounded-full flex items-center justify-center`}>
                <X className={`${isDarkMode ? 'text-red-400' : 'text-red-600'} w-4 h-4`} />
              </div>
            </div>
            <div className="ml-4">
              <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Rejected</p>
              <p className={`text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {requests.filter(r => r.status === 'rejected').length}
              </p>
            </div>
          </div>
        </motion.div>
      </div>


      {/* Requests List */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow overflow-hidden border`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className={`${isDarkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-48 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                  Employee
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-40 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                  Date Range
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-80 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                  Reason
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-24 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                  Status
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-32 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                  Submitted
                </th>
                <th className={`px-6 py-3 text-right text-xs font-medium uppercase tracking-wider w-24 ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y divide-slate-200`}>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`text-center py-12 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {statusFilter === 'all' 
                      ? 'No holiday requests found.' 
                      : `No ${statusFilter} holiday requests found.`
                    }
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request, index) => (
                  <motion.tr 
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 ${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100'} rounded-full flex items-center justify-center mr-3`}>
                          <User className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'} w-4 h-4`} />
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            {request.userName}
                          </div>
                          <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {request.secretCode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Calendar className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'} w-4 h-4 mr-2`} />
                        <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {format(new Date(request.startDate), 'MMM dd, yyyy')} - {format(new Date(request.endDate), 'MMM dd, yyyy')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 w-80">
                      <div 
                        className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}
                        title={request.reason}
                        style={{ 
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word',
                          whiteSpace: 'normal',
                          maxWidth: '320px'
                        }}
                      >
                        {request.reason}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(request.status)}`}>
                        {request.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {format(request.submittedAt, 'MMM dd, yyyy HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {request.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <motion.button
                            onClick={() => handleAction(request, 'approve')}
                            className={`p-2 ${isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'} transition-colors`}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Approve"
                          >
                            <Check size={16} />
                          </motion.button>
                          <motion.button
                            onClick={() => handleAction(request, 'reject')}
                            className={`p-2 ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} transition-colors`}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Reject"
                          >
                            <X size={16} />
                          </motion.button>
                        </div>
                      ) : (
                        <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {request.reviewedAt && (
                            <div>
                              {format(request.reviewedAt, 'MMM dd, yyyy')}
                              {request.reviewedBy && ` by ${request.reviewedBy}`}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Action Modal */}
      {showActionModal && selectedRequest && actionType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-lg shadow-xl max-w-md w-full`}
          >
            <div className="p-6">
              <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-4`}>
                {actionType === 'approve' ? 'Approve' : 'Reject'} Holiday Request
              </h3>
              
              <div className="mb-4">
                <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  <strong>Employee:</strong> {selectedRequest.userName}
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  <strong>Date Range:</strong> {format(new Date(selectedRequest.startDate), 'MMM dd, yyyy')} - {format(new Date(selectedRequest.endDate), 'MMM dd, yyyy')}
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-4`}>
                  <strong>Reason:</strong> {selectedRequest.reason}
                </div>
              </div>

              <div className="mb-4">
                <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  Admin Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder={`Add notes for ${actionType === 'approve' ? 'approval' : 'rejection'}...`}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent resize-none ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                      : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
                  }`}
                />
              </div>

              <div className="flex justify-end space-x-3">
                <motion.button
                  onClick={() => {
                    setShowActionModal(false);
                    setSelectedRequest(null);
                    setActionType(null);
                    setAdminNotes('');
                  }}
                  className={`px-4 py-2 border rounded-md transition-colors ${
                    isDarkMode
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleProcessAction}
                  disabled={isProcessing}
                  className={`px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 ${
                    actionType === 'approve'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isProcessing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : null}
                  <span>{isProcessing ? 'Processing...' : `${actionType === 'approve' ? 'Approve' : 'Reject'} Request`}</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AdminHolidayRequests;
