import React, { useState } from 'react';
import { Key, Clock, CheckCircle, Moon, Sun } from 'lucide-react';
import { getUserBySecretCode, updateUserAttendance, createAttendanceRecord } from '../services/firestore';
import { calculateHoursWorked, formatDate, formatTime } from '../utils/timeCalculations';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';

type CodeEntryProps = object;

// Utility to convert Firestore Timestamp, Date, or string to JS Date
function toJSDate(ts: unknown): Date {
  if (ts instanceof Date) return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  return new Date(ts as string);
}

const CodeEntry: React.FC<CodeEntryProps> = () => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    setMessage('');

    try {
      // First, check if code matches admin's secretCode
      const adminRef = doc(db, 'users', 'admin');
      const adminSnap = await getDoc(adminRef);
      if (adminSnap.exists()) {
        const adminData = adminSnap.data();
        if (code === adminData.secretCode) {
          sessionStorage.setItem('isAdmin', 'true');
          navigate('/admin');
          setCode('');
          setIsLoading(false);
          return;
        }
      }

      // Always fetch the latest user data before each punch
      let user = await getUserBySecretCode(code);
      if (!user) {
        setMessage('Invalid code. Please try again.');
        setMessageType('error');
        setCode('');
        setIsLoading(false);
        return;
      }

      const now = new Date();
      // Filter today's entries
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEntries = (user.attendanceLog || []).filter(entry => {
        const entryDate = toJSDate(entry.timestamp);
        return (
          entryDate.getFullYear() === today.getFullYear() &&
          entryDate.getMonth() === today.getMonth() &&
          entryDate.getDate() === today.getDate()
        );
      });
      let lastPunchTypeToday: 'IN' | 'OUT' | null = null;
      if (todayEntries.length > 0) {
        lastPunchTypeToday = todayEntries[todayEntries.length - 1].type;
      }
      const punchType = lastPunchTypeToday === 'IN' ? 'OUT' : 'IN';

      // Prevent double IN or double OUT
      if (lastPunchTypeToday === punchType) {
        setMessage(`You have already punched ${punchType} today. Please punch the other type first.`);
        setMessageType('error');
        setIsLoading(false);
        setCode('');
        return;
      }

      let amountEarned = 0;
      let newTotalAmount = user.amount;

      // If punching out, calculate hours and amount
      if (punchType === 'OUT') {
        const hoursWorked = calculateHoursWorked([
          ...user.attendanceLog,
          { timestamp: now, type: 'OUT' }
        ]);
        amountEarned = hoursWorked * user.hourlyRate;
        newTotalAmount = user.amount + amountEarned;
      }

      // Update user attendance
      await updateUserAttendance(
        user.id,
        { timestamp: now, type: punchType },
        punchType === 'OUT' ? newTotalAmount : undefined
      );

      // Fetch the latest user data after updating attendance
      user = await getUserBySecretCode(code);
      if (!user) {
        setMessage('Error fetching updated user data. Please try again.');
        setMessageType('error');
        setIsLoading(false);
        setCode('');
        return;
      }

      // Create attendance record
      await createAttendanceRecord({
        userId: user.id,
        name: user.name,
        timestamp: now,
        type: punchType,
        hourlyRate: user.hourlyRate,
        amountEarned: punchType === 'OUT' ? amountEarned : undefined,
        date: formatDate(now)
      });

      setMessage(
        `${user.name} - ${punchType === 'IN' ? 'Punched IN' : 'Punched OUT'} at ${formatTime(now)}${
          punchType === 'OUT' ? ` | Earned: $${amountEarned.toFixed(2)}` : ''
        }`
      );
      setMessageType('success');
      setCode('');
    } catch (error) {
      setMessage('Error processing punch. Please try again.');
      setMessageType('error');
      console.error('Error:', error);
    }

    setIsLoading(false);
  };

  const handleNumberClick = (num: string) => {
    if (code.length < 8) {
      setCode(code + num);
    }
  };

  const handleClear = () => {
    setCode('');
    setMessage('');
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'} flex items-center justify-center p-4`}>
      {/* Theme Toggle Button */}
      <motion.button
        onClick={toggleDarkMode}
        className={`absolute top-4 right-4 p-3 rounded-full transition-colors ${
          isDarkMode 
            ? 'text-slate-300 hover:text-yellow-400 hover:bg-slate-800' 
            : 'text-slate-600 hover:text-yellow-600 hover:bg-white/80'
        }`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Toggle theme"
      >
        {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
      </motion.button>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-2xl shadow-2xl p-8 w-full max-w-md mx-auto border`}
      >
        <div className="text-center mb-8">
          <motion.div 
            className={`${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100'} rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center`}
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Clock className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'} w-10 h-10`} />
          </motion.div>
          <motion.h1 
            className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'} mb-2`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Attendance System
          </motion.h1>
          <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Enter your code to punch in/out
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter secret code"
              className={`w-full px-6 py-4 text-2xl text-center border-2 rounded-xl focus:ring-2 outline-none transition-all ${
                isDarkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400/20'
                  : 'border-slate-200 text-slate-800 placeholder-slate-500 focus:border-blue-500 focus:ring-blue-200'
              }`}
              maxLength={8}
              disabled={isLoading}
            />
            <Key className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'} w-6 h-6`} />
          </div>

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

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <motion.button
                key={num}
                type="button"
                onClick={() => handleNumberClick(num.toString())}
                className={`${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'} font-semibold py-4 px-6 rounded-xl text-xl transition-colors`}
                disabled={isLoading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {num}
              </motion.button>
            ))}
            <motion.button
              type="button"
              onClick={handleClear}
              className={`${isDarkMode ? 'bg-red-900/50 hover:bg-red-800/50 text-red-300' : 'bg-red-100 hover:bg-red-200 text-red-800'} font-semibold py-4 px-6 rounded-xl transition-colors`}
              disabled={isLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Clear
            </motion.button>
            <motion.button
              type="button"
              onClick={() => handleNumberClick('0')}
              className={`${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'} font-semibold py-4 px-6 rounded-xl text-xl transition-colors`}
              disabled={isLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              0
            </motion.button>
            <motion.button
              type="submit"
              disabled={isLoading || !code}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isLoading ? '...' : 'Enter'}
            </motion.button>
          </div>
        </form>

        <div className="mt-8 text-center">
          <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Touch a number to enter your code, then press Enter
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default CodeEntry;