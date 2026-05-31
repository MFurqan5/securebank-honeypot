import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Download() {
  const [result, setResult] = useState(null);
  const [filename, setFilename] = useState('');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const response = await axios.get('/api/download', {
        params: { file: 'list' },
        headers: { 'x-user-id': user?.id }
      });
      if (response.data.available_files) {
        setFiles(response.data.available_files);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const handleDownload = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const response = await axios.get('/api/download', {
        params: { file: filename },
        headers: { 'x-user-id': user?.id }
      });
      setResult(response.data);
    } catch (error) {
      console.error('Download error:', error);
      setResult({ error: true, message: 'Error downloading file' });
    } finally {
      setIsLoading(false);
    }
  };

  const traversalPayloads = [
    { name: "Linux Passwd", payload: "../../../etc/passwd", description: "Access system password file" },
    { name: "Windows Win.ini", payload: "..\\..\\..\\windows\\win.ini", description: "Access Windows configuration" },
    { name: "App Source Code", payload: "../../../index.js", description: "Read application source" },
    { name: "Environment File", payload: "../../../.env", description: "Read environment variables" },
    { name: "Database File", payload: "../../../securebank.db", description: "Download database" }
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

      <div className="traversal-test-section">
        <h3>🎯 Directory Traversal Test Payloads</h3>
        <div className="payload-grid">
          {traversalPayloads.map((payload, i) => (
            <button 
              key={i}
              className="payload-btn traversal"
              onClick={() => {
                setFilename(payload.payload);
                setTimeout(() => handleDownload({ preventDefault: () => {} }), 100);
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
                <pre>{result.file_content}</pre>
              </div>
            )}
            {result.traversal_detected && (
              <div className="traversal-warning">
                <strong>⚠️ This attack has been logged!</strong>
                <p>IP: {result.attacker_ip || 'Logged'}</p>
                <p>Type: Directory Traversal Attack</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="legitimate-files">
        <h3>📚 Your Documents</h3>
        <div className="files-grid">
          {files.map((file, i) => (
            <div key={i} className="file-card" onClick={() => setFilename(file.name)}>
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-meta">{file.date} • {file.size}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="info-box">
        <h4>💡 How Directory Traversal Works:</h4>
        <p>1. Attacker uses <code>../</code> sequences to navigate up directories</p>
        <p>2. Can access <code>/etc/passwd</code>, <code>.env</code>, or source code</p>
        <p>3. Example: <code>?file=../../../etc/passwd</code></p>
        <p>4. Server reads and returns sensitive files</p>
      </div>
    </div>
  );
}

export default Download;
