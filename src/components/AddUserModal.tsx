import React, { useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { createUser } from '../services/firestore';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';
import Modal from './Modal';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded: () => void;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded }) => {
  const [name, setName] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [hourlyRate, setHourlyRate] = useState('15');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { isDarkMode } = useTheme();

  const generateSecretCode = () => {
    // Generate a random 8-digit code
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    setSecretCode(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !secretCode.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (secretCode.length !== 8) {
      setError('Secret code must be exactly 8 digits');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await createUser({
        name: name.trim(),
        secretCode: secretCode.trim(),
        hourlyRate: parseFloat(hourlyRate),
        amount: 0,
        attendanceLog: []
      });

      // Reset form
      setName('');
      setSecretCode('');
      setHourlyRate('15');
      
      onUserAdded();
      onClose();
    } catch (error) {
      console.error('Error creating user:', error);
      setError('Failed to create user. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setSecretCode('');
    setHourlyRate('15');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New User"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
            Full Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
              isDarkMode
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
            }`}
            placeholder="Enter full name"
            required
          />
        </div>

        <div>
          <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
            Secret Code *
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value)}
              className={`flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
              }`}
              placeholder="8-digit code"
              maxLength={8}
              required
            />
            <motion.button
              type="button"
              onClick={generateSecretCode}
              className={`px-3 py-2 border rounded-md transition-colors ${
                isDarkMode
                  ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus size={16} />
            </motion.button>
          </div>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Click the + button to generate a random 8-digit code
          </p>
        </div>

        <div>
          <label className={`block text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
            Hourly Rate (£)
          </label>
          <input
            type="number"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
              isDarkMode
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20'
                : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'
            }`}
            placeholder="15.00 (GBP)"
            min="0"
            step="0.01"
            required
          />
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-md ${
              isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'
            }`}
          >
            {error}
          </motion.div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <motion.button
            type="button"
            onClick={handleClose}
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
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Creating...</span>
              </>
            ) : (
              <>
                <UserPlus size={16} />
                <span>Add User</span>
              </>
            )}
          </motion.button>
        </div>
      </form>
    </Modal>
  );
};

export default AddUserModal; 