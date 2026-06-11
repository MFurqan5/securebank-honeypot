import React, { useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [xssDetected, setXssDetected] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      setMessage('Please enter a search term');
      return;
    }
    
    setIsLoading(true);
    setXssDetected(false);
    
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const response = await axios.get(`${API_URL}/api/search`, {
        params: { q: query },
        headers: { 'x-user-id': user?.user_id || user?.id || 1 }
      });
      
      // Handle response format
      let searchResults = [];
      let searchMessage = '';
      
      if (response.data.results && response.data.results[0]) {
        searchResults = response.data.results[0].accounts || [];
        searchMessage = response.data.results[0].title || `Results for: ${query}`;
      } else if (response.data.data) {
        searchResults = response.data.data;
        searchMessage = `Found ${searchResults.length} results`;
      } else {
        searchResults = response.data.results || [];
        searchMessage = response.data.message || `Found ${searchResults.length} results`;
      }
      
      setResults(searchResults);
      setMessage(searchMessage);
      setXssDetected(response.data.xss_detected || false);
      
      // Show warning if XSS detected
      if (response.data.xss_detected) {
        console.warn('XSS payload detected and logged!');
      }
    } catch (error) {
      console.error('Search error:', error);
      setMessage('Error performing search. Please try again.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const xssPayloads = [
    { name: "Alert Box", payload: "<script>alert('XSS Vulnerability Found!')</script>", severity: "high" },
    { name: "Cookie Stealer", payload: "<img src=x onerror=\"alert('Cookie: '+document.cookie)\">", severity: "high" },
    { name: "Page Redirect", payload: "<script>window.location='https://example.com'</script>", severity: "medium" },
    { name: "Console Log", payload: "<script>console.log('Hacked!')</script>", severity: "low" },
    { name: "DOM Manipulation", payload: "<script>document.body.style.background='red'</script>", severity: "medium" }
  ];

  const sqlPayloads = [
    { name: "Auth Bypass", payload: "' OR '1'='1", severity: "critical" },
    { name: "Union Select", payload: "' UNION SELECT null, username, password, null FROM users--", severity: "critical" },
    { name: "Comment Injection", payload: "admin'--", severity: "high" }
  ];

  return (
    <div className="search-container">
      <div className="page-header">
        <div>
          <h2>🔍 Transaction Search</h2>
          <p>Search your transaction history</p>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by description, amount, or date... (HTML/SQL allowed)"
            className="search-input"
          />
          <button type="submit" disabled={isLoading} className="search-btn">
            {isLoading ? 'Searching...' : '🔍 Search'}
          </button>
        </div>
      </form>

      {/* Message Display (VULNERABLE to XSS) */}
      {message && (
        <div className={`search-message ${xssDetected ? 'xss-warning' : ''}`}>
          <div dangerouslySetInnerHTML={{ __html: message }} />
          {xssDetected && (
            <div className="xss-alert">
              ⚠️ XSS payload detected! This attempt has been logged to the security system.
            </div>
          )}
        </div>
      )}

      {/* Results Display */}
      {results.length > 0 && (
        <div className="results-container">
          <h3>📋 Search Results ({results.length})</h3>
          <div className="results-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Account Type</th>
                  <th>Account Number</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr key={i}>
                    <td>{result.username || result.full_name}</td>
                    <td>{result.full_name || result.username}</td>
                    <td>
                      <span className={`account-type-badge ${result.account_type}`}>
                        {result.account_type || 'savings'}
                      </span>
                    </td>
                    <td>
                      <code>{result.account_number}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Results */}
      {results.length === 0 && !isLoading && query && (
        <div className="no-results">
          <p>No results found matching your search.</p>
          <p className="hint">💡 Try searching for "admin", "john"</p>
        </div>
      )}
    </div>
  );
}

export default Search;
