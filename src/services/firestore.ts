import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { User, AttendanceRecord, AttendanceEntry, HolidayRequest, UserState } from '../types';

export const getUserBySecretCode = async (secretCode: string): Promise<User | null> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('secretCode', '==', secretCode));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();
    
    return {
      id: userDoc.id,
      name: userData.name,
      secretCode: userData.secretCode,
      amount: userData.amount || 0,
      hourlyRate: userData.hourlyRate || 15,
      attendanceLog: (userData.attendanceLog || []).map((entry: AttendanceEntry) => ({
        ...entry,
        timestamp: entry.timestamp && typeof (entry.timestamp as unknown as { toDate?: () => Date }).toDate === 'function'
          ? (entry.timestamp as unknown as { toDate: () => Date }).toDate()
          : new Date(entry.timestamp)
      })),
      currentState: userData.currentState ? {
        isWorking: userData.currentState.isWorking || false,
        isOnBreak: userData.currentState.isOnBreak || false,
        lastAction: userData.currentState.lastAction || null,
        lastWorkStart: userData.currentState.lastWorkStart ? 
          (userData.currentState.lastWorkStart.toDate ? userData.currentState.lastWorkStart.toDate() : new Date(userData.currentState.lastWorkStart as string)) : undefined,
        lastBreakStart: userData.currentState.lastBreakStart ? 
          (userData.currentState.lastBreakStart.toDate ? userData.currentState.lastBreakStart.toDate() : new Date(userData.currentState.lastBreakStart as string)) : undefined,
        lastActionTime: userData.currentState.lastActionTime ? 
          (userData.currentState.lastActionTime.toDate ? userData.currentState.lastActionTime.toDate() : new Date(userData.currentState.lastActionTime as string)) : undefined
      } : undefined
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

export const getAllUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        secretCode: data.secretCode || '',
        amount: data.amount || 0,
        hourlyRate: data.hourlyRate || 15,
        attendanceLog: (data.attendanceLog || []).map((entry: AttendanceEntry) => ({
          ...entry,
          timestamp: entry.timestamp && typeof (entry.timestamp as unknown as { toDate?: () => Date }).toDate === 'function'
            ? (entry.timestamp as unknown as { toDate: () => Date }).toDate()
            : new Date(entry.timestamp)
        }))
      } as User;
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
};

export const createUser = async (userData: Omit<User, 'id'>): Promise<string> => {
  try {
    const usersRef = collection(db, 'users');
    const docRef = await addDoc(usersRef, {
      ...userData,
      amount: userData.amount || 0,
      attendanceLog: userData.attendanceLog || []
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateUserAttendance = async (
  userId: string, 
  attendanceEntry: { timestamp: Date; type: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK' },
  newAmount?: number,
  newState?: UserState
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const updatedLog = [...(userData.attendanceLog || []), attendanceEntry];
      
      const updateData: {
        attendanceLog: { timestamp: Date; type: 'START_WORK' | 'START_BREAK' | 'STOP_BREAK' | 'STOP_WORK' }[];
        amount?: number;
        currentState?: UserState;
      } = {
        attendanceLog: updatedLog
      };
      
      if (newAmount !== undefined) {
        updateData.amount = newAmount;
      }
      
      // Always ensure currentState exists - calculate it if not provided or missing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let stateToSave: any;
      if (newState !== undefined) {
        // Use provided state
        stateToSave = {
          isWorking: newState.isWorking,
          isOnBreak: newState.isOnBreak,
          lastAction: newState.lastAction
        };
        
        if (newState.lastWorkStart) {
          stateToSave.lastWorkStart = Timestamp.fromDate(newState.lastWorkStart);
        }
        if (newState.lastBreakStart) {
          stateToSave.lastBreakStart = Timestamp.fromDate(newState.lastBreakStart);
        }
        if (newState.lastActionTime) {
          stateToSave.lastActionTime = Timestamp.fromDate(newState.lastActionTime);
        }
      } else if (!userData.currentState) {
        // Auto-migrate: Calculate currentState from attendance log if it doesn't exist
        const calculatedState = calculateUserState(updatedLog);
        stateToSave = {
          isWorking: calculatedState.isWorking,
          isOnBreak: calculatedState.isOnBreak,
          lastAction: calculatedState.lastAction
        };
        
        if (calculatedState.lastWorkStart) {
          stateToSave.lastWorkStart = Timestamp.fromDate(calculatedState.lastWorkStart);
        }
        if (calculatedState.lastBreakStart) {
          stateToSave.lastBreakStart = Timestamp.fromDate(calculatedState.lastBreakStart);
        }
        if (calculatedState.lastActionTime) {
          stateToSave.lastActionTime = Timestamp.fromDate(calculatedState.lastActionTime);
        }
      }
      
      if (stateToSave) {
        updateData.currentState = stateToSave;
      }
      
      await updateDoc(userRef, updateData);
    }
  } catch (error) {
    console.error('Error updating user attendance:', error);
    throw error;
  }
};

// Helper function to calculate user state from attendance log
export const calculateUserState = (attendanceLog: AttendanceEntry[]): UserState => {
  if (attendanceLog.length === 0) {
    return {
      isWorking: false,
      isOnBreak: false,
      lastAction: null
    };
  }

  // Sort by timestamp to get the latest entries
  const sortedLog = [...attendanceLog].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const lastEntry = sortedLog[0];

  // Find the most recent work start and break start
  let lastWorkStart: Date | undefined;
  let lastBreakStart: Date | undefined;

  // Since sortedLog is already sorted by timestamp descending, we can find the most recent ones
  for (const entry of sortedLog) {
    if (entry.type === 'START_WORK' && !lastWorkStart) {
      lastWorkStart = entry.timestamp;
    }
    if (entry.type === 'START_BREAK' && !lastBreakStart) {
      lastBreakStart = entry.timestamp;
    }
  }

  // Determine current state based on last action
  let isWorking = false;
  let isOnBreak = false;

  switch (lastEntry.type) {
    case 'START_WORK':
      isWorking = true;
      isOnBreak = false;
      break;
    case 'START_BREAK':
      isWorking = false;
      isOnBreak = true;
      break;
    case 'STOP_BREAK':
      isWorking = true;
      isOnBreak = false;
      break;
    case 'STOP_WORK':
      isWorking = false;
      isOnBreak = false;
      break;
  }

  return {
    isWorking,
    isOnBreak,
    lastWorkStart,
    lastBreakStart,
    lastAction: lastEntry.type,
    lastActionTime: lastEntry.timestamp
  };
};

export const createAttendanceRecord = async (record: Omit<AttendanceRecord, 'id'>): Promise<void> => {
  try {
    const attendanceRef = collection(db, 'attendanceRecords');
    await addDoc(attendanceRef, {
      ...record,
      timestamp: Timestamp.fromDate(record.timestamp)
    });
  } catch (error) {
    console.error('Error creating attendance record:', error);
  }
};

export const getAttendanceRecords = async (
  _startDate?: Date,
  _endDate?: Date,
  userId?: string
): Promise<AttendanceRecord[]> => {
  try {
    const attendanceRef = collection(db, 'attendanceRecords');
    let q = query(attendanceRef, orderBy('timestamp', 'desc'));
    
    if (userId) {
      q = query(q, where('userId', '==', userId));
    }
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp.toDate()
      };
    }) as AttendanceRecord[];
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
  }
};

