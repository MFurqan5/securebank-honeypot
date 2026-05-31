import React from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Search from './components/Search';
import Comments from './components/Comments';
import Download from './components/Download';
import Session from './components/Session';
import SocDashboard from './components/SocDashboard';
import UserManagement from './components/UserManagement';
import Transactions from './components/Transactions';
import Analytics from './components/Analytics';
import './App.css';

function ProtectedRoute({ children, allowedRoles = [] }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const location = useLocation();
  
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoginPage = location.pathname === '/';

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  // Don't show navbar on login page
  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="App">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand" onClick={() => navigate('/dashboard')}>
            <span className="brand-icon">🔒</span>
            <span className="brand-text">SecureBank</span>
          </div>
          
          <div className="nav-links">
            <Link to="/dashboard">
              <span className="nav-icon">📊</span> Dashboard
            </Link>
            <Link to="/transactions">
              <span className="nav-icon">💰</span> Transactions
            </Link>
            {(user?.role === 'admin' || user?.role === 'teller') && (
              <Link to="/users">
                <span className="nav-icon">👥</span> Users
              </Link>
            )}
            <Link to="/analytics">
              <span className="nav-icon">📈</span> Analytics
            </Link>
            <Link to="/search">
              <span className="nav-icon">🔍</span> Search
            </Link>
            <Link to="/comments">
              <span className="nav-icon">💬</span> Comments
            </Link>
            <Link to="/download">
              <span className="nav-icon">📄</span> Download
            </Link>
            <Link to="/session">
              <span className="nav-icon">🔐</span> Session
            </Link>
            <Link to="/soc">
              <span className="nav-icon">🛡️</span> SOC
            </Link>
            <button onClick={handleLogout} className="logout-btn">
              <span className="nav-icon">🚪</span> Logout
            </button>
          </div>
          
          <div className="user-info">
            <span className="user-avatar">👤</span>
            <span className="user-name">{user?.full_name || user?.username}</span>
            <span className={`user-role role-${user?.role}`}>{user?.role}</span>
          </div>
        </div>
      </nav>
      
      <Routes>
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/transactions" element={
          <ProtectedRoute>
            <Transactions />
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute allowedRoles={['admin', 'teller']}>
            <UserManagement />
          </ProtectedRoute>
        } />
        <Route path="/analytics" element={
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        } />
        <Route path="/search" element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        } />
        <Route path="/comments" element={
          <ProtectedRoute>
            <Comments />
          </ProtectedRoute>
        } />
        <Route path="/download" element={
          <ProtectedRoute>
            <Download />
          </ProtectedRoute>
        } />
        <Route path="/session" element={
          <ProtectedRoute>
            <Session />
          </ProtectedRoute>
        } />
        <Route path="/soc" element={
          <ProtectedRoute>
            <SocDashboard />
          </ProtectedRoute>
        } />
      </Routes>
    </div>
  );
}

export default App;
