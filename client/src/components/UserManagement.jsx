import React, { useEffect, useState } from 'react';
import axios from 'axios';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', full_name: '', role: 'customer' });
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users', {
        headers: { 'x-user-id': currentUser?.user_id || currentUser?.id }
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async (userId, amount) => {
    const desc = prompt('Enter description:', 'Balance adjustment');
    if (desc !== null) {
      try {
        await axios.put(`/api/users/${userId}/balance`, 
          { amount: parseFloat(amount), description: desc },
          { headers: { 'x-user-id': currentUser?.user_id || currentUser?.id } }
        );
        loadUsers();
        alert('Balance updated successfully!');
      } catch (error) {
        alert('Error updating balance: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  const deleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await axios.delete(`/api/users/${userId}`, {
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
      await axios.post('/api/users', newUser, {
        headers: { 'x-user-id': currentUser?.user_id || currentUser?.id }
      });
      setShowModal(false);
      setNewUser({ username: '', password: '', full_name: '', role: 'customer' });
      loadUsers();
      alert('User created successfully!');
    } catch (error) {
      alert('Error creating user: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;

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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New User</h3>
            <form onSubmit={createUser}>
              <input
                type="text"
                placeholder="Username"
                value={newUser.username}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                required
              />
              <input
                type="text"
                placeholder="Full Name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                required
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
              >
                <option value="customer">Customer</option>
                <option value="teller">Teller</option>
                <option value="admin">Admin</option>
              </select>
              <div className="modal-buttons">
                <button type="submit">Create</button>
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
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
              <th>Account Number</th>
              <th>Balance</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td>{user.full_name}</td>
                <td>{user.account_number || 'N/A'}</td>
                <td className={user.account_balance >= 0 ? 'positive' : 'negative'}>
                  ${user.account_balance?.toLocaleString()}
                </td>
                <td>
                  <span className={`role-badge role-${user.role}`}>{user.role}</span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn-small btn-edit"
                      onClick={() => {
                        const amount = prompt('Enter amount (+ for credit, - for debit):', '100');
                        if (amount) updateBalance(user.id, parseFloat(amount));
                      }}
                    >
                      Adjust Balance
                    </button>
                    {currentUser?.role === 'admin' && user.role !== 'admin' && (
                      <button 
                        className="btn-small btn-delete"
                        onClick={() => deleteUser(user.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;
