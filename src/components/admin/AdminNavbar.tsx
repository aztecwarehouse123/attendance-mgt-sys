import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, BarChart3, LogOut, Settings } from 'lucide-react';

const AdminNavbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/');
  };

  return (
    <nav className="bg-white shadow-lg fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <Settings className="text-blue-600 w-8 h-8" />
              <span className="text-xl font-bold text-gray-800">Admin Dashboard</span>
            </div>
            
            <div className="flex space-x-4">
              <Link
                to="/admin"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/admin'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="font-medium">Main</span>
              </Link>
              
              <Link
                to="/admin/reports"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/admin/reports'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <BarChart3 className="w-5 h-5" />
                <span className="font-medium">Reports</span>
              </Link>
              <Link
                to="/admin/attendance-detail"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/admin/attendance-detail'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="font-medium">Attendance Detail</span>
              </Link>
              <Link
                to="/admin/currently-working"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === '/admin/currently-working'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="font-medium">Currently Working</span>
              </Link>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default AdminNavbar;