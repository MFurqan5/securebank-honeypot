import React, { useEffect, useState } from 'react';
import axios from 'axios';

function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setError(null);
      // FIX: Use full URL or proxy configuration
      const response = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/analytics`, {
        headers: { 
          'x-user-id': user?.user_id || user?.id || 1,
          'x-user-role': user?.role || 'customer'
        }
      });
      
      // FIX: Handle response structure - API returns data directly, not wrapped in data.data
      if (response.data && typeof response.data === 'object') {
        setData(response.data);
      } else {
        setData(response.data?.data || response.data);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      setError('Failed to load analytics data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading analytics...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data || data.transaction_count === 0) {
    return (
      <div className="analytics-container">
        <div className="page-header">
          <h2>📈 Financial Analytics</h2>
          <p>No transaction data available yet</p>
        </div>
        <div className="empty-state">
          <p>Complete some transactions to see your analytics</p>
        </div>
      </div>
    );
  }

  // Calculate category percentages
  const totalExpenses = data.total_expenses || 0;
  const categoryPercentages = {};
  Object.entries(data.category_breakdown || {}).forEach(([cat, amount]) => {
    categoryPercentages[cat] = totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(0) : 0;
  });

  return (
    <div className="analytics-container">
      <div className="page-header">
        <div>
          <h2>📈 Financial Analytics</h2>
          <p>Visualize your spending patterns and financial health</p>
        </div>
        {user?.role === 'admin' && (
          <div className="admin-badge">👑 Admin View - All Users Data</div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <h4>Total Income</h4>
            <div className="stat-value positive">${(data.total_income || 0).toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💸</div>
          <div className="stat-info">
            <h4>Total Expenses</h4>
            <div className="stat-value negative">${(data.total_expenses || 0).toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-info">
            <h4>Total Transactions</h4>
            <div className="stat-value">{data.transaction_count || 0}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏦</div>
          <div className="stat-info">
            <h4>Net Savings</h4>
            <div className="stat-value positive">${(data.net_savings || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="charts-section">
        <div className="chart-card">
          <h3>📅 Spending by Category</h3>
          {Object.keys(categoryPercentages).length > 0 ? (
            <div className="category-list">
              {Object.entries(categoryPercentages).map(([category, percentage]) => (
                <div key={category} className="category-item">
                  <span className="category-name">{category}</span>
                  <div className="category-bar-container">
                    <div className="category-bar" style={{ width: `${percentage}%` }}>
                      <span className="percentage">{percentage}%</span>
                    </div>
                  </div>
                  <span className="category-amount">${(data.category_breakdown[category] || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No spending data available</p>
          )}
        </div>

        <div className="chart-card">
          <h3>💰 Income vs Expenses</h3>
          <div className="comparison-bars">
            <div className="comparison-item">
              <span className="comparison-label">Income</span>
              <div className="comparison-bar-container">
                <div className="comparison-bar income-bar" style={{ 
                  width: `${Math.min(((data.total_income || 0) / Math.max(data.total_income || 1, data.total_expenses || 1)) * 100, 100)}%` 
                }}>
                  ${(data.total_income || 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="comparison-item">
              <span className="comparison-label">Expenses</span>
              <div className="comparison-bar-container">
                <div className="comparison-bar expense-bar" style={{ 
                  width: `${Math.min(((data.total_expenses || 0) / Math.max(data.total_income || 1, data.total_expenses || 1)) * 100, 100)}%` 
                }}>
                  ${(data.total_expenses || 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="comparison-item">
              <span className="comparison-label">Savings</span>
              <div className="comparison-bar-container">
                <div className="comparison-bar savings-bar" style={{ 
                  width: `${Math.min(((data.net_savings || 0) / Math.max(data.total_income || 1)) * 100, 100)}%` 
                }}>
                  ${(data.net_savings || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="recent-activity">
        <h3>📋 Recent Transactions</h3>
        <div className="activity-timeline">
          {(data.transactions || []).slice(0, 10).map((t, i) => (
            <div key={i} className="activity-item">
              <div className="activity-icon">{t.type === 'credit' ? '💰' : '💸'}</div>
              <div className="activity-details">
                <div className="activity-title">{t.description || 'Transaction'}</div>
                <div className="activity-date">{new Date(t.date).toLocaleDateString()}</div>
                <div className="activity-category">{t.category || 'General'}</div>
              </div>
              <div className={`activity-amount ${t.type === 'credit' ? 'positive' : 'negative'}`}>
                {t.type === 'credit' ? '+' : '-'}${Math.abs(t.amount).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Analytics;