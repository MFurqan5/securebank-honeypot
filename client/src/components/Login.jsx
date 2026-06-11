import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// Vite uses import.meta.env instead of process.env
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Check if already logged in
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    
    try {
      // With proxy configured, you can use relative URL
      const response = await axios.post('/api/login', { username, password });
      
      if (response.data.success) {
        // Store user data
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        setMessage({ 
          type: 'success', 
          text: 'Login successful! Redirecting...'
        });
        
        setTimeout(() => navigate('/dashboard'), 1000);
      } else {
        setMessage({ 
          type: 'error', 
          text: response.data.message || 'Login failed. Invalid credentials.'
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Login failed. Please check your credentials.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sqlInjectionExamples = [
    { name: "Bypass Login (Auth)", value: "admin' OR '1'='1'--" },
    { name: "Bypass with OR", value: "' OR 1=1--" },
    { name: "Union Attack", value: "' UNION SELECT null, null, null, null, null--" },
    { name: "Comment Injection", value: "admin'/**/--" }
  ];

  const testAccounts = [
    { username: 'admin', password: 'admin', role: 'Admin', full_name: 'System Administrator' },
    { username: 'john_doe', password: 'password123', role: 'Customer', full_name: 'John Doe' },
    { username: 'jane_smith', password: 'qwerty456', role: 'Customer', full_name: 'Jane Smith' },
    { username: 'testuser', password: 'testpass', role: 'Customer', full_name: 'Test User' }
  ];

  const fillCredentials = (acc) => {
    setUsername(acc.username);
    setPassword(acc.password);
    setMessage({ type: 'info', text: `Test account loaded: ${acc.full_name}` });
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">🔒</span>
            <span className="logo-text">SecureBank</span>
          </div>
          <p className="tagline">Enterprise Banking Platform</p>
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
              autoComplete="off"
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
          <button type="submit" disabled={isLoading} className="login-btn">
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        {message && (
          <div className={`message ${message.type}`}>
            {message.type === 'error' && '❌ '}
            {message.type === 'success' && '✅ '}
            {message.type === 'info' && 'ℹ️ '}
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;