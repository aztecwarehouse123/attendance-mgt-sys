import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const AdminSettings: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [name, setName] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchAdmin = async () => {
      setLoading(true);
      try {
        const adminRef = doc(db, 'users', 'admin');
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          const data = adminSnap.data();
          setName(data.name || '');
          setSecretCode(data.secretCode || '');
        } else {
          setError('Admin profile not found.');
        }
      } catch {
        setError('Failed to fetch admin profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchAdmin();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim() || !secretCode.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (secretCode.length !== 8) {
      setError('Secret code must be exactly 8 digits.');
      return;
    }
    setSaving(true);
    try {
      const adminRef = doc(db, 'users', 'admin');
      await updateDoc(adminRef, { name: name.trim(), secretCode: secretCode.trim() });
      setSuccess('Profile updated successfully!');
    } catch {
      setError('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`max-w-lg mx-auto mt-8 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-lg shadow p-8 border`}>
      <h2 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Admin Settings</h2>
      {loading ? (
        <div className="text-center py-8">
          <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${isDarkMode ? 'border-blue-400' : 'border-blue-600'}`}></div>
          <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Loading...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20' : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'}`}
              placeholder="Enter your name"
              required
            />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Secret Code</label>
            <input
              type="text"
              value={secretCode}
              onChange={e => setSecretCode(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${isDarkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-blue-400/20' : 'border-slate-300 text-slate-800 placeholder-slate-500 focus:ring-blue-500'}`}
              placeholder="8-digit code"
              maxLength={8}
              required
            />
          </div>
          {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`p-3 rounded-md ${isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800'}`}>{error}</motion.div>}
          {success && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`p-3 rounded-md ${isDarkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800'}`}>{success}</motion.div>}
          <div className="flex justify-end">
            <motion.button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </motion.button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AdminSettings; 