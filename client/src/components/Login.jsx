import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = '';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Check if already logged in
  React.useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      const response = await axios.post(`${API_URL}/api/login`, { username, password });
      if (response.data.success) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setMessage({ type: 'success', text: 'Login successful! Redirecting...' });
        setTimeout(() => navigate('/dashboard'), 1000);
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Login failed. Invalid credentials.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sqlInjectionExamples = [
    { name: "Bypass Login", value: "admin' OR '1'='1'--" },
    { name: "Union Attack", value: "' UNION SELECT null, null, null, null, null--" },
    { name: "Comment Injection", value: "admin'--" }
  ];

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">🔒 SecureBank</div>
          <p className="tagline">Enterprise Banking Platform</p>
        </div>
        
        <div className="vuln-badge critical">
          ⚠️ SECURITY WARNING: This system is vulnerable to SQL Injection
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        {message && <div className={`message ${message.type}`}>{message.text}</div>}
        
        <div className="sql-test-section">
          <h4>🐍 SQL Injection Test Payloads</h4>
          <div className="example-buttons">
            {sqlInjectionExamples.map((ex, i) => (
              <button 
                key={i}
                className="example-btn"
                onClick={() => setUsername(ex.value)}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="test-accounts">
          <h4>📋 Test Accounts</h4>
          <div className="accounts-grid">
            <div className="account" onClick={() => { setUsername('admin'); setPassword('admin123'); }}>
              <strong>Admin</strong> admin / admin123
            </div>
            <div className="account" onClick={() => { setUsername('john_doe'); setPassword('password123'); }}>
              <strong>Customer</strong> john_doe / password123
            </div>
            <div className="account" onClick={() => { setUsername('jane_smith'); setPassword('qwerty456'); }}>
              <strong>Customer</strong> jane_smith / qwerty456
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
