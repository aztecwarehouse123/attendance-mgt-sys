import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getAllUsers, updateAttendanceEntry } from '../../services/firestore';
import { AttendanceEntry, User } from '../../types';
import { format, endOfDay, differenceInMinutes, differenceInSeconds, addDays } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { getCurrentUserState } from '../../utils/timeCalculations';
import Modal from '../Modal';
import { Edit2, RefreshCw } from 'lucide-react';

const AdminDailyOverview: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const { isDarkMode } = useTheme();
  const [now, setNow] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<'all' | 'working' | 'on_break' | 'completed' | 'not_working'>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  // Legacy arrays replaced by aligned sessionRows editor
  const [sessionRows, setSessionRows] = useState<Array<{
    startIdx: number;
    stopTodayIdx?: number;
    stopNextIdx?: number;
    startBreakIdx?: number;
    stopBreakIdx?: number;
    startWork?: string;
    startBreak?: string;
    stopBreak?: string;
    stopWorkToday?: string;
    stopWorkNext?: string;
  }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const all = await getAllUsers();
        setUsers(all.filter(u => u.id !== 'admin'));
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const all = await getAllUsers();
      setUsers(all.filter(u => u.id !== 'admin'));
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const all = await getAllUsers();
        setUsers(all.filter(u => u.id !== 'admin'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const isSelectedToday = useMemo(() => selectedDate === format(new Date(), 'yyyy-MM-dd'), [selectedDate]);
  const isPastSelectedDay = useMemo(() => selectedDate < format(new Date(), 'yyyy-MM-dd'), [selectedDate]);

  // Update a ticking clock when viewing today's date for live timers
  useEffect(() => {
    if (!isSelectedToday) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [isSelectedToday]);

  const isSameSelectedDay = useCallback((date: Date) => {
    return format(date, 'yyyy-MM-dd') === selectedDate;
  }, [selectedDate]);

  const computeDaily = (attendanceLog: AttendanceEntry[]) => {
    // Build sessions across entire log to properly account for next-day stops
    const allEntries = [...attendanceLog].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const sessions: Array<{ startTime: Date; stopTime?: Date }> = [];
    let pendingStart: Date | null = null;
    for (const e of allEntries) {
      const t = new Date(e.timestamp);
      if (e.type === 'START_WORK') {
        pendingStart = t;
      } else if (e.type === 'STOP_WORK') {
        if (pendingStart) {
          sessions.push({ startTime: pendingStart, stopTime: t });
          pendingStart = null;
        }
      }
    }
    if (pendingStart) {
      sessions.push({ startTime: pendingStart });
    }

    const sessionsStartedToday = sessions.filter(s => isSameSelectedDay(s.startTime));

    // Work minutes: for sessions started today, count to their actual stop (even if next day). For ongoing today, count live for today view.
    let workMinutes = 0;
    for (const s of sessionsStartedToday) {
      if (s.stopTime) {
        workMinutes += differenceInMinutes(s.stopTime, s.startTime);
      } else if (isSelectedToday) {
        workMinutes += differenceInMinutes(now, s.startTime);
      } else {
        // Past day with no stop recorded: cap at end of day to avoid runaway duration
        workMinutes += differenceInMinutes(endOfDay(selectedDateObj), s.startTime);
      }
    }

    // Breaks: compute from entries that fall on selected day (simple, day-bucketed)
    const dayEntries = allEntries
      .filter(e => isSameSelectedDay(new Date(e.timestamp)))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let breakStart: Date | null = null;
    let breakMinutes = 0;
    let breakCount = 0;
    let firstStartBreak: Date | null = null;
    let lastStopBreak: Date | null = null;
    for (const entry of dayEntries) {
      const t = new Date(entry.timestamp);
      if (entry.type === 'START_BREAK') {
        if (!firstStartBreak) firstStartBreak = t;
        if (!breakStart) breakStart = t;
        breakCount += 1;
      } else if (entry.type === 'STOP_BREAK') {
        if (breakStart) {
          breakMinutes += differenceInMinutes(t, breakStart);
          breakStart = null;
        }
        lastStopBreak = t;
      }
    }
    if (breakStart && !isSelectedToday) {
      breakMinutes += differenceInMinutes(endOfDay(selectedDateObj), breakStart);
    }

    const firstStartWork = sessionsStartedToday.length > 0 ? sessionsStartedToday[0].startTime : null;
    const sameDayStops = sessionsStartedToday.map(s => s.stopTime).filter((t): t is Date => !!t && isSameSelectedDay(t));
    const lastStopWork = sameDayStops.length > 0 ? sameDayStops[sameDayStops.length - 1] : null;
    const hasNextDayStop = sessionsStartedToday.some(s => s.stopTime && format(s.stopTime, 'yyyy-MM-dd') === format(addDays(selectedDateObj, 1), 'yyyy-MM-dd'));

    return {
      workMinutes,
      breakHours: breakMinutes / 60,
      breakCount,
      startWorkTime: firstStartWork,
      stopWorkTime: lastStopWork,
      startBreakTime: firstStartBreak,
      stopBreakTime: lastStopBreak,
      hasNextDayStop
    } as const;
  };

  // helper to format seconds to "Hh Mm Ss"
  const formatHMS = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  };

  // Build rows (non-memoized cheap mapping)
  const rows = users.map(u => ({ user: u, stats: computeDaily(u.attendanceLog || []), state: getCurrentUserState(u.attendanceLog || []) }));

  type StatusKey = 'working' | 'on_break' | 'completed' | 'not_working';
  const computeKey = useCallback((stats: ReturnType<typeof computeDaily>, state: ReturnType<typeof getCurrentUserState>): StatusKey => {
    if (stats.startWorkTime && (stats.stopWorkTime || (stats as unknown as { hasNextDayStop?: boolean }).hasNextDayStop)) return 'completed';
    if (isSelectedToday) return state.isOnBreak ? 'on_break' : (state.isWorking ? 'working' : 'not_working');
    if (stats.startBreakTime && !stats.stopBreakTime && !stats.stopWorkTime) return 'on_break';
    if (stats.startWorkTime && !stats.stopWorkTime) return 'working';
    return 'not_working';
  }, [isSelectedToday]);

  const filteredRows = useMemo(() => rows.filter(row => statusFilter === 'all' || computeKey(row.stats, row.state) === statusFilter), [rows, statusFilter, computeKey]);

  const workingCount = useMemo(() => rows.filter(r => computeKey(r.stats, r.state) === 'working').length, [rows, computeKey]);
  const onBreakCount = useMemo(() => rows.filter(r => computeKey(r.stats, r.state) === 'on_break').length, [rows, computeKey]);
  const notWorkingCount = useMemo(() => rows.filter(r => computeKey(r.stats, r.state) === 'not_working').length, [rows, computeKey]);
  const completedCount = useMemo(() => rows.filter(r => computeKey(r.stats, r.state) === 'completed').length, [rows, computeKey]);

  const refreshUsers = useCallback(async () => {
    const updated = await getAllUsers();
    setUsers(updated.filter(u => u.id !== 'admin'));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} mb-2`}>Daily Overview</h2>
            <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>View all users' work and break activity for a day</p>
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow p-6 border`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Working</span>
              <span className={`px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800'}`}>{workingCount}</span>
              <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} ml-3`}>Not working</span>
              <span className={`px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>{notWorkingCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>On break</span>
              <span className={`px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>{onBreakCount}</span>
              <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} ml-3`}>Completed</span>
              <span className={`px-2 py-1 rounded-full text-sm font-medium ${isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{completedCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                className={`border rounded-md px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}
              >
                <option value="all">All</option>
                <option value="working">Working</option>
                <option value="on_break">On Break</option>
                <option value="completed">Completed</option>
                <option value="not_working">Not Working</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={`border rounded-md px-3 py-2 focus:ring-2 focus:border-transparent text-sm ${
                isDarkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-blue-400/20' : 'border-slate-300 text-slate-800 focus:ring-blue-500'
              }`}
            />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`p-2 rounded-md ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Refresh data"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-lg shadow overflow-hidden border`}
      >
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="min-w-full divide-y divide-slate-200 table-fixed">
            <thead className={`${isDarkMode ? 'bg-slate-700' : 'bg-slate-50'} sticky top-0 z-20 shadow-sm`}>
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-20`}>User</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-28`}>Status</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-24`}>Start Work</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-24`}>Start Break</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-24`}>Stop Break</th>
                <th className={`px-6 py-3 text-left text-[10px] sm:text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-28`}>Stop Work (Today)</th>
                {isPastSelectedDay && (
                  <th className={`px-6 py-3 text-left text-[10px] sm:text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-32`}>Stop Work (Next Day)</th>
                )}
                {/* Stop Work (Prev Day) temporarily hidden */}
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-36`}>Work Hours</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-32`}>Break Hours</th>
                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-slate-500'} w-20`}>Edit</th>
              </tr>
            </thead>
            <tbody className={`${isDarkMode ? 'bg-slate-800' : 'bg-white'} divide-y divide-slate-200 overflow-y-auto`}>
              {loading ? (
                <tr>
                  <td className={`${isDarkMode ? 'text-slate-300' : 'text-slate-500'} px-6 py-4 text-sm`} colSpan={8}>Loading...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td className={`${isDarkMode ? 'text-slate-300' : 'text-slate-500'} px-6 py-4 text-sm`} colSpan={8}>No users found.</td>
                </tr>
              ) : (
                filteredRows.map((row, index) => {
                  const { user, stats, state } = row;
                  const statusLabel = computeKey(stats, state);

                  // Work ongoing from START_WORK even during breaks
                  const ongoing = isSelectedToday && stats.startWorkTime && !stats.stopWorkTime;
                  const baseWorkSeconds = stats.workMinutes * 60;
                  const displayWorkHours = ongoing && stats.startWorkTime
                    ? `${formatHMS(baseWorkSeconds + Math.max(0, differenceInSeconds(now, stats.startWorkTime)))} (ongoing)`
                    : formatHMS(baseWorkSeconds);

                  const baseBreakSeconds = Math.round(stats.breakHours * 3600);
                  const displayBreakHours = (isSelectedToday && state.isOnBreak && state.lastActionTime)
                    ? `${formatHMS(baseBreakSeconds + Math.max(0, differenceInSeconds(now, state.lastActionTime)))} (${stats.breakCount})`
                    : `${formatHMS(baseBreakSeconds)} (${stats.breakCount})`;

                  const statusClass = statusLabel === 'working'
                    ? (isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800')
                    : statusLabel === 'on_break'
                      ? (isDarkMode ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-700')
                      : statusLabel === 'completed'
                        ? (isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700')
                        : (isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700');

                  // Highlight if no entries today
                  const hasAnyToday = !!(stats.startWorkTime || stats.stopWorkTime || stats.startBreakTime || stats.stopBreakTime);
                  const rowHighlight = !hasAnyToday ? (isDarkMode ? 'bg-yellow-900/30' : 'bg-yellow-100/80') : '';

                  // Break warning if > 1.5h
                  const breakSeconds = Math.round(stats.breakHours * 3600);
                  const showBreakWarning = breakSeconds > 1.5 * 3600;

                  // Build per-day lists of times for display (multiple sessions)

                  // Build per-day lists of times for display (multiple sessions)
                  // note: no separate dayEntriesSorted needed after aligning by session
                  // Build full work sessions across all time to correctly relate STOP to its START
                  const allEntriesSorted = (user.attendanceLog || [])
                    .map((e, idx) => ({ e, idx }))
                    .sort((a, b) => new Date(a.e.timestamp).getTime() - new Date(b.e.timestamp).getTime());

                  const workSessionsAll: Array<{ startIdx: number; startTime: Date; stopIdx?: number; stopTime?: Date }> = [];
                  let pendingStart: { idx: number; time: Date } | null = null;
                  for (const { e, idx } of allEntriesSorted) {
                    const t = new Date(e.timestamp);
                    if (e.type === 'START_WORK') {
                      pendingStart = { idx, time: t };
                    } else if (e.type === 'STOP_WORK') {
                      if (pendingStart) {
                        workSessionsAll.push({ startIdx: pendingStart.idx, startTime: pendingStart.time, stopIdx: idx, stopTime: t });
                        pendingStart = null;
                      }
                    }
                  }
                  if (pendingStart) {
                    workSessionsAll.push({ startIdx: pendingStart.idx, startTime: pendingStart.time });
                  }

                  // Sessions that START today (used for aligned display with breaks)
                  const sessionsToday = workSessionsAll.filter(s => isSameSelectedDay(s.startTime));
                  const nextDayStr = format(addDays(selectedDateObj, 1), 'yyyy-MM-dd');

                  // Build a unified, per-session view so each line aligns across columns
                  const perSessionDisplay = sessionsToday.map(s => {
                    const startWork = format(s.startTime, 'hh:mm a');
                    const stopWorkToday = s.stopTime && isSameSelectedDay(s.stopTime) ? format(s.stopTime, 'hh:mm a') : '—';
                    const stopWorkNext = s.stopTime && format(s.stopTime, 'yyyy-MM-dd') === nextDayStr ? format(s.stopTime, 'hh:mm a') : '—';

                    // Breaks that occurred during this work session window on the selected day
                    const sessionStart = s.startTime;
                    const sessionEnd = s.stopTime ?? endOfDay(selectedDateObj);
                    const breaksInSession = (user.attendanceLog || [])
                      .filter(e => (e.type === 'START_BREAK' || e.type === 'STOP_BREAK'))
                      .map(e => ({ type: e.type, time: new Date(e.timestamp) }))
                      .filter(x => isSameSelectedDay(x.time) && x.time >= sessionStart && x.time <= sessionEnd)
                      .sort((a, b) => a.time.getTime() - b.time.getTime());

                    const breakStarts: string[] = [];
                    const breakStops: string[] = [];
                    for (const b of breaksInSession) {
                      if (b.type === 'START_BREAK') breakStarts.push(format(b.time, 'hh:mm a'));
                      if (b.type === 'STOP_BREAK') breakStops.push(format(b.time, 'hh:mm a'));
                    }

                    return {
                      startWork,
                      startBreaks: breakStarts,
                      stopBreaks: breakStops,
                      stopWorkToday,
                      stopWorkNext,
                    };
                  });

                  const handleOpenEdit = () => {
                    setEditingUser(user);

                    // Build aligned session rows to mirror the table
                    const sessionsAllIdx = workSessionsAll; // already contains startIdx/stopIdx
                    const sessionsTodayIdx = sessionsAllIdx.filter(s => isSameSelectedDay(s.startTime));
                    const nextDay = format(addDays(selectedDateObj, 1), 'yyyy-MM-dd');

                    const rowsForEdit = sessionsTodayIdx.map(s => {
                      // find first break start/stop within session on selected day
                      const sessionStart = s.startTime;
                      const sessionEnd = s.stopTime ?? endOfDay(selectedDateObj);
                      const dayLogs = (user.attendanceLog || []).map((e, idx2) => ({ e, idx2, time: new Date(e.timestamp) }));
                      const breaksInSession = dayLogs
                        .filter(x => (x.e.type === 'START_BREAK' || x.e.type === 'STOP_BREAK'))
                        .filter(x => isSameSelectedDay(x.time) && x.time >= sessionStart && x.time <= sessionEnd)
                        .sort((a, b) => a.time.getTime() - b.time.getTime());
                      const firstStartBreak = breaksInSession.find(b => b.e.type === 'START_BREAK');
                      const firstStopBreak = breaksInSession.find(b => b.e.type === 'STOP_BREAK');

                      return {
                        startIdx: s.startIdx,
                        stopTodayIdx: s.stopTime && isSameSelectedDay(s.stopTime) ? s.stopIdx : undefined,
                        stopNextIdx: s.stopTime && format(s.stopTime, 'yyyy-MM-dd') === nextDay ? s.stopIdx : undefined,
                        startBreakIdx: firstStartBreak ? firstStartBreak.idx2 : undefined,
                        stopBreakIdx: firstStopBreak ? firstStopBreak.idx2 : undefined,
                        startWork: format(s.startTime, 'HH:mm'),
                        startBreak: firstStartBreak ? format(firstStartBreak.time, 'HH:mm') : undefined,
                        stopBreak: firstStopBreak ? format(firstStopBreak.time, 'HH:mm') : undefined,
                        stopWorkToday: s.stopTime && isSameSelectedDay(s.stopTime) ? format(s.stopTime, 'HH:mm') : undefined,
                        stopWorkNext: s.stopTime && format(s.stopTime, 'yyyy-MM-dd') === nextDay ? format(s.stopTime, 'HH:mm') : undefined,
                      };
                    });
                    setSessionRows(rowsForEdit);
                    setEditOpen(true);
                  };

                  return (
                    <motion.tr
                      key={user.id}
                      className={`${rowHighlight} ${isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div 
                          className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'} cursor-default relative group`}
                        >
                          {user.name.split(' ')[0]}
                          <div className={`absolute bottom-full left-0 mb-2 px-2 py-1 text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap ${
                            isDarkMode 
                              ? 'bg-slate-700 text-slate-200 border border-slate-600' 
                              : 'bg-slate-800 text-white border border-slate-600'
                          }`}>
                            {user.name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-28">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClass}`}>{statusLabel === 'completed' ? 'Completed' : statusLabel === 'on_break' ? 'On Break' : statusLabel === 'working' ? 'Working' : 'Not Working'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-24">
                        <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} flex flex-col gap-1`}>
                          {perSessionDisplay.length > 0 ? perSessionDisplay.map((s, i) => (
                            <span key={`ws-${i}`} className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>{s.startWork}</span>
                          )) : (
                            <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-24">
                        <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} flex flex-col gap-1`}>
                          {perSessionDisplay.length > 0 ? perSessionDisplay.map((s, i) => (
                            <div key={`bs-${i}`} className="flex flex-col gap-1">
                              {Array.isArray(s.startBreaks) && s.startBreaks.length > 0 ? s.startBreaks.map((time, j) => (
                                <span key={`bs-${i}-${j}`} className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>{time}</span>
                              )) : (
                                <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                              )}
                            </div>
                          )) : (
                            <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-24">
                        <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} flex flex-col gap-1`}>
                          {perSessionDisplay.length > 0 ? perSessionDisplay.map((s, i) => (
                            <div key={`bse-${i}`} className="flex flex-col gap-1">
                              {Array.isArray(s.stopBreaks) && s.stopBreaks.length > 0 ? s.stopBreaks.map((time, j) => (
                                <span key={`bse-${i}-${j}`} className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>{time}</span>
                              )) : (
                                <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                              )}
                            </div>
                          )) : (
                            <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-28">
                        <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} flex flex-col gap-1`}>
                          {perSessionDisplay.length > 0 ? perSessionDisplay.map((s, i) => (
                            <span key={`wst-${i}`} className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>{s.stopWorkToday}</span>
                          )) : (
                            <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                          )}
                        </div>
                      </td>
                      {isPastSelectedDay && (
                        <td className="px-6 py-4 whitespace-nowrap w-32">
                          <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} flex flex-col gap-1`}>
                            {perSessionDisplay.length > 0 ? perSessionDisplay.map((s, i) => (
                              <span key={`wsn-${i}`} className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>{s.stopWorkNext}</span>
                            )) : (
                              <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-1.5 py-0.5 inline-block text-center`}>—</span>
                            )}
                          </div>
                        </td>
                      )}
                      {/* Stop Work (Prev Day) temporarily hidden */}
                      <td className="px-6 py-4 whitespace-nowrap w-36">
                        <div className={`text-sm font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{displayWorkHours}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-32">
                        <div className={`text-sm ${isDarkMode ? 'text-orange-400' : 'text-orange-600'} flex items-center gap-2`}>
                          {displayBreakHours}
                          {showBreakWarning && (
                            <span className={`${isDarkMode ? 'text-orange-300' : 'text-orange-600'}`} title="This user may have forgotten to stop break (over 1.5 hours)">⚠️</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap w-20">
                        <button
                          onClick={handleOpenEdit}
                          className={`p-2 rounded-md ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
                          title="Edit entries"
                          disabled={!hasAnyToday}
                        >
                          <Edit2 size={18} />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
      {editOpen && editingUser && (
        <EditTimesModal
          isDarkMode={isDarkMode}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          user={editingUser}
          selectedDate={selectedDate}
          saving={saving}
          sessionRows={sessionRows}
          setSessionRows={setSessionRows}
          refreshAfterPartialSave={refreshUsers}
          onSave={async () => {
            if (!editingUser) return;
            try {
              setSaving(true);
              await refreshUsers();
              setEditOpen(false);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
};

export default AdminDailyOverview;


// Local modal for editing times
function EditTimesModal(props: {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  user: User;
  selectedDate: string;
  saving: boolean;
  onSave: () => Promise<void>;
  sessionRows?: Array<{
    startIdx: number;
    stopTodayIdx?: number;
    stopNextIdx?: number;
    startBreakIdx?: number;
    stopBreakIdx?: number;
    startWork?: string;
    startBreak?: string;
    stopBreak?: string;
    stopWorkToday?: string;
    stopWorkNext?: string;
  }>;
  setSessionRows?: React.Dispatch<React.SetStateAction<Array<{
    startIdx: number;
    stopTodayIdx?: number;
    stopNextIdx?: number;
    startBreakIdx?: number;
    stopBreakIdx?: number;
    startWork?: string;
    startBreak?: string;
    stopBreak?: string;
    stopWorkToday?: string;
    stopWorkNext?: string;
  }>>>;
  refreshAfterPartialSave?: () => Promise<void>;
}) {
  const { isDarkMode, isOpen, onClose, user, selectedDate, sessionRows = [], setSessionRows, refreshAfterPartialSave } = props;
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const inputClass = `border rounded-md px-3 py-2 text-sm ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`;
  // labelClass removed after simplifying modal
  const helpClass = `text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Times - ${user.name} (${selectedDate})`} size="sm">
      <div className="space-y-4">
        {/* Aligned session editor mirroring table columns */}
        <div className="space-y-2">
          <div className={`text-sm font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Sessions (aligned with table)</div>
          {sessionRows.length === 0 ? (
            <div className={helpClass}>No sessions found for this day</div>
          ) : (
            <div className="space-y-6">
              {sessionRows.map((r, i) => (
                <div key={`sr-${r.startIdx}-${r.stopTodayIdx ?? r.stopNextIdx ?? 'open'}`} className={`${isDarkMode ? 'bg-slate-700/40' : 'bg-slate-50'} rounded-md p-3 space-y-3`}>
                  <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Session {i + 1}</div>

                  {/* Start Work */}
                  <div className="flex items-center gap-2">
                    <label className={`w-44 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Start Work</label>
                    <input type="time" className={`${inputClass} w-full`} value={r.startWork || ''} onChange={e => setSessionRows && setSessionRows(prev => prev.map((p, pi) => pi === i ? { ...p, startWork: e.target.value } : p))} />
                    <button className={`h-9 px-3 text-xs rounded shrink-0 ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`} disabled={!r.startWork || savingKey === `sw-${i}`} onClick={async () => {
                      if (!r.startWork) return;
                      setSavingKey(`sw-${i}`);
                      const [y, m, d] = selectedDate.split('-').map(Number);
                      const [hh, mm] = r.startWork.split(':').map(Number);
                      await updateAttendanceEntry(user.id, r.startIdx, { timestamp: new Date(y, m - 1, d, hh, mm, 0, 0), type: 'START_WORK' } as AttendanceEntry);
                      if (refreshAfterPartialSave) { await refreshAfterPartialSave(); }
                      setSavingKey(null);
                    }}>{savingKey === `sw-${i}` ? 'Saving...' : 'Save'}</button>
                  </div>

                  {/* Start Break */}
                  <div className="flex items-center gap-2">
                    <label className={`w-44 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Start Break</label>
                    {r.startBreakIdx === undefined ? (
                      <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-3 py-2 text-center w-full`}>—</span>
                    ) : (
                      <input type="time" className={`${inputClass} w-full`} value={r.startBreak || ''} onChange={e => setSessionRows && setSessionRows(prev => prev.map((p, pi) => pi === i ? { ...p, startBreak: e.target.value } : p))} />
                    )}
                    <button disabled={r.startBreakIdx === undefined || !r.startBreak || savingKey === `sbr-${i}`} className={`h-9 px-3 text-xs rounded shrink-0 ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`} onClick={async () => {
                      if (r.startBreakIdx === undefined || !r.startBreak) return;
                      setSavingKey(`sbr-${i}`);
                      const [y, m, d] = selectedDate.split('-').map(Number);
                      const [hh, mm] = r.startBreak.split(':').map(Number);
                      await updateAttendanceEntry(user.id, r.startBreakIdx, { timestamp: new Date(y, m - 1, d, hh, mm, 0, 0), type: 'START_BREAK' } as AttendanceEntry);
                      if (refreshAfterPartialSave) { await refreshAfterPartialSave(); }
                      setSavingKey(null);
                    }}>{savingKey === `sbr-${i}` ? 'Saving...' : 'Save'}</button>
                  </div>

                  {/* Stop Break */}
                  <div className="flex items-center gap-2">
                    <label className={`w-44 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Stop Break</label>
                    {r.stopBreakIdx === undefined ? (
                      <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-3 py-2 text-center w-full`}>—</span>
                    ) : (
                      <input type="time" className={`${inputClass} w-full`} value={r.stopBreak || ''} onChange={e => setSessionRows && setSessionRows(prev => prev.map((p, pi) => pi === i ? { ...p, stopBreak: e.target.value } : p))} />
                    )}
                    <button disabled={r.stopBreakIdx === undefined || !r.stopBreak || savingKey === `ebr-${i}`} className={`h-9 px-3 text-xs rounded shrink-0 ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`} onClick={async () => {
                      if (r.stopBreakIdx === undefined || !r.stopBreak) return;
                      setSavingKey(`ebr-${i}`);
                      const [y, m, d] = selectedDate.split('-').map(Number);
                      const [hh, mm] = r.stopBreak.split(':').map(Number);
                      await updateAttendanceEntry(user.id, r.stopBreakIdx, { timestamp: new Date(y, m - 1, d, hh, mm, 0, 0), type: 'STOP_BREAK' } as AttendanceEntry);
                      if (refreshAfterPartialSave) { await refreshAfterPartialSave(); }
                      setSavingKey(null);
                    }}>{savingKey === `ebr-${i}` ? 'Saving...' : 'Save'}</button>
                  </div>

                  {/* Stop Work (Today) */}
                  <div className="flex items-center gap-2">
                    <label className={`w-44 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Stop Work (Today)</label>
                    {r.stopTodayIdx === undefined ? (
                      <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-3 py-2 text-center w-full`}>—</span>
                    ) : (
                      <input type="time" className={`${inputClass} w-full`} value={r.stopWorkToday || ''} onChange={e => setSessionRows && setSessionRows(prev => prev.map((p, pi) => pi === i ? { ...p, stopWorkToday: e.target.value } : p))} />
                    )}
                    <button disabled={r.stopTodayIdx === undefined || !r.stopWorkToday || savingKey === `swt-${i}`} className={`h-9 px-3 text-xs rounded shrink-0 ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`} onClick={async () => {
                      if (r.stopTodayIdx === undefined || !r.stopWorkToday) return;
                      setSavingKey(`swt-${i}`);
                      const [y, m, d] = selectedDate.split('-').map(Number);
                      const [hh, mm] = r.stopWorkToday.split(':').map(Number);
                      await updateAttendanceEntry(user.id, r.stopTodayIdx, { timestamp: new Date(y, m - 1, d, hh, mm, 0, 0), type: 'STOP_WORK' } as AttendanceEntry);
                      if (refreshAfterPartialSave) { await refreshAfterPartialSave(); }
                      setSavingKey(null);
                    }}>{savingKey === `swt-${i}` ? 'Saving...' : 'Save'}</button>
                  </div>

                  {/* Stop Work (Next Day) */}
                  <div className="flex items-center gap-2">
                    <label className={`w-44 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Stop Work (Next Day)</label>
                    {r.stopNextIdx === undefined ? (
                      <span className={`${isDarkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'} rounded px-3 py-2 text-center w-full`}>—</span>
                    ) : (
                      <input type="time" className={`${inputClass} w-full`} value={r.stopWorkNext || ''} onChange={e => setSessionRows && setSessionRows(prev => prev.map((p, pi) => pi === i ? { ...p, stopWorkNext: e.target.value } : p))} />
                    )}
                    <button disabled={r.stopNextIdx === undefined || !r.stopWorkNext || savingKey === `swn-${i}`} className={`h-9 px-3 text-xs rounded shrink-0 ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`} onClick={async () => {
                      if (r.stopNextIdx === undefined || !r.stopWorkNext) return;
                      setSavingKey(`swn-${i}`);
                      const [y, m, d] = selectedDate.split('-').map(Number);
                      const [hh, mm] = r.stopWorkNext.split(':').map(Number);
                      await updateAttendanceEntry(user.id, r.stopNextIdx, { timestamp: new Date(y, m - 1, d + 1, hh, mm, 0, 0), type: 'STOP_WORK' } as AttendanceEntry);
                      if (refreshAfterPartialSave) { await refreshAfterPartialSave(); }
                      setSavingKey(null);
                    }}>{savingKey === `swn-${i}` ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

