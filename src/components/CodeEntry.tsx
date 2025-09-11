import React, { useState, useEffect } from 'react';
import { Key, Clock, CheckCircle, Moon, Sun, Calendar, Search } from 'lucide-react';
import { getUserBySecretCode, updateUserAttendance, createAttendanceRecord } from '../services/firestore';
import { formatDate, formatTime } from '../utils/timeCalculations';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import HolidayRequestModal from './HolidayRequestModal';
import HolidayStatusModal from './HolidayStatusModal';
import { User, AttendanceEntry } from '../types';

type CodeEntryProps = object;



const CodeEntry: React.FC<CodeEntryProps> = () => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const { isDarkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotOutTime, setForgotOutTime] = useState('');
  const [forgotOutDate, setForgotOutDate] = useState<Date | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [pendingNow, setPendingNow] = useState<Date | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userState, setUserState] = useState<{
    lastPunchType: 'IN' | 'OUT' | null;
    isPunchedIn: boolean;
    isOnBreak: boolean;
    canPunchIn: boolean;
    canPunchOut: boolean;
    canStartBreak: boolean;
    canEndBreak: boolean;
  } | null>(null);
  const [showHolidayRequestModal, setShowHolidayRequestModal] = useState(false);
  const [showHolidayStatusModal, setShowHolidayStatusModal] = useState(false);

  // Auto-hide success message after 5 seconds
  useEffect(() => {
    if (messageType === 'success' && message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('info');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [messageType, message]);


  // Helper toJSDate
  function toJSDate(ts: unknown): Date {
    if (ts instanceof Date) return ts;
    if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate();
    }
    return new Date(ts as string);
  }

  // Helper to get current user state for validation
  function getUserState(user: User) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEntries = (user.attendanceLog || []).filter((entry: AttendanceEntry) => {
      const entryDate = toJSDate(entry.timestamp);
      return (
        entryDate.getFullYear() === today.getFullYear() &&
        entryDate.getMonth() === today.getMonth() &&
        entryDate.getDate() === today.getDate()
      );
    });

    if (todayEntries.length === 0) {
      return {
        lastPunchType: null,
        isPunchedIn: false,
        isOnBreak: false,
        canPunchIn: true,
        canPunchOut: false,
        canStartBreak: false,
        canEndBreak: false
      };
    }

    const lastPunchType = todayEntries[todayEntries.length - 1].type;
    const isPunchedIn = lastPunchType === 'IN';
    
    // Determine if user is on break by analyzing the sequence
    let isOnBreak = false;
    
    if (!isPunchedIn && todayEntries.length > 0) {

      
      // Logic: determine if user is on break vs done for the day
      // Pattern: IN(1) -> OUT(2) -> IN(3) -> OUT(4) -> IN(5) -> OUT(6)...
      // If even number of entries ending with OUT → user is on break (positions 2, 6, 10...)
      // If entries divisible by 4 ending with OUT → user is done for day (positions 4, 8, 12...)
      const entryCount = todayEntries.length;
      
      if (entryCount % 4 === 2) {
        isOnBreak = true; // Positions 2, 6, 10... = on break
      } else if (entryCount % 4 === 0) {
        isOnBreak = false; // Positions 4, 8, 12... = done for day
      } else {
        isOnBreak = false; // Shouldn't happen with OUT as last entry
      }
    }

    return {
      lastPunchType,
      isPunchedIn,
      isOnBreak,
      canPunchIn: !isPunchedIn && !isOnBreak, // Can punch in if not working and not on break
      canPunchOut: isPunchedIn, // Can punch out if currently working
      canStartBreak: isPunchedIn, // Can only start break if currently working
      canEndBreak: isOnBreak // Can end break only if currently on break
    };
  }

  // Helper to get yesterday's last punch
  function getForgottenPunchOut(user: User) {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayEntries = (user.attendanceLog || []).filter((entry: AttendanceEntry) => {
      const entryDate = toJSDate(entry.timestamp);
      return (
        entryDate.getFullYear() === yesterday.getFullYear() &&
        entryDate.getMonth() === yesterday.getMonth() &&
        entryDate.getDate() === yesterday.getDate()
      );
    });
    if (yesterdayEntries.length > 0) {
      const last = yesterdayEntries[yesterdayEntries.length - 1];
      if (last.type === 'IN') {
        return { lastIn: last, entries: yesterdayEntries, date: yesterday };
      }
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent, breakAction?: 'break-in' | 'break-out') => {
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

      // Check for forgotten punch out yesterday
      const forgot = getForgottenPunchOut(user);
      if (forgot) {
        setShowForgotModal(true);
        setForgotOutDate(forgot.date);
        setPendingUser(user);
        setPendingNow(new Date());
        setIsLoading(false);
        return;
      }

      const now = new Date();
      
      // Get current user state for validation
      const userState = getUserState(user);
      
      // Validate break actions
      if (breakAction === 'break-in' && !userState.canStartBreak) {
        setMessage('You must be punched in to start a break.');
        setMessageType('error');
        setIsLoading(false);
        setCode('');
        return;
      }
      
      if (breakAction === 'break-out' && !userState.canEndBreak) {
        setMessage('You must be on a break to end break. Start a break first.');
        setMessageType('error');
        setIsLoading(false);
        setCode('');
        return;
      }
      
      // Validate regular punch actions
      if (!breakAction && !userState.canPunchIn && !userState.canPunchOut) {
        setMessage('Invalid punch state. Please contact administrator.');
        setMessageType('error');
        setIsLoading(false);
        setCode('');
        return;
      }
      
      if (!breakAction && userState.isOnBreak) {
        setMessage('You are currently on a break. Please end your break before punching in/out.');
        setMessageType('error');
        setIsLoading(false);
        setCode('');
        return;
      }

      // Filter today's entries
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEntries = (user.attendanceLog || []).filter((entry: AttendanceEntry) => {
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

      // Additional validation for regular punches (non-break actions)
      if (!breakAction && lastPunchTypeToday === punchType) {
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
        // Find the last IN today
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEntries = (user.attendanceLog || []).filter((entry: AttendanceEntry) => {
          const entryDate = toJSDate(entry.timestamp);
          return (
            entryDate.getFullYear() === today.getFullYear() &&
            entryDate.getMonth() === today.getMonth() &&
            entryDate.getDate() === today.getDate()
          );
        });
        let lastInTime = null;
        for (let i = todayEntries.length - 1; i >= 0; i--) {
          if (todayEntries[i].type === 'IN') {
            lastInTime = toJSDate(todayEntries[i].timestamp);
            break;
          }
        }
        if (lastInTime) {
          const minutesWorked = (now.getTime() - lastInTime.getTime()) / (1000 * 60);
          amountEarned = (minutesWorked / 60) * user.hourlyRate;
        } else {
          amountEarned = 0;
        }
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
        ...(punchType === 'OUT' && { amountEarned }),
        date: formatDate(now)
      });



      // Determine the message based on break action or regular punch
      let actionMessage = '';
      if (breakAction === 'break-in') {
        actionMessage = 'Started Break';
      } else if (breakAction === 'break-out') {
        actionMessage = 'Ended Break';
      } else {
        actionMessage = punchType === 'IN' ? 'Punched IN' : 'Punched OUT';
      }

      setMessage(
        `${user.name} - ${actionMessage} at ${formatTime(now)}${
          punchType === 'OUT' && !breakAction ? `` : ''
        }`
      );
      setMessageType('success');
      setCode('');
      
      // Reset user state after successful action
      setCurrentUser(null);
      setUserState(null);
    } catch (error) {
      setMessage('Error processing punch. Please try again.');
      setMessageType('error');
      console.error('Error:', error);
    }

    setIsLoading(false);
  };

  // Handler for modal submit
  const handleForgotOutSubmit = async () => {
    if (!pendingUser || !forgotOutTime || !forgotOutDate) return;
    setIsLoading(true);
    // Compose punch out datetime for yesterday
    const [h, m] = forgotOutTime.split(':');
    const punchOutDate = new Date(forgotOutDate);
    punchOutDate.setHours(Number(h), Number(m), 0, 0);
    // Add OUT entry for yesterday
    await updateUserAttendance(
      pendingUser.id,
      { timestamp: punchOutDate, type: 'OUT' }
    );
    // After fixing, punch in for today
    const now = pendingNow || new Date();
    await updateUserAttendance(
      pendingUser.id,
      { timestamp: now, type: 'IN' }
    );
    await createAttendanceRecord({
      userId: pendingUser.id,
      name: pendingUser.name,
      timestamp: now,
      type: 'IN',
      hourlyRate: pendingUser.hourlyRate,
      date: formatDate(now)
    });
    setMessage(`${pendingUser.name} - Punched IN at ${formatTime(now)}`);
    setMessageType('success');
    setCode('');
    setShowForgotModal(false);
    setIsLoading(false);
  };

  const handleNumberClick = (num: string) => {
    if (code.length < 8) {
      const newCode = code + num;
      setCode(newCode);
      // Update user state when code changes via keypad
      if (newCode.length >= 4) {
        updateUserState(newCode);
      } else {
        setCurrentUser(null);
        setUserState(null);
      }
    }
  };

  const handleClear = () => {
    setCode('');
    setMessage('');
    setCurrentUser(null);
    setUserState(null);
  };

  const handleBreakAction = async (action: 'break-in' | 'break-out') => {
    if (!code.trim()) {
      setMessage('Please enter your code first');
      setMessageType('error');
      return;
    }
    
    const mockEvent = { preventDefault: () => {} } as React.FormEvent;
    await handleSubmit(mockEvent, action);
  };

  // Function to update user state when code changes
  const updateUserState = async (secretCode: string) => {
    if (!secretCode.trim()) {
      setCurrentUser(null);
      setUserState(null);
      return;
    }

    try {
      const user = await getUserBySecretCode(secretCode);
      if (user) {
        setCurrentUser(user);
        setUserState(getUserState(user));
      } else {
        setCurrentUser(null);
        setUserState(null);
      }
    } catch (error) {
      console.error('Error updating user state:', error);
      setCurrentUser(null);
      setUserState(null);
    }
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
              onChange={(e) => {
                const newCode = e.target.value;
                setCode(newCode);
                if (newCode.length >= 4) { // Check state when code is long enough
                  updateUserState(newCode);
                } else {
                  setCurrentUser(null);
                  setUserState(null);
                }
              }}
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
              disabled={isLoading || !code || (!userState?.canPunchIn && !userState?.canPunchOut)}
              className={`font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                userState?.canPunchIn || userState?.canPunchOut
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-400 text-slate-200 cursor-not-allowed'
              }`}
              whileHover={(userState?.canPunchIn || userState?.canPunchOut) ? { scale: 1.05 } : {}}
              whileTap={(userState?.canPunchIn || userState?.canPunchOut) ? { scale: 0.95 } : {}}
            >
              {isLoading ? '...' : 
                userState?.canPunchIn ? 'Punch IN' : 
                userState?.canPunchOut ? 'Punch OUT' : 
                'Enter'}
            </motion.button>
          </div>
        </form>

        {/* Break Buttons */}
        <div className="mt-6 space-y-3">
          {/* Current Status Display */}
          {currentUser && userState && (
            <div className={`text-center p-2 rounded-lg text-sm ${
              isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
            }`}>
              <span className="font-medium">{currentUser.name}</span> - 
              {userState.isPunchedIn ? (
                <span className="text-green-600 font-medium"> Currently Working</span>
              ) : userState.isOnBreak ? (
                <span className="text-orange-600 font-medium"> On Break</span>
              ) : (
                <span className="text-slate-600 font-medium"> Not Punched In</span>
              )}
            </div>
          )}
          
          <div className="flex space-x-3">
            <motion.button
              type="button"
              onClick={() => handleBreakAction('break-in')}
              disabled={isLoading || !code || !userState?.canStartBreak}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                userState?.canStartBreak
                  ? isDarkMode 
                    ? 'bg-orange-900/50 hover:bg-orange-800/50 text-orange-300 border border-orange-700' 
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300'
                  : isDarkMode
                    ? 'bg-slate-800 text-slate-500 border border-slate-700'
                    : 'bg-slate-200 text-slate-400 border border-slate-300'
              }`}
              whileHover={userState?.canStartBreak ? { scale: 1.02 } : {}}
              whileTap={userState?.canStartBreak ? { scale: 0.98 } : {}}
            >
              Start Break
            </motion.button>
            <motion.button
              type="button"
              onClick={() => handleBreakAction('break-out')}
              disabled={isLoading || !code || !userState?.canEndBreak}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                userState?.canEndBreak
                  ? isDarkMode 
                    ? 'bg-green-900/50 hover:bg-green-800/50 text-green-300 border border-green-700' 
                    : 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300'
                  : isDarkMode
                    ? 'bg-slate-800 text-slate-500 border border-slate-700'
                    : 'bg-slate-200 text-slate-400 border border-slate-300'
              }`}
              whileHover={userState?.canEndBreak ? { scale: 1.02 } : {}}
              whileTap={userState?.canEndBreak ? { scale: 0.98 } : {}}
            >
              End Break
            </motion.button>
          </div>
        </div>

        {/* Holiday Request Buttons */}
        <div className="mt-6 space-y-3">
          <div className="flex space-x-3">
            <motion.button
              type="button"
              onClick={() => setShowHolidayRequestModal(true)}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center space-x-2 ${
                isDarkMode 
                  ? 'bg-purple-900/50 hover:bg-purple-800/50 text-purple-300 border border-purple-700' 
                  : 'bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Calendar className="w-4 h-4" />
              <span>Request Holiday</span>
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setShowHolidayStatusModal(true)}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center space-x-2 ${
                isDarkMode 
                  ? 'bg-indigo-900/50 hover:bg-indigo-800/50 text-indigo-300 border border-indigo-700' 
                  : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border border-indigo-300'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Search className="w-4 h-4" />
              <span>Check Status</span>
            </motion.button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Touch a number to enter your code, then press Enter
          </p>
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Use break buttons for break time management
          </p>
        </div>
      </motion.div>
      <Modal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        title="Forgot to Punch Out Yesterday"
        size="md"
      >
        <div className="space-y-4">
          <p>You forgot to punch out yesterday. Please enter your punch out time for yesterday to complete your attendance record.</p>
          <input
            type="time"
            value={forgotOutTime}
            onChange={e => setForgotOutTime(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent"
            min={(() => {
              if (!pendingUser || !forgotOutDate) return undefined;
              // Find last IN time for yesterday
              const entries = (pendingUser.attendanceLog || []).filter((entry: AttendanceEntry) => {
                const entryDate = toJSDate(entry.timestamp);
                return (
                  entryDate.getFullYear() === forgotOutDate.getFullYear() &&
                  entryDate.getMonth() === forgotOutDate.getMonth() &&
                  entryDate.getDate() === forgotOutDate.getDate()
                );
              });
              const lastIn = entries.length > 0 ? toJSDate(entries[entries.length - 1].timestamp) : null;
              if (lastIn) {
                return lastIn.toTimeString().slice(0,5);
              }
              return undefined;
            })()}
            max="23:59"
            required
          />
          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForgotModal(false)}
              className="px-4 py-2 border rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleForgotOutSubmit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              disabled={!forgotOutTime || isLoading}
            >
              Submit
            </button>
          </div>
        </div>
      </Modal>

      {/* Holiday Request Modal */}
      <HolidayRequestModal
        isOpen={showHolidayRequestModal}
        onClose={() => setShowHolidayRequestModal(false)}
        onSuccess={(message) => {
          setMessage(message);
          setMessageType('success');
        }}
      />

      {/* Holiday Status Modal */}
      <HolidayStatusModal
        isOpen={showHolidayStatusModal}
        onClose={() => setShowHolidayStatusModal(false)}
      />
    </div>
  );
};

export default CodeEntry;