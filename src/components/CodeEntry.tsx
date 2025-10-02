import React, { useState, useEffect } from 'react';
import { Key, Clock, CheckCircle, Moon, Sun, Calendar, Search } from 'lucide-react';
import { getUserBySecretCode, updateUserAttendance, createAttendanceRecord, calculateUserState } from '../services/firestore';
import { formatDate, formatTime } from '../utils/timeCalculations';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import HolidayRequestModal from './HolidayRequestModal';
import HolidayStatusModal from './HolidayStatusModal';
import { User, AttendanceEntry, UserState } from '../types';

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
  const [showForgotBreakModal, setShowForgotBreakModal] = useState(false);
  const [forgotBreakStopTime, setForgotBreakStopTime] = useState('');
  const [pendingBreakUser, setPendingBreakUser] = useState<User | null>(null);
  const [showForgotWorkModal, setShowForgotWorkModal] = useState(false);
  const [forgotWorkStopTime, setForgotWorkStopTime] = useState('');
  const [pendingWorkUser, setPendingWorkUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userState, setUserState] = useState<UserState | null>(null);
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
  function getUserState(user: User): UserState {
    // If user has currentState, use it
    if (user.currentState) {
      console.log(`User ${user.name} has currentState:`, user.currentState);
      return user.currentState;
    }
    
    // Check if user has old IN/OUT entries and needs migration
    const hasOldEntries = user.attendanceLog?.some(entry => {
      const entryType = (entry as { type: string }).type;
      return entryType === 'IN' || entryType === 'OUT';
    });
    
    if (hasOldEntries) {
      // For users with old data, assume they're not working
      console.log(`User ${user.name} has old entries, assuming not working`);
      return {
        isWorking: false,
        isOnBreak: false,
        lastAction: null
      };
    }
    
    // Calculate state from attendance log
    const calculatedState = calculateUserState(user.attendanceLog || []);
    console.log(`User ${user.name} calculated state:`, calculatedState);
    return calculatedState;
  }

  // Helper to determine what actions are available based on current state
  function getAvailableActions(state: UserState) {
    return {
      canStartWork: !state.isWorking && !state.isOnBreak,
      canStopWork: state.isWorking && !state.isOnBreak,
      canStartBreak: state.isWorking && !state.isOnBreak,
      canStopBreak: state.isOnBreak
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
      // Check if user was working or on break at end of yesterday
      if (last.type === 'START_WORK' || last.type === 'START_BREAK') {
        return { lastIn: last, entries: yesterdayEntries, date: yesterday };
      }
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent, action?: 'start-work' | 'stop-work' | 'start-break' | 'stop-break') => {
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
      const currentState = getUserState(user);
      const availableActions = getAvailableActions(currentState);
      
      console.log(`User ${user.name} - Current state:`, currentState);
      console.log(`User ${user.name} - Available actions:`, availableActions);
      
      
      // Determine the action to take based on current state
      let actionType: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK';
      let actionMessage = '';
      
      if (action) {
        // Specific action requested
        switch (action) {
          case 'start-work':
            if (!availableActions.canStartWork) {
              setMessage('Cannot start work. You are already working or on break.');
              setMessageType('error');
              setIsLoading(false);
              setCode('');
              return;
            }
            actionType = 'START_WORK';
            actionMessage = 'Started Work';
            break;
          case 'stop-work':
            if (!availableActions.canStopWork) {
              setMessage('Cannot stop work. You are not currently working.');
              setMessageType('error');
              setIsLoading(false);
              setCode('');
              return;
            }
            actionType = 'STOP_WORK';
            actionMessage = 'Stopped Work';
            break;
          case 'start-break':
            if (!availableActions.canStartBreak) {
              setMessage('Cannot start break. You must be working to start a break.');
              setMessageType('error');
              setIsLoading(false);
              setCode('');
              return;
            }
            actionType = 'START_BREAK';
            actionMessage = 'Started Break';
            break;
          case 'stop-break':
            if (!availableActions.canStopBreak) {
              setMessage('Cannot stop break. You are not currently on break.');
              setMessageType('error');
              setIsLoading(false);
              setCode('');
              return;
            }
            actionType = 'STOP_BREAK';
            actionMessage = 'Stopped Break';
            break;
        }
      } else {
        // Auto-detect action based on current state
        // Priority order: Stop Break > Start Break > Stop Work > Start Work
        if (availableActions.canStopBreak) {
          // Check if break duration is longer than 1.5 hours
          if (currentState.lastBreakStart) {
            const breakDurationMinutes = (now.getTime() - currentState.lastBreakStart.getTime()) / (1000 * 60);
            const breakDurationHours = breakDurationMinutes / 60;
            
            if (breakDurationHours > 1.5) {
              // Break is too long - user probably forgot to stop break
              setShowForgotBreakModal(true);
              setPendingBreakUser(user);
              setIsLoading(false);
              return;
            }
          }
          
          actionType = 'STOP_BREAK';
          actionMessage = 'Stopped Break';
        } else if (availableActions.canStartBreak) {
          actionType = 'START_BREAK';
          actionMessage = 'Started Break';
        } else if (availableActions.canStopWork) {
          // Check if work session is longer than 12 hours
          if (currentState.lastWorkStart) {
            const workDurationMinutes = (now.getTime() - currentState.lastWorkStart.getTime()) / (1000 * 60);
            const workDurationHours = workDurationMinutes / 60;
            
            if (workDurationHours > 12) {
              // Work session is too long - user probably forgot to stop work
              setShowForgotWorkModal(true);
              setPendingWorkUser(user);
              setIsLoading(false);
              return;
            }
          }
          
          actionType = 'STOP_WORK';
          actionMessage = 'Stopped Work';
        } else if (availableActions.canStartWork) {
          actionType = 'START_WORK';
          actionMessage = 'Started Work';
        } else {
          setMessage('No valid action available. Please contact administrator.');
          setMessageType('error');
          setIsLoading(false);
          setCode('');
          return;
        }
        
        console.log(`User ${user.name} - Selected action: ${actionType} (${actionMessage})`);
      }

      // Calculate amount earned if stopping work
      let amountEarned = 0;
      let newTotalAmount = user.amount;

      if (actionType === 'STOP_WORK' && currentState.lastWorkStart) {
        const minutesWorked = (now.getTime() - currentState.lastWorkStart.getTime()) / (1000 * 60);
        amountEarned = (minutesWorked / 60) * user.hourlyRate;
        newTotalAmount = user.amount + amountEarned;
      }

      // Calculate new state
      const newState: UserState = {
        isWorking: actionType === 'START_WORK' || (actionType === 'STOP_BREAK' && currentState.isWorking),
        isOnBreak: actionType === 'START_BREAK' || (actionType === 'STOP_BREAK' && currentState.isOnBreak),
        lastWorkStart: actionType === 'START_WORK' ? now : currentState.lastWorkStart,
        lastBreakStart: actionType === 'START_BREAK' ? now : currentState.lastBreakStart,
        lastAction: actionType,
        lastActionTime: now
      };

      // Update user attendance
      await updateUserAttendance(
        user.id,
        { timestamp: now, type: actionType },
        actionType === 'STOP_WORK' ? newTotalAmount : undefined,
        newState
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
        type: actionType,
        hourlyRate: user.hourlyRate,
        ...(actionType === 'STOP_WORK' && { amountEarned }),
        date: formatDate(now)
      });

      setMessage(`${user.name} - ${actionMessage} at ${formatTime(now)}`);
      setMessageType('success');
      setCode('');
      
      // Reset user state after successful action
      setCurrentUser(null);
      setUserState(null);
    } catch (error) {
      setMessage('Error processing action. Please try again.');
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
    
    // Determine what type of action to add for yesterday
    const yesterdayState = getUserState(pendingUser);
    let yesterdayActionType: 'STOP_WORK' | 'STOP_BREAK';
    if (yesterdayState.isOnBreak) {
      yesterdayActionType = 'STOP_BREAK';
    } else {
      yesterdayActionType = 'STOP_WORK';
    }
    
    // Add appropriate entry for yesterday
    await updateUserAttendance(
      pendingUser.id,
      { timestamp: punchOutDate, type: yesterdayActionType }
    );
    
    // After fixing, start work for today
    const now = pendingNow || new Date();
    await updateUserAttendance(
      pendingUser.id,
      { timestamp: now, type: 'START_WORK' }
    );
    await createAttendanceRecord({
      userId: pendingUser.id,
      name: pendingUser.name,
      timestamp: now,
      type: 'START_WORK',
      hourlyRate: pendingUser.hourlyRate,
      date: formatDate(now)
    });
    setMessage(`${pendingUser.name} - Started Work at ${formatTime(now)}`);
    setMessageType('success');
    setCode('');
    setShowForgotModal(false);
    setIsLoading(false);
  };

  const handleForgotWorkSubmit = async () => {
    if (!pendingWorkUser || !forgotWorkStopTime) return;
    setIsLoading(true);
    
    try {
      // Parse the time user entered for when they stopped work
      const [h, m] = forgotWorkStopTime.split(':');
      const workStopDate = new Date();
      workStopDate.setHours(Number(h), Number(m), 0, 0);
      
      // Validate that work stop time is after work start time
      const workStartTime = currentUser?.currentState?.lastWorkStart;
      if (workStartTime && workStopDate <= workStartTime) {
        setMessage('Work stop time must be after work start time.');
        setMessageType('error');
        setIsLoading(false);
        return;
      }
      
      // Calculate amount earned for the work session
      const userDoc = await getDoc(doc(db, 'users', pendingWorkUser.id));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Calculate work hours from START_WORK to user-specified stop time
        let totalWorkMinutes = 0;
        let workStart: Date | null = null;
        
        const todayEntries = (userData.attendanceLog || []).filter((entry: AttendanceEntry) => {
          const entryDate = new Date(entry.timestamp);
          const today = new Date();
          return entryDate.toDateString() === today.toDateString();
        }).sort((a: AttendanceEntry, b: AttendanceEntry) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        for (const entry of todayEntries) {
          switch (entry.type) {
            case 'START_WORK':
              workStart = new Date(entry.timestamp);
              break;
            case 'START_BREAK':
              break; // Breaks are paid
            case 'STOP_BREAK':
              break; // Breaks are paid
            case 'STOP_WORK':
              if (workStart) {
                totalWorkMinutes += (new Date(entry.timestamp).getTime() - workStart.getTime()) / (1000 * 60);
                workStart = null;
              }
              break;
          }
        }
        
        // Add time from work start to user-specified stop time
        if (workStart) {
          totalWorkMinutes += (workStopDate.getTime() - workStart.getTime()) / (1000 * 60);
        }
        
        const amountEarned = Number(((totalWorkMinutes / 60) * pendingWorkUser.hourlyRate).toFixed(2));
        const newTotalAmount = pendingWorkUser.amount + amountEarned;
        
        // Calculate new state after STOP_WORK
        const newState = {
          isWorking: false,
          isOnBreak: false,
          lastAction: 'STOP_WORK' as const,
          lastActionTime: workStopDate
        };
        
        // Add STOP_WORK entry for the time user specified
        await updateUserAttendance(
          pendingWorkUser.id,
          { timestamp: workStopDate, type: 'STOP_WORK' },
          newTotalAmount,
          newState
        );
        
        await createAttendanceRecord({
          userId: pendingWorkUser.id,
          name: pendingWorkUser.name,
          timestamp: workStopDate,
          type: 'STOP_WORK',
          hourlyRate: pendingWorkUser.hourlyRate,
          amountEarned,
          date: formatDate(workStopDate)
        });
        
        setMessage(`${pendingWorkUser.name} - Work stopped at ${formatTime(workStopDate)}`);
        setMessageType('success');
      }
      
      setCode('');
      setShowForgotWorkModal(false);
      setForgotWorkStopTime('');
      setPendingWorkUser(null);
      
      // Refresh user state display
      setCurrentUser(null);
      setUserState(null);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error handling forgot work:', error);
      setMessage('An error occurred. Please try again.');
      setMessageType('error');
      setIsLoading(false);
    }
  };

  const handleForgotBreakSubmit = async () => {
    if (!pendingBreakUser || !forgotBreakStopTime) return;
    setIsLoading(true);
    
    try {
      // Parse the time user entered for when they stopped break
      const [h, m] = forgotBreakStopTime.split(':');
      const breakStopDate = new Date();
      breakStopDate.setHours(Number(h), Number(m), 0, 0);
      
      // Validate that break stop time is after break start time
      const breakStartTime = currentUser?.currentState?.lastBreakStart;
      if (breakStartTime && breakStopDate <= breakStartTime) {
        setMessage('Break stop time must be after break start time.');
        setMessageType('error');
        setIsLoading(false);
        return;
      }
      
      // Add STOP_BREAK entry for the time user specified
      await updateUserAttendance(
        pendingBreakUser.id,
        { timestamp: breakStopDate, type: 'STOP_BREAK' }
      );
      
      await createAttendanceRecord({
        userId: pendingBreakUser.id,
        name: pendingBreakUser.name,
        timestamp: breakStopDate,
        type: 'STOP_BREAK',
        hourlyRate: pendingBreakUser.hourlyRate,
        date: formatDate(breakStopDate)
      });
      
      // Now add STOP_WORK entry for current time
      const now = new Date();
      
      // Calculate amount earned for the work session
      const userDoc = await getDoc(doc(db, 'users', pendingBreakUser.id));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const updatedLog = [...(userData.attendanceLog || []), 
          { timestamp: breakStopDate, type: 'STOP_BREAK' }
        ];
        
        // Calculate work hours for amount
        let totalWorkMinutes = 0;
        let workStartTime: Date | null = null;
        
        const todayEntries = updatedLog.filter((entry: AttendanceEntry) => {
          const entryDate = new Date(entry.timestamp);
          const today = new Date();
          return entryDate.toDateString() === today.toDateString();
        }).sort((a: AttendanceEntry, b: AttendanceEntry) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        for (const entry of todayEntries) {
          switch (entry.type) {
            case 'START_WORK':
              workStartTime = new Date(entry.timestamp);
              break;
            case 'START_BREAK':
              break; // Breaks are paid, continue counting
            case 'STOP_BREAK':
              break; // Breaks are paid, continue counting
            case 'STOP_WORK':
              if (workStartTime) {
                totalWorkMinutes += (new Date(entry.timestamp).getTime() - workStartTime.getTime()) / (1000 * 60);
                workStartTime = null;
              }
              break;
          }
        }
        
        // Add time from work start to now (for STOP_WORK)
        if (workStartTime) {
          totalWorkMinutes += (now.getTime() - workStartTime.getTime()) / (1000 * 60);
        }
        
        const amountEarned = Number(((totalWorkMinutes / 60) * pendingBreakUser.hourlyRate).toFixed(2));
        const newTotalAmount = pendingBreakUser.amount + amountEarned;
        
        // Calculate new state after STOP_WORK
        const newState = {
          isWorking: false,
          isOnBreak: false,
          lastAction: 'STOP_WORK' as const,
          lastActionTime: now
        };
        
        await updateUserAttendance(
          pendingBreakUser.id,
          { timestamp: now, type: 'STOP_WORK' },
          newTotalAmount,
          newState
        );
        
        await createAttendanceRecord({
          userId: pendingBreakUser.id,
          name: pendingBreakUser.name,
          timestamp: now,
          type: 'STOP_WORK',
          hourlyRate: pendingBreakUser.hourlyRate,
          amountEarned,
          date: formatDate(now)
        });
        
        setMessage(`${pendingBreakUser.name} - Break stopped at ${formatTime(breakStopDate)}, Work stopped at ${formatTime(now)}`);
        setMessageType('success');
      }
      
      setCode('');
      setShowForgotBreakModal(false);
      setForgotBreakStopTime('');
      setPendingBreakUser(null);
      
      // Refresh user state display
      setCurrentUser(null);
      setUserState(null);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error handling forgot break:', error);
      setMessage('An error occurred. Please try again.');
      setMessageType('error');
      setIsLoading(false);
    }
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

  const handleBreakAction = async (action: 'start-break' | 'stop-break') => {
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
        const state = getUserState(user);
        setCurrentUser(user);
        setUserState(state);
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
            Enter your code to manage attendance
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
              disabled={isLoading || !code || !userState}
              className={`font-semibold py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                userState
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-400 text-slate-200 cursor-not-allowed'
              }`}
              whileHover={userState ? { scale: 1.05 } : {}}
              whileTap={userState ? { scale: 0.95 } : {}}
            >
              {isLoading ? '...' : 
                userState?.isWorking && !userState?.isOnBreak ? 'Stop Work' : 
                userState?.isOnBreak ? 'Stop Break' : 
                userState?.isWorking ? 'Start Break' : 
                'Start Work'}
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
              {userState.isWorking && !userState.isOnBreak ? (
                <span className="text-green-600 font-medium"> Currently Working</span>
              ) : userState.isOnBreak ? (
                <span className="text-orange-600 font-medium"> On Break</span>
              ) : (
                <span className="text-slate-600 font-medium"> Not Working</span>
              )}
            </div>
          )}
          
          
          <div className="flex space-x-3">
            <motion.button
              type="button"
              onClick={() => handleBreakAction('start-break')}
              disabled={isLoading || !code || !userState?.isWorking || userState?.isOnBreak}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                userState?.isWorking && !userState?.isOnBreak
                  ? isDarkMode 
                    ? 'bg-orange-900/50 hover:bg-orange-800/50 text-orange-300 border border-orange-700' 
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300'
                  : isDarkMode
                    ? 'bg-slate-800 text-slate-500 border border-slate-700'
                    : 'bg-slate-200 text-slate-400 border border-slate-300'
              }`}
              whileHover={userState?.isWorking && !userState?.isOnBreak ? { scale: 1.02 } : {}}
              whileTap={userState?.isWorking && !userState?.isOnBreak ? { scale: 0.98 } : {}}
            >
              Start Break
            </motion.button>
            <motion.button
              type="button"
              onClick={() => handleBreakAction('stop-break')}
              disabled={isLoading || !code || !userState?.isOnBreak}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                userState?.isOnBreak
                  ? isDarkMode 
                    ? 'bg-green-900/50 hover:bg-green-800/50 text-green-300 border border-green-700' 
                    : 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300'
                  : isDarkMode
                    ? 'bg-slate-800 text-slate-500 border border-slate-700'
                    : 'bg-slate-200 text-slate-400 border border-slate-300'
              }`}
              whileHover={userState?.isOnBreak ? { scale: 1.02 } : {}}
              whileTap={userState?.isOnBreak ? { scale: 0.98 } : {}}
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
        title="Forgot to Stop Work/Break Yesterday"
        size="md"
      >
        <div className="space-y-4">
          <p>You forgot to stop work or break yesterday. Please enter the time when you stopped to complete your attendance record.</p>
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

      {/* Forgot to Stop Work Modal */}
      <Modal
        isOpen={showForgotWorkModal}
        onClose={() => {
          setShowForgotWorkModal(false);
          setForgotWorkStopTime('');
          setPendingWorkUser(null);
        }}
        title="Long Work Session Detected"
        size="md"
      >
        <div className="space-y-4">
          <div className={`p-4 rounded-md ${isDarkMode ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
            <p className={`font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-800'}`}>
              ⚠️ Your work session has been active for more than 12 hours!
            </p>
            {currentUser?.currentState?.lastWorkStart && (
              <p className={`mt-1 text-sm font-medium ${isDarkMode ? 'text-red-200' : 'text-red-700'}`}>
                Work started at: {currentUser.currentState.lastWorkStart.toLocaleTimeString()}
              </p>
            )}
            <p className={`mt-2 text-sm ${isDarkMode ? 'text-red-200' : 'text-red-700'}`}>
              It looks like you may have forgotten to stop work earlier. Please enter the time when you actually stopped working.
            </p>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              What time did you stop work?
            </label>
            <input
              type="time"
              value={forgotWorkStopTime}
              onChange={e => setForgotWorkStopTime(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
              min={(() => {
                if (!currentUser?.currentState?.lastWorkStart) return undefined;
                const workStart = currentUser.currentState.lastWorkStart;
                return `${String(workStart.getHours()).padStart(2, '0')}:${String(workStart.getMinutes()).padStart(2, '0')}`;
              })()}
              max={(() => {
                const now = new Date();
                return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              })()}
              required
            />
            {currentUser?.currentState?.lastWorkStart && (
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Work started at: {currentUser.currentState.lastWorkStart.toLocaleTimeString()}
              </p>
            )}
          </div>
          
          <div className={`p-3 rounded-md ${isDarkMode ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-700'}`}>
              📝 After you submit, the system will:
            </p>
            <ul className={`mt-2 text-sm space-y-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-800'}`}>
              <li>• Record your work stop at the time you specify</li>
              <li>• Calculate your payment correctly</li>
              <li>• Update your status to "Not Working"</li>
            </ul>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-2">
            <motion.button
              type="button"
              onClick={() => {
                setShowForgotWorkModal(false);
                setForgotWorkStopTime('');
                setPendingWorkUser(null);
              }}
              className={`px-4 py-2 border rounded-md transition-colors ${
                isDarkMode 
                  ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              onClick={handleForgotWorkSubmit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!forgotWorkStopTime || isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? 'Processing...' : 'Submit & Stop Work'}
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Forgot to Stop Break Modal */}
      <Modal
        isOpen={showForgotBreakModal}
        onClose={() => {
          setShowForgotBreakModal(false);
          setForgotBreakStopTime('');
          setPendingBreakUser(null);
        }}
        title="Long Break Detected"
        size="md"
      >
        <div className="space-y-4">
          <div className={`p-4 rounded-md ${isDarkMode ? 'bg-orange-900/30 border border-orange-700' : 'bg-orange-50 border border-orange-200'}`}>
            <p className={`font-semibold ${isDarkMode ? 'text-orange-300' : 'text-orange-800'}`}>
              ⚠️ Your break has been active for more than 1.5 hours!
            </p>
            {currentUser?.currentState?.lastBreakStart && (
              <p className={`mt-1 text-sm font-medium ${isDarkMode ? 'text-orange-200' : 'text-orange-700'}`}>
                Break started at: {currentUser.currentState.lastBreakStart.toLocaleTimeString()}
              </p>
            )}
            <p className={`mt-2 text-sm ${isDarkMode ? 'text-orange-200' : 'text-orange-700'}`}>
              It looks like you may have forgotten to stop your break. Please enter the time when you actually stopped your break.
            </p>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              What time did you stop your break?
            </label>
            <input
              type="time"
              value={forgotBreakStopTime}
              onChange={e => setForgotBreakStopTime(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                isDarkMode 
                  ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20'
                  : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
              min={(() => {
                if (!currentUser?.currentState?.lastBreakStart) return undefined;
                const breakStart = currentUser.currentState.lastBreakStart;
                return `${String(breakStart.getHours()).padStart(2, '0')}:${String(breakStart.getMinutes()).padStart(2, '0')}`;
              })()}
              max={(() => {
                const now = new Date();
                return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              })()}
              required
            />
            {currentUser?.currentState?.lastBreakStart && (
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Break started at: {currentUser.currentState.lastBreakStart.toLocaleTimeString()}
              </p>
            )}
          </div>
          
          <div className={`p-3 rounded-md ${isDarkMode ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50 border border-blue-200'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-700'}`}>
              📝 After you submit, the system will:
            </p>
            <ul className={`mt-2 text-sm space-y-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-800'}`}>
              <li>• Record your break stop at the time you specify</li>
              <li>• Record your work stop at the current time</li>
              <li>• Calculate your payment correctly</li>
            </ul>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-2">
            <motion.button
              type="button"
              onClick={() => {
                setShowForgotBreakModal(false);
                setForgotBreakStopTime('');
                setPendingBreakUser(null);
              }}
              className={`px-4 py-2 border rounded-md transition-colors ${
                isDarkMode 
                  ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              onClick={handleForgotBreakSubmit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!forgotBreakStopTime || isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? 'Processing...' : 'Submit & Stop Work'}
            </motion.button>
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