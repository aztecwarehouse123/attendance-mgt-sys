import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { createHolidayRequest, getUserBySecretCode } from '../services/firestore';
import { HolidayRequest } from '../types';

interface HolidayRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const HolidayRequestModal: React.FC<HolidayRequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { isDarkMode } = useTheme();
  const [formData, setFormData] = useState({
    secretCode: '',
    startDate: '',
    endDate: '',
    reason: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.secretCode.trim()) {
      setError('Secret code is required');
      return false;
    }
    if (formData.secretCode.length !== 8) {
      setError('Secret code must be exactly 8 digits');
      return false;
    }
    if (!formData.startDate) {
      setError('Start date is required');
      return false;
    }
    if (!formData.endDate) {
      setError('End date is required');
      return false;
    }
    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      setError('Start date cannot be after end date');
      return false;
    }
    if (!formData.reason.trim()) {
      setError('Reason is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError('');

    try {
      // First, fetch the user data to get userId and userName
      const user = await getUserBySecretCode(formData.secretCode);
      if (!user) {
        setError('Invalid secret code. Please check your code and try again.');
        setIsSubmitting(false);
        return;
      }

      // Create the request with proper user data
      const requestData: Omit<HolidayRequest, 'id' | 'submittedAt'> = {
        userId: user.id,
        userName: user.name,
        secretCode: formData.secretCode,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        status: 'pending'
      };

      await createHolidayRequest(requestData);
      
      // Reset form
      setFormData({
        secretCode: '',
        startDate: '',
        endDate: '',
        reason: ''
      });
      
      onSuccess('Holiday request submitted successfully! Status: Pending');
      onClose();
    } catch (error) {
      console.error('Error submitting holiday request:', error);
      setError('Failed to submit holiday request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      secretCode: '',
      startDate: '',
      endDate: '',
      reason: ''
    });
    setError('');
    onClose();
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
          <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-4`}>
            Request Holiday
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                Secret Code *
              </label>
              <input
                type="text"
                name="secretCode"
                value={formData.secretCode}
                onChange={handleInputChange}
                placeholder="Enter your 8-digit secret code"
                maxLength={8}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                    : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
                }`}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  Start Date *
                </label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                      : 'border-slate-300 text-slate-800 focus:ring-blue-500'
                  }`}
                  required
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  End Date *
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                    isDarkMode
                      ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                      : 'border-slate-300 text-slate-800 focus:ring-blue-500'
                  }`}
                  required
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                Reason *
              </label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                placeholder="Please provide a reason for your holiday request"
                rows={3}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent resize-none ${
                  isDarkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                    : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
                }`}
                required
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-md ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'}`}
              >
                {error}
              </motion.div>
            )}

            <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
              <motion.button
                type="button"
                onClick={handleCancel}
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
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : null}
                <span>{isSubmitting ? 'Submitting...' : 'Send Request'}</span>
              </motion.button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default HolidayRequestModal;
