import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) navigate('/');
    else setUser(JSON.parse(userData));
  }, [navigate]);

  if (!user) return <div className="login-container">Loading...</div>;

  return (
    <div className="dashboard-container">
      <div className="balance-card">
        <h2>Welcome, {user.full_name}!</h2>
        <div className="balance-amount">${user.account_balance || '15,420.50'}</div>
      </div>
      <div className="quick-actions-grid">
        <div className="action-card" onClick={() => navigate('/search')}>🔍 Search</div>
        <div className="action-card" onClick={() => navigate('/comments')}>💬 Comments</div>
        <div className="action-card" onClick={() => navigate('/download')}>📄 Download</div>
        <div className="action-card" onClick={() => navigate('/session')}>🔐 Session</div>
        <div className="action-card" onClick={() => navigate('/soc')}>📊 SOC</div>
      </div>
    </div>
  );
}

export default Dashboard;