export const updateUser = async (
  userId: string,
  updates: { name?: string; secretCode?: string; hourlyRate?: number; amount?: number }
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, updates);
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteUser = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

// Holiday Request Functions
export const createHolidayRequest = async (request: Omit<HolidayRequest, 'id' | 'submittedAt'>): Promise<string> => {
  try {
    const requestsRef = collection(db, 'holidayRequests');
    const docRef = await addDoc(requestsRef, {
      ...request,
      submittedAt: Timestamp.fromDate(new Date())
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating holiday request:', error);
    throw error;
  }
};

export const getAllHolidayRequests = async (): Promise<HolidayRequest[]> => {
  try {
    const requestsRef = collection(db, 'holidayRequests');
    const q = query(requestsRef, orderBy('submittedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        submittedAt: data.submittedAt.toDate(),
        reviewedAt: data.reviewedAt ? data.reviewedAt.toDate() : undefined
      };
    }) as HolidayRequest[];
  } catch (error) {
    console.error('Error fetching holiday requests:', error);
    return [];
  }
};

export const getHolidayRequestsBySecretCode = async (secretCode: string): Promise<HolidayRequest[]> => {
  try {
    const requestsRef = collection(db, 'holidayRequests');
    // First try with just the secretCode filter
    const q = query(requestsRef, where('secretCode', '==', secretCode));
    const querySnapshot = await getDocs(q);
    
    const requests = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        submittedAt: data.submittedAt.toDate(),
        reviewedAt: data.reviewedAt ? data.reviewedAt.toDate() : undefined
      };
    }) as HolidayRequest[];
    
    // Sort by submittedAt in descending order
    return requests.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  } catch (error) {
    console.error('Error fetching holiday requests by secret code:', error);
    return [];
  }
};

export const updateHolidayRequestStatus = async (
  requestId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  adminNotes?: string
): Promise<void> => {
  try {
    const requestRef = doc(db, 'holidayRequests', requestId);
    await updateDoc(requestRef, {
      status,
      reviewedBy,
      reviewedAt: Timestamp.fromDate(new Date()),
      adminNotes: adminNotes || ''
    });
  } catch (error) {
    console.error('Error updating holiday request status:', error);
    throw error;
  }
};

// Functions for editing and deleting attendance entries
export const updateAttendanceEntry = async (
  userId: string,
  entryIndex: number,
  newEntry: AttendanceEntry
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const attendanceLog = userData.attendanceLog || [];
      
      // Update the specific entry
      const updatedLog = [...attendanceLog];
      updatedLog[entryIndex] = {
        timestamp: Timestamp.fromDate(newEntry.timestamp),
        type: newEntry.type
      };
      
      await updateDoc(userRef, {
        attendanceLog: updatedLog
      });
    }
  } catch (error) {
    console.error('Error updating attendance entry:', error);
    throw error;
  }
};

export const deleteAttendanceEntry = async (
  userId: string,
  entryIndex: number
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const attendanceLog = userData.attendanceLog || [];
      
      // Remove the specific entry
      const updatedLog = attendanceLog.filter((_: AttendanceEntry, index: number) => index !== entryIndex);
      
      await updateDoc(userRef, {
        attendanceLog: updatedLog
      });
    }
  } catch (error) {
    console.error('Error deleting attendance entry:', error);
    throw error;
  }
};