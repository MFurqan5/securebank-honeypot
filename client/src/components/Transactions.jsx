import React, { useEffect, useState } from "react";
import axios from "axios";
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = JSON.parse(localStorage.getItem("user") || "null");

  useEffect(() => {
    if (user) {
      loadTransactions();
    } else {
      setLoading(false);
      setError("Please log in to view transactions");
    }
  }, []);

  const loadTransactions = async () => {
    try {
      setError(null);
      // FIX: Correct API endpoint - /api/transactions (not /api/user/transactions)
      const response = await axios.get(`${API_URL}/api/transactions`, {
        headers: { 
          'x-user-id': user?.user_id || user?.id || 1,
          'x-user-role': user?.role || 'customer'
        }
      });
      
      let transactionsData = [];
      let summaryData = null;
      
      // Handle different response formats
      if (response.data.success && response.data.data) {
        transactionsData = response.data.data;
      } else if (response.data.transactions) {
        transactionsData = response.data.transactions;
        summaryData = response.data.summary;
      } else if (Array.isArray(response.data)) {
        transactionsData = response.data;
      } else {
        transactionsData = response.data.data || [];
      }
      
      setTransactions(transactionsData);
      
      // Calculate summary if not provided
      if (!summaryData && transactionsData.length > 0) {
        const totalCredit = transactionsData
          .filter(t => t.type === 'credit' || t.category === 'Income')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalDebit = transactionsData
          .filter(t => t.type === 'debit' || t.category === 'Shopping' || t.category === 'Transfer')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        
        setSummary({
          total_credit: totalCredit,
          total_debit: totalDebit,
          net_flow: totalCredit - totalDebit,
          total_transactions: transactionsData.length
        });
      } else {
        setSummary(summaryData);
      }
    } catch (error) {
      console.error("Error loading transactions:", error);
      setError("Failed to load transactions. Please try again.");
      
      // Fallback demo data
      setTransactions([
        { id: 1, date: new Date().toISOString(), description: "Salary Deposit", amount: 5000, type: "credit", status: "completed" },
        { id: 2, date: new Date().toISOString(), description: "Amazon Purchase", amount: 125.50, type: "debit", status: "completed" }
      ]);
      setSummary({
        total_credit: 5000,
        total_debit: 125.50,
        net_flow: 4874.50,
        total_transactions: 2
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  if (loading) return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading transactions...</p>
    </div>
  );

  if (error) return (
    <div className="error-container">
      <div className="error-icon">⚠️</div>
      <h3>Error</h3>
      <p>{error}</p>
      <button onClick={loadTransactions} className="retry-btn">Retry</button>
    </div>
  );

  return (
    <div className="transactions-container">
      <div className="page-header">
        <div>
          <h2>💰 Transaction History</h2>
          <p>View all your account transactions</p>
        </div>
        <div className="transaction-count">
          {transactions.length} Transactions
        </div>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <h4>Total Credits</h4>
          <div className="amount positive">
            +${(summary?.total_credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <small>Money received</small>
        </div>
        <div className="summary-card">
          <h4>Total Debits</h4>
          <div className="amount negative">
            -${(summary?.total_debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <small>Money spent</small>
        </div>
        <div className="summary-card">
          <h4>Net Flow</h4>
          <div className={`amount ${(summary?.net_flow || 0) >= 0 ? 'positive' : 'negative'}`}>
            {(summary?.net_flow || 0) >= 0 ? '+' : '-'}
            ${Math.abs(summary?.net_flow || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <small>Income - Expenses</small>
        </div>
        <div className="summary-card">
          <h4>Current Balance</h4>
          <div className="amount">
            ${(user?.account_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <small>Available balance</small>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-transactions">
          <div className="empty-icon">📭</div>
          <h3>No transactions yet</h3>
          <p>Your transaction history will appear here once you make your first transaction.</p>
        </div>
      ) : (
        <div className="transactions-table-container">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={t.id || i} className={`transaction-row ${t.type || 'debit'}`}>
                  <td className="date-cell">{formatDate(t.date || t.created_at)}</td>
                  <td className="description-cell">{t.description || t.remarks || 'Transaction'}</td>
                  <td>
                    <span className="category-badge">
                      {t.category || 'General'}
                    </span>
                  </td>
                  <td>
                    <span className={`type-badge ${(t.type === 'credit' || t.category === 'Income') ? 'credit-badge' : 'debit-badge'}`}>
                      {(t.type === 'credit' || t.category === 'Income') ? '💰 Credit' : '💸 Debit'}
                    </span>
                  </td>
                  <td className={`amount-cell ${(t.type === 'credit' || t.category === 'Income') ? 'positive' : 'negative'}`}>
                    {(t.type === 'credit' || t.category === 'Income') ? '+' : '-'}
                    ${Math.abs(t.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className="status-badge completed">
                      ✓ {t.status || 'Completed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transactions.length > 10 && (
        <div className="transactions-footer">
          <p>Showing last {Math.min(transactions.length, 50)} transactions</p>
          <button className="refresh-btn" onClick={loadTransactions}>
            🔄 Refresh
          </button>
        </div>
      )}
    </div>
  );
}

export default Transactions;