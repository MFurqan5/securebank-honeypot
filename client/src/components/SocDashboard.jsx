import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '';

function SocDashboard() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/soc/events`);
        setEvents(res.data.events || []);
      } catch (error) {
        console.error('Error:', error);
      }
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="soc-dashboard">
      <h2>SOC Dashboard</h2>
      <div className="events-panel">
        <table className="events-table">
          <thead>
            <tr><th>Time</th><th>IP</th><th>Attack Type</th><th>Path</th></tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
                <td>{e.source_ip}</td>
                <td><strong>{e.attack_type}</strong></td>
                <td>{e.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SocDashboard;
