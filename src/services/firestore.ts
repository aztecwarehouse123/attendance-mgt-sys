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
import { User, AttendanceRecord, AttendanceEntry, HolidayRequest } from '../types';

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
        timestamp: entry.timestamp && typeof (entry.timestamp as any).toDate === 'function'
          ? (entry.timestamp as any).toDate()
          : new Date(entry.timestamp)
      }))
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
          timestamp: entry.timestamp && typeof (entry.timestamp as any).toDate === 'function'
            ? (entry.timestamp as any).toDate()
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
  attendanceEntry: { timestamp: Date; type: 'IN' | 'OUT' },
  newAmount?: number
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const updatedLog = [...(userData.attendanceLog || []), attendanceEntry];
      
      const updateData: {
        attendanceLog: { timestamp: Date; type: 'IN' | 'OUT' }[];
        amount?: number;
      } = {
        attendanceLog: updatedLog
      };
      
      if (newAmount !== undefined) {
        updateData.amount = newAmount;
      }
      
      await updateDoc(userRef, updateData);
    }
  } catch (error) {
    console.error('Error updating user attendance:', error);
  }
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
  startDate?: Date,
  endDate?: Date,
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