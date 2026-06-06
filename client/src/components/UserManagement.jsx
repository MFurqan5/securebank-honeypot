import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', email: '', phone: '' });
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadUsers();
    } else {
      setLoading(false);
      setError('Admin access required');
    }
  }, []);

  const loadUsers = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { 
          'x-user-id': currentUser?.user_id || currentUser?.id,
          'x-user-role': currentUser?.role
        }
      });
      
      // Handle response format
      let usersData = [];
      if (response.data.users) {
        usersData = response.data.users;
      } else if (Array.isArray(response.data)) {
        usersData = response.data;
      } else if (response.data.data) {
        usersData = response.data.data;
      }
      
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async (userId, currentBalance) => {
    const amount = prompt('Enter amount (+ for credit, - for debit):', '100');
    if (amount !== null) {
      const description = prompt('Enter description:', 'Balance adjustment');
      if (description !== null) {
        try {
          await axios.put(`${API_URL}/api/users/${userId}/balance`, 
            { amount: parseFloat(amount), description: description },
            { headers: { 'x-user-id': currentUser?.user_id || currentUser?.id } }
          );
          loadUsers();
          alert('Balance updated successfully!');
        } catch (error) {
          alert('Error updating balance: ' + (error.response?.data?.error || error.message));
        }
      }
    }
  };

  const deleteUser = async (userId, username) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        await axios.delete(`${API_URL}/api/users/${userId}`, {
          headers: { 'x-user-id': currentUser?.user_id || currentUser?.id }
        });
        loadUsers();
        alert('User deleted successfully!');
      } catch (error) {
        alert('Error deleting user: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/users`, newUser, {
        headers: { 'x-user-id': currentUser?.user_id || currentUser?.id }
      });
      setShowModal(false);
      setNewUser({ username: '', password: '', full_name: '', email: '', phone: '' });
      loadUsers();
      alert('User created successfully!');
    } catch (error) {
      alert('Error creating user: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="users-container">
      <div className="page-header">
        <div>
          <h2>👥 User Management</h2>
          <p>Manage bank customers, tellers, and administrators</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Create New User
        </button>
      </div>

      {/* IDOR Warning */}
      <div className="warning-box high">
        <strong>⚠️ IDOR VULNERABILITY WARNING</strong>
        <p>This endpoint lacks proper authorization checks. Any authenticated user can view, modify, or delete any user's data!</p>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New User</h3>
            <form onSubmit={createUser}>
              <input
                type="text"
                placeholder="Username *"
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                required
              />
              <input
                type="password"
                placeholder="Password *"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                required
              />
              <input
                type="text"
                placeholder="Full Name *"
                value={newUser.full_name}
                onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newUser.phone}
                onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
              />
              <div className="modal-buttons">
                <button type="submit" className="btn-primary">Create User</button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Account Number</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>{user.full_name}</td>
                <td>{user.email || '—'}</td>
                <td><code>{user.account_number || 'N/A'}</code></td>
                <td className={user.account_balance >= 0 ? 'positive' : 'negative'}>
                  ${(user.account_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <span className={`status-badge ${user.is_active !== false ? 'active' : 'inactive'}`}>
                    {user.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn-small btn-edit"
                      onClick={() => updateBalance(user.id, user.account_balance)}
                      title="Adjust Balance"
                    >
                      💰 Balance
                    </button>
                    {currentUser?.role === 'admin' && user.username !== currentUser.username && (
                      <button 
                        className="btn-small btn-delete"
                        onClick={() => deleteUser(user.id, user.username)}
                        title="Delete User"
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="info-box">
        <h4>💡 How IDOR (Insecure Direct Object Reference) Works:</h4>
        <p>1. Attacker changes user ID in URL: <code>/api/users/1</code> → <code>/api/users/2</code></p>
        <p>2. No authorization check verifies if attacker owns that resource</p>
        <p>3. Attacker can view, modify, or delete any user's data</p>
        <p>4. Can escalate privileges by modifying admin accounts</p>
      </div>
    </div>
  );
}

export default UserManagement;