import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = '';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    if (user) {
      loadTransactions();
    }
  }, []);

  const loadTransactions = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/user/transactions`, {
        headers: { 'x-user-id': user.id }
      });
      setTransactions(response.data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading transactions...</div>;

  return (
    <div className="transactions-container">
      <div className="page-header">
        <h2>💰 Transaction History</h2>
        <p>View all your account transactions</p>
      </div>
      
      <div className="summary-cards">
        <div className="summary-card">
          <h4>Total Credits</h4>
          <div className="amount positive">
            ${transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
          </div>
        </div>
        <div className="summary-card">
          <h4>Total Debits</h4>
          <div className="amount negative">
            ${transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
          </div>
        </div>
        <div className="summary-card">
          <h4>Current Balance</h4>
          <div className="amount">
            ${user?.account_balance?.toLocaleString() || '0'}
          </div>
        </div>
      </div>
      
      <div className="transactions-table-container">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, i) => (
              <tr key={i}>
                <td>{new Date(t.date).toLocaleDateString()}</td>
                <td>{t.description}</td>
                <td>
                  <span className={`badge ${t.type === 'credit' ? 'badge-success' : 'badge-warning'}`}>
                    {t.type === 'credit' ? 'Credit' : 'Debit'}
                  </span>
                </td>
                <td className={t.type === 'credit' ? 'positive' : 'negative'}>
                  {t.type === 'credit' ? '+' : '-'}${t.amount.toLocaleString()}
                </td>
                <td><span className="status-completed">Completed</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Transactions;
