import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import CodeEntry from './components/CodeEntry';
import AdminLayout from './components/admin/AdminLayout';
import AdminMain from './components/admin/AdminMain';
import AdminReports from './components/admin/AdminReports';
import AdminSettings from './components/admin/AdminSettings';
import AdminHolidayRequests from './components/admin/AdminHolidayRequests';
import AttendanceDetail from './components/admin/AttendanceDetail';
import CurrentlyWorking from './components/admin/CurrentlyWorking';
import AdminLogs from './components/admin/AdminLogs';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<CodeEntry />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminMain />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="holiday-requests" element={<AdminHolidayRequests />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="attendance-detail" element={<AttendanceDetail />} />
            <Route path="currently-working" element={<CurrentlyWorking />} />
            <Route path="logs" element={<AdminLogs />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
