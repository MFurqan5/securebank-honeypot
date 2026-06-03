import React from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Search from './components/Search';
import Comments from './components/Comments';
import Download from './components/Download';
import Session from './components/Session';
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

  const pendingActionsRef = React.useRef([]);

  // Client-side session ID setup & global telemetry logs (Zero UI lag & optimized DB writes)
  React.useEffect(() => {
    let sid = localStorage.getItem('session_id');
    if (!sid) {
      sid = 'sess_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('session_id', sid);
    }
    
    // Set axios base URL and header globally for API requests
    axios.defaults.baseURL = 'http://localhost:5000';
    axios.defaults.headers.common['x-session-id'] = sid;

    // Log click event listener with parent element traversal for nested links/spans
    const handleGlobalClick = (e) => {
      let target = e.target;
      let label = '';
      let tag = '';
      let classes = '';
      
      // Attempt to resolve closest interactive button/link/card label
      let current = target;
      let depth = 0;
      let foundInteractive = false;
      while (current && depth < 3) {
        const hasClass = current.className && typeof current.className === 'string';
        if (
          current.tagName === 'BUTTON' || 
          current.tagName === 'A' ||
          (hasClass && (
            current.className.includes('action-card') || 
            current.className.includes('account') || 
            current.className.includes('example-btn') ||
            current.className.includes('nav-links') ||
            current.className.includes('logout-btn')
          ))
        ) {
          label = current.innerText || current.value || current.name || '';
          tag = current.tagName;
          classes = hasClass ? current.className : '';
          foundInteractive = true;
          break;
        }
        current = current.parentNode;
        depth++;
      }

      // If no interactive element found, capture raw click details
      if (!foundInteractive && target) {
        label = target.innerText?.trim() || target.value || target.name || '';
        tag = target.tagName;
        classes = target.className && typeof target.className === 'string' ? target.className : '';
      }

      pendingActionsRef.current.push({
        type: 'click',
        tag: tag,
        class: classes.substring(0, 100),
        label: label.trim().substring(0, 50) || 'Raw Click',
        x: e.clientX,
        y: e.clientY,
        timestamp: new Date().toISOString()
      });
    };

    // Log text selection highlights
    const handleSelectionEnd = () => {
      const selection = window.getSelection().toString().trim();
      if (selection && selection.length > 0) {
        pendingActionsRef.current.push({
          type: 'select',
          text: selection.substring(0, 100),
          timestamp: new Date().toISOString()
        });
      }
    };

    // Log copy events
    const handleCopy = () => {
      const selection = window.getSelection().toString().trim();
      pendingActionsRef.current.push({
        type: 'copy',
        text: selection.substring(0, 100),
        timestamp: new Date().toISOString()
      });
    };

    // Log paste events
    const handlePaste = (e) => {
      const pastedText = e.clipboardData ? e.clipboardData.getData('text') : '';
      const target = e.target;
      pendingActionsRef.current.push({
        type: 'paste',
        text: pastedText.substring(0, 100),
        target: target.tagName + (target.id ? `#${target.id}` : ''),
        timestamp: new Date().toISOString()
      });
    };

    // Log input modifications on losing focus
    const handleBlur = (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const value = target.type === 'password' ? '••••••••' : target.value;
        pendingActionsRef.current.push({
          type: 'input_change',
          field: target.placeholder || target.name || target.id || target.tagName,
          value: value.substring(0, 100),
          timestamp: new Date().toISOString()
        });
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('mouseup', handleSelectionEnd);
    window.addEventListener('keyup', handleSelectionEnd);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('blur', handleBlur, true);

    // Sync memory logs with database every 1 second (real-time honeypot logging)
    const syncTimer = setInterval(() => {
      if (pendingActionsRef.current.length === 0) return;
      const payload = [...pendingActionsRef.current];
      pendingActionsRef.current = []; // Clear current batch

      axios.post('/api/soc/replay', {
        sessionId: sid,
        actions: payload
      }).catch((err) => {
        // Restore logs in buffer if transmission failed
        pendingActionsRef.current = [...payload, ...pendingActionsRef.current];
      });
    }, 1000);

    // Emergency flush on tab closure
    const handleUnload = () => {
      if (pendingActionsRef.current.length === 0) return;
      const data = JSON.stringify({
        sessionId: sid,
        actions: pendingActionsRef.current
      });
      navigator.sendBeacon('/api/soc/replay', new Blob([data], { type: 'application/json' }));
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('mouseup', handleSelectionEnd);
      window.removeEventListener('keyup', handleSelectionEnd);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('blur', handleBlur, true);
      window.removeEventListener('beforeunload', handleUnload);
      clearInterval(syncTimer);
    };
  }, []);

  // Log page navigation changes
  React.useEffect(() => {
    const pageName = location.pathname === '/' ? 'Login Page' : location.pathname.substring(1).toUpperCase();
    pendingActionsRef.current.push({
      type: 'navigate',
      page: pageName,
      path: location.pathname,
      timestamp: new Date().toISOString()
    });
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  // Force login page first and hide navbar completely if not authenticated
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
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
              <span className="nav-icon">🔍</span> Branch Search
            </Link>
            <Link to="/comments">
              <span className="nav-icon">💬</span> Feedback
            </Link>
            <Link to="/download">
              <span className="nav-icon">📄</span> e-Statements
            </Link>
            <Link to="/session">
              <span className="nav-icon">🔐</span> Security Key
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
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
      </Routes>
    </div>
  );
}

export default App;
