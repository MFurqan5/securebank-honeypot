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
        <div className="action-card" onClick={() => navigate('/search')}>🔍 ATM & Branch Search</div>
        <div className="action-card" onClick={() => navigate('/comments')}>💬 Customer Feedback</div>
        <div className="action-card" onClick={() => navigate('/download')}>📄 e-Statements Manager</div>
        <div className="action-card" onClick={() => navigate('/session')}>🔐 API & Security Keys</div>
      </div>
    </div>
  );
}

export default Dashboard;
