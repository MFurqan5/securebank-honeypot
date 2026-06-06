import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Download() {
  const [result, setResult] = useState(null);
  const [filename, setFilename] = useState('');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      // FIX: Don't use 'list' as file parameter
      const response = await axios.get(`${API_URL}/api/downloads`, {
        params: { file: '' }, // Empty to get available files list
        headers: { 'x-user-id': user?.user_id || user?.id || 1 }
      });
      
      if (response.data.available_files) {
        setFiles(response.data.available_files);
      }
    } catch (error) {
      console.error('Error loading files:', error);
      // Set some default decoy files if API fails
      setFiles([
        { name: 'statement_january.pdf', date: new Date().toISOString(), size: '124 KB' },
        { name: 'statement_february.pdf', date: new Date().toISOString(), size: '118 KB' },
        { name: 'tax_documents.zip', date: new Date().toISOString(), size: '2.3 MB' }
      ]);
    }
  };

  const handleDownload = async (e) => {
    e.preventDefault();
    if (!filename.trim()) {
      alert('Please enter a filename');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      // FIX: Use correct API endpoint
      const response = await axios.get(`${API_URL}/api/downloads`, {
        params: { file: filename },
        headers: { 'x-user-id': user?.user_id || user?.id || 1 }
      });
      setResult(response.data);
      
      // Show warning if traversal detected
      if (response.data.traversal_detected) {
        alert('⚠️ DIRECTORY TRAVERSAL ATTEMPT DETECTED! This has been logged.');
      }
    } catch (error) {
      console.error('Download error:', error);
      setError('Error downloading file. Please try again.');
      setResult({ 
        error: true, 
        message: 'Error downloading file',
        requested_file: filename,
        traversal_detected: false
      });
    } finally {
      setIsLoading(false);
    }
  };

  const traversalPayloads = [
    { name: "Linux Passwd", payload: "../../../etc/passwd", description: "Access system password file" },
    { name: "Windows Win.ini", payload: "..\\..\\..\\windows\\win.ini", description: "Access Windows configuration" },
    { name: "App Source Code", payload: "../../../server.js", description: "Read application source" },
    { name: "Environment File", payload: "../../../.env", description: "Read environment variables" },
    { name: "AWS Keys", payload: "api_keys.json", description: "Download fake API keys (honeytoken)" },
    { name: "Database Config", payload: "../../../config/database.js", description: "Read database configuration" }
  ];

  return (
    <div className="download-container">
      <div className="page-header">
        <div>
          <h2>📄 Document Download</h2>
          <p>Access your account statements and documents</p>
        </div>
        <div className="vuln-badge high">⚠️ DIRECTORY TRAVERSAL VULNERABLE</div>
      </div>

      <div className="warning-box high">
        <strong>⚠️ SECURITY WARNING</strong>
        <p>This download function is vulnerable to Directory Traversal attacks. Attackers can access any file on the server!</p>
      </div>

      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="traversal-test-section">
        <h3>🎯 Directory Traversal Test Payloads</h3>
        <p className="test-note">Click any payload to test path traversal vulnerability</p>
        <div className="payload-grid">
          {traversalPayloads.map((payload, i) => (
            <button 
              key={i}
              className="payload-btn traversal"
              onClick={() => {
                setFilename(payload.payload);
                setResult(null);
              }}
              title={payload.description}
            >
              {payload.name}
            </button>
          ))}
        </div>
      </div>

      <div className="download-form-container">
        <h3>📁 Manual File Download</h3>
        <form onSubmit={handleDownload} className="download-form">
          <div className="download-input-group">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Enter filename (e.g., statement.pdf or ../../../etc/passwd)"
              className="download-input"
            />
            <button type="submit" disabled={isLoading} className="download-btn">
              {isLoading ? 'Downloading...' : '📥 Download'}
            </button>
          </div>
        </form>
      </div>

      {result && (
        <div className={`download-result ${result.traversal_detected ? 'traversal-detected' : ''}`}>
          <div className="result-header">
            {result.traversal_detected ? '🚨 DIRECTORY TRAVERSAL DETECTED' : '📄 File Information'}
          </div>
          <div className="result-content">
            <p><strong>Requested File:</strong> <code>{result.requested_file}</code></p>
            <p><strong>Status:</strong> {result.message}</p>
            {result.file_content && (
              <div className="file-preview">
                <strong>File Content Preview:</strong>
                <pre className="file-content">{result.file_content.substring(0, 1000)}</pre>
                {result.file_content.length > 1000 && <p>... (truncated)</p>}
              </div>
            )}
            {result.traversal_detected && (
              <div className="traversal-warning">
                <strong>⚠️ This attack has been logged!</strong>
                <p>Type: Directory Traversal Attack</p>
                <p>This incident has been reported to the SOC team.</p>
              </div>
            )}
            {result.decoy_notice && (
              <div className="decoy-notice">
                <strong>🪤 {result.decoy_notice}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="legitimate-files">
        <h3>📚 Available Documents</h3>
        {files.length > 0 ? (
          <div className="files-grid">
            {files.map((file, i) => (
              <div 
                key={i} 
                className={`file-card ${file.sensitive ? 'sensitive-file' : ''}`}
                onClick={() => {
                  setFilename(file.name);
                  setResult(null);
                }}
              >
                <div className="file-icon">{file.sensitive ? '🪤' : '📄'}</div>
                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">
                    {file.date ? new Date(file.date).toLocaleDateString() : 'Unknown date'}
                    {file.size && ` • ${file.size}`}
                  </div>
                  {file.sensitive && (
                    <div className="decoy-badge">Honeytoken File</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>Loading available documents...</p>
        )}
      </div>

      <div className="info-box">
        <h4>💡 How Directory Traversal Works:</h4>
        <p>1. Attacker uses <code>../</code> sequences to navigate up directories</p>
        <p>2. Can access <code>/etc/passwd</code>, <code>.env</code>, or source code</p>
        <p>3. Example: <code>?file=../../../etc/passwd</code></p>
        <p>4. Server reads and returns sensitive files (decoy files for honeypot)</p>
      </div>
    </div>
  );
}

export default Download;