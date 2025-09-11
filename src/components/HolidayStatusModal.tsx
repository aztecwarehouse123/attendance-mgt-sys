import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { getHolidayRequestsBySecretCode } from '../services/firestore';
import { HolidayRequest } from '../types';
import { format } from 'date-fns';

interface HolidayStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HolidayStatusModal: React.FC<HolidayStatusModalProps> = ({
  isOpen,
  onClose
}) => {
  const { isDarkMode } = useTheme();
  const [secretCode, setSecretCode] = useState('');
  const [requests, setRequests] = useState<HolidayRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!secretCode.trim()) {
      setError('Please enter your secret code');
      return;
    }
    if (secretCode.length !== 8) {
      setError('Secret code must be exactly 8 digits');
      return;
    }

    setIsLoading(true);
    setError('');
    setHasSearched(true);

    try {
      const userRequests = await getHolidayRequestsBySecretCode(secretCode);
      setRequests(userRequests);
    } catch (error) {
      console.error('Error fetching holiday requests:', error);
      setError('Failed to fetch holiday requests. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSecretCode('');
    setRequests([]);
    setError('');
    setHasSearched(false);
    onClose();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} rounded-lg shadow-xl w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Check Holiday Request Status
            </h2>
            <button
              onClick={handleClose}
              className={`text-2xl ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              ×
            </button>
          </div>

          <div className="mb-6">
            <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
              Secret Code
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                placeholder="Enter your 8-digit secret code"
                maxLength={8}
                className={`flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                    : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
                }`}
              />
              <motion.button
                onClick={handleSearch}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLoading ? 'Searching...' : 'Search'}
              </motion.button>
            </div>
            
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-md mb-4 ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'}`}
            >
              {error}
            </motion.div>
          )}

          {hasSearched && !isLoading && (
            <div>
              {requests.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No holiday requests found for this secret code.
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Your Latest Holiday Request
                  </h3>
                  {(() => {
                    // Get the most recent request (first one since they're sorted by submittedAt desc)
                    const latestRequest = requests[0];
                    return (
                      <motion.div
                        key={latestRequest.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-lg border ${
                          isDarkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                              {format(new Date(latestRequest.startDate), 'MMM dd, yyyy')} - {format(new Date(latestRequest.endDate), 'MMM dd, yyyy')}
                            </div>
                            <div className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Submitted: {format(latestRequest.submittedAt, 'MMM dd, yyyy HH:mm')}
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(latestRequest.status)}`}>
                            {latestRequest.status.toUpperCase()}
                          </span>
                        </div>
                        
                        <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                          <strong>Reason:</strong> {latestRequest.reason}
                        </div>

                        {latestRequest.adminNotes && (
                          <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                            <strong>Admin Notes:</strong> {latestRequest.adminNotes}
                          </div>
                        )}

                        {latestRequest.reviewedAt && (
                          <div className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Reviewed: {format(latestRequest.reviewedAt, 'MMM dd, yyyy HH:mm')}
                            {latestRequest.reviewedBy && ` by ${latestRequest.reviewedBy}`}
                          </div>
                        )}
                      </motion.div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default HolidayStatusModal;
