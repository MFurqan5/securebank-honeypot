import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Comments() {
  const [comments, setComments] = useState([]);
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadComments();
  }, []);

  const loadComments = async () => {
    try {
      const response = await axios.get('/api/comments');
      setComments(response.data);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post('/api/comments', { author, content });
      setAuthor('');
      setContent('');
      await loadComments();
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Error posting comment');
    } finally {
      setIsLoading(false);
    }
  };

  const xssPayloads = [
    { name: "Alert Box", payload: "<script>alert('Stored XSS Attack!')</script>" },
    { name: "Cookie Stealer", payload: "<img src=x onerror=\"alert('Cookie: '+document.cookie)\">" },
    { name: "Page Defacement", payload: "<script>document.body.innerHTML='<h1 style=\"color:red\">HACKED!</h1>'</script>" }
  ];

  return (
    <div className="comments-container">
      <div className="page-header">
        <div>
          <h2>💬 Customer Feedback</h2>
          <p>Share your experience with SecureBank</p>
        </div>
        <div className="vuln-badge critical">⚠️ STORED XSS VULNERABLE</div>
      </div>

      <div className="warning-box critical">
        <strong>⚠️ CRITICAL SECURITY WARNING</strong>
        <p>This comment system is vulnerable to Stored XSS. Malicious scripts are saved to the database and execute for every visitor!</p>
      </div>

      <div className="xss-test-section">
        <h3>🎯 Stored XSS Test Payloads</h3>
        <div className="payload-grid">
          {xssPayloads.map((payload, i) => (
            <button 
              key={i}
              className="payload-btn critical"
              onClick={() => setContent(payload.payload)}
            >
              {payload.name}
            </button>
          ))}
        </div>
      </div>

      <div className="comment-form-container">
        <h3>📝 Leave a Comment</h3>
        <form onSubmit={handleSubmit} className="comment-form">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            className="author-input"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your comment here... (HTML allowed - XSS vulnerable)"
            rows="4"
            className="content-input"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Posting...' : '📤 Post Comment'}
          </button>
        </form>
      </div>

      <div className="comments-list">
        <h3>📋 Recent Comments ({comments.length})</h3>
        {comments.map((comment) => (
          <div key={comment.id} className="comment-card">
            <div className="comment-header">
              <strong className="comment-author">👤 {comment.author || 'Anonymous'}</strong>
              <span className="comment-date">{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <div 
              className="comment-content"
              dangerouslySetInnerHTML={{ __html: comment.content }}
            />
            {comment.content.includes('<script') && (
              <div className="xss-badge">⚠️ XSS Payload Detected</div>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <div className="no-comments">No comments yet. Be the first to post!</div>
        )}
      </div>

      <div className="info-box">
        <h4>💡 How Stored XSS Works:</h4>
        <p>1. Attacker posts malicious script in comment</p>
        <p>2. Script is saved to the database</p>
        <p>3. Every user who views the page executes the script</p>
        <p>4. Can steal cookies, redirect users, or deface the site</p>
      </div>
    </div>
  );
}

export default Comments;
