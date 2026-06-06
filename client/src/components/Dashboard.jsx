import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
    } else {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      } catch (e) {
        console.error('Error parsing user data:', e);
        localStorage.removeItem('user');
        navigate('/');
      }
    }
    setLoading(false);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  const quickActions = [
    { path: '/search', icon: '🔍', title: 'Transaction Search', desc: 'Search your transactions' },
    { path: '/comments', icon: '💬', title: 'Customer Feedback', desc: 'Share your experience' },
    { path: '/download', icon: '📄', title: 'Document Center', desc: 'Download statements' },
    { path: '/session', icon: '🔐', title: 'API Management', desc: 'Manage API keys' },
    { path: '/transactions', icon: '💰', title: 'Transaction History', desc: 'View all transactions' },
    { path: '/analytics', icon: '📊', title: 'Financial Analytics', desc: 'View spending patterns' }
  ];

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">Loading dashboard...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="dashboard-container">
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-content">
          <h1>Welcome back, {user.full_name || user.username}!</h1>
          <p>Here's your financial overview at SecureBank</p>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          🚪 Logout
        </button>
      </div>

      {/* Balance Card */}
      <div className="balance-card">
        <div className="balance-header">
          <span className="balance-icon">💰</span>
          <span className="balance-label">Total Balance</span>
        </div>
        <div className="balance-amount">
          ${(user.account_balance || 15420.50).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="balance-details">
          <span>Account: {user.account_number || 'ACC10001'}</span>
          <span>Type: {user.account_type || 'Premium'}</span>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="quick-actions-section">
        <h2>Quick Actions</h2>
        <div className="quick-actions-grid">
          {quickActions.map((action, index) => (
            <div 
              key={index}
              className="action-card"
              onClick={() => navigate(action.path)}
            >
              <div className="action-icon">{action.icon}</div>
              <div className="action-info">
                <h3>{action.title}</h3>
                <p>{action.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Preview */}
      <div className="recent-activity-section">
        <h2>Recent Activity</h2>
        <div className="activity-placeholder">
          <p>📊 View your <button onClick={() => navigate('/analytics')} className="link-btn">Financial Analytics</button> for detailed insights</p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="security-notice">
        <div className="notice-icon">⚠️</div>
        <div className="notice-content">
          <strong>Security Notice:</strong> This is a honeypot banking system. All activities are monitored for security research.
        </div>
      </div>
    </div>
  );
}

export default Dashboard;