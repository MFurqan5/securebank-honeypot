import React, { useState, useEffect } from 'react';
import axios from 'axios';

function SocDashboard() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ total_attacks: 0, attacks_by_type: [], attackers: [] });
  const [activeAlerts, setActiveAlerts] = useState([]);
  
  // Modals state
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [replayData, setReplayData] = useState(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1500);

  const [selectedAttackerIp, setSelectedAttackerIp] = useState(null);
  const [certReport, setCertReport] = useState(null);

  // Map region coordinate mappings for seeding pulsing dots
  const regionCoordinates = {
    'united states': { x: 200, y: 130 },
    'germany': { x: 470, y: 110 },
    'pakistan': { x: 620, y: 155 },
    'china': { x: 690, y: 145 },
    'united kingdom': { x: 440, y: 95 },
    'russia': { x: 620, y: 95 },
    'australia': { x: 800, y: 280 }
  };

  useEffect(() => {
    fetchSocData();
    const interval = setInterval(fetchSocData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchSocData = async () => {
    try {
      const eventsRes = await axios.get('/api/soc/events');
      const statsRes = await axios.get('/api/soc/stats');

      setEvents(eventsRes.data.events || []);
      setStats(statsRes.data || { total_attacks: 0, attacks_by_type: [], attackers: [] });

      // Scan events for critical honeytoken alerts
      const honeytokenEvents = (eventsRes.data.events || []).filter(
        e => e.severity === 'CRITICAL' && (e.payload.includes('honey_admin') || e.payload.includes('api_keys.json'))
      );
      if (honeytokenEvents.length > 0) {
        setActiveAlerts(honeytokenEvents.slice(0, 3));
      } else {
        setActiveAlerts([]);
      }
    } catch (error) {
      console.error('Error fetching SOC stats:', error);
    }
  };

  // Feature 2 Session Replay: Fetch session history and begin slideshow
  const handleStartReplay = async (sessionId) => {
    try {
      const res = await axios.get(`/api/soc/replay/${sessionId}`);
      setReplayData(res.data);
      setReplayIndex(0);
      setSelectedSessionId(sessionId);
      setIsReplaying(true);
    } catch (err) {
      alert('Error fetching session replay data: No events logged for this session.');
    }
  };

  // Replay slideshow effect
  useEffect(() => {
    let timeout;
    if (isReplaying && replayData && replayIndex < replayData.actions.length - 1) {
      timeout = setTimeout(() => {
        setReplayIndex(prev => prev + 1);
      }, replaySpeed);
    } else if (replayData && replayIndex >= replayData.actions.length - 1) {
      setIsReplaying(false);
    }
    return () => clearTimeout(timeout);
  }, [isReplaying, replayIndex, replayData, replaySpeed]);

  // Feature 6: Generate CERT Incident Report data
  const handleGenerateReport = async (ip) => {
    try {
      const res = await axios.get(`/api/soc/report/${ip}`);
      setCertReport(res.data);
      setSelectedAttackerIp(ip);
    } catch (err) {
      alert('Error generating CERT report: ' + err.message);
    }
  };

  // Clean print handler
  const handlePrintReport = () => {
    window.print();
  };

  // Compute threat level based on stats
  const maxThreatScore = stats.attackers?.length > 0 
    ? Math.max(...stats.attackers.map(a => a.threat_score)) 
    : 0;

  let systemStatus = 'NORMAL';
  let systemStatusClass = 'status-normal';
  if (maxThreatScore > 75) {
    systemStatus = 'CRITICAL THREAT';
    systemStatusClass = 'status-critical';
  } else if (maxThreatScore > 40) {
    systemStatus = 'HIGH ALERT';
    systemStatusClass = 'status-high';
  } else if (maxThreatScore > 20) {
    systemStatus = 'ELEVATED PROBES';
    systemStatusClass = 'status-elevated';
  }

  return (
    <div className="soc-wrapper">
      {/* Dynamic styles injected directly to keep it self-contained and glassmorphic */}
      <style>{`
        .soc-wrapper {
          background-color: #0c101b;
          color: #e2e8f0;
          font-family: 'Courier New', Courier, monospace;
          min-height: 100vh;
          padding: 20px;
        }
        .soc-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #1e293b;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .soc-title-area h1 {
          color: #10b981;
          font-size: 28px;
          font-weight: bold;
          text-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
          margin-bottom: 4px;
        }
        .soc-subtitle {
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .system-gauge {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 16px;
          border: 1px solid currentColor;
          text-shadow: 0 0 5px currentColor;
        }
        .status-normal { color: #10b981; background: rgba(16,185,129,0.1); }
        .status-elevated { color: #f59e0b; background: rgba(245,158,11,0.1); }
        .status-high { color: #f97316; background: rgba(249,115,22,0.1); }
        .status-critical { color: #ef4444; background: rgba(239,68,68,0.1); animation: pulse 1.5s infinite; }
        
        @keyframes pulse {
          0% { opacity: 0.8; }
          50% { opacity: 1; }
          100% { opacity: 0.8; }
        }

        /* Feature 8 Honeytoken Alerts banner */
        .alerts-banner {
          background: rgba(239, 68, 68, 0.15);
          border: 2px dashed #ef4444;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
          color: #ef4444;
          animation: blink-border 1.5s infinite;
        }
        @keyframes blink-border {
          0% { border-color: #ef4444; box-shadow: 0 0 5px rgba(239,68,68,0.2); }
          50% { border-color: #f87171; box-shadow: 0 0 15px rgba(239,68,68,0.5); }
          100% { border-color: #ef4444; box-shadow: 0 0 5px rgba(239,68,68,0.2); }
        }
        .alert-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }

        .soc-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .soc-card {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 20px;
          backdrop-filter: blur(10px);
        }
        .soc-card h2 {
          font-size: 16px;
          color: #38bdf8;
          margin-bottom: 15px;
          border-left: 3px solid #38bdf8;
          padding-left: 10px;
          text-transform: uppercase;
        }

        /* SVG World Map details */
        .map-container {
          position: relative;
          background: #090d16;
          border-radius: 8px;
          overflow: hidden;
          height: 320px;
          border: 1px solid #111b2d;
        }
        .pulsing-dot {
          fill: #ef4444;
          animation: pulse-dot 2.0s infinite;
        }
        .dot-glow {
          fill: #ef4444;
          opacity: 0.15;
          animation: pulse-glow 2.0s infinite;
        }
        @keyframes pulse-dot {
          0% { r: 5; }
          50% { r: 7; }
          100% { r: 5; }
        }
        @keyframes pulse-glow {
          0% { r: 12; opacity: 0.4; }
          50% { r: 24; opacity: 0.1; }
          100% { r: 12; opacity: 0.4; }
        }

        /* Leaderboard and feed styling */
        .leaderboard-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .leaderboard-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #111827;
          padding: 10px 15px;
          border-radius: 8px;
          border-left: 4px solid #4b5563;
        }
        .leaderboard-item.critical { border-left-color: #ef4444; }
        .leaderboard-item.high { border-left-color: #f97316; }
        .leaderboard-item.medium { border-left-color: #f59e0b; }
        
        .score-badge {
          background: #374151;
          color: #f3f4f6;
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: bold;
          font-size: 12px;
        }
        .score-critical { color: #ef4444; }
        .score-high { color: #f97316; }
        .score-medium { color: #f59e0b; }

        .feed-card {
          margin-top: 20px;
        }
        .feed-table-container {
          overflow-x: auto;
          max-height: 400px;
        }
        .feed-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .feed-table th {
          background: #1f2937;
          color: #9ca3af;
          padding: 10px;
          text-align: left;
          font-weight: normal;
        }
        .feed-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #111827;
        }
        .feed-table tr:hover {
          background: #111b2d;
        }

        .sev-low { color: #38bdf8; }
        .sev-medium { color: #fbbf24; }
        .sev-high { color: #fb923c; }
        .sev-critical { color: #f87171; font-weight: bold; }

        .action-link {
          color: #38bdf8;
          cursor: pointer;
          text-decoration: underline;
          margin-right: 10px;
          background: transparent;
          border: none;
          font-family: inherit;
        }
        .action-link:hover { color: #7dd3fc; }

        /* Dialogs glassmorphism style */
        .soc-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.85);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 5000;
        }
        .soc-modal {
          background: #0f172a;
          border: 2px solid #334155;
          border-radius: 16px;
          width: 750px;
          max-width: 95%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #334155;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .modal-header h3 { color: #38bdf8; font-size: 18px; }
        .close-btn {
          background: none; border: none; color: #94a3b8;
          font-size: 24px; cursor: pointer;
        }
        .close-btn:hover { color: #f1f5f9; }

        /* Replay console mock layout */
        .replay-console {
          background: #020617;
          border: 1px solid #1e293b;
          border-radius: 8px;
          height: 360px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          margin-bottom: 15px;
        }
        .console-screen {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          color: #10b981;
          font-size: 13px;
        }
        .console-controls {
          background: #090d16;
          border-top: 1px solid #1e293b;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          justify-content: space-between;
        }
        .console-btn {
          background: #1e293b; color: white; border: none;
          padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
        }
        .console-btn:hover { background: #334155; }
        .replay-step {
          margin-bottom: 10px;
          border-left: 2px solid #10b981;
          padding-left: 10px;
          animation: fade-in 0.3s ease-out;
        }
        @keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* CERT Advisory Printable Stylesheet */
        .cert-report-wrapper {
          color: #1e293b;
          background: #ffffff;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          font-family: 'Times New Roman', Times, serif;
          line-height: 1.5;
        }
        .cert-header-sec {
          text-align: center;
          border-bottom: 3px double #1e293b;
          padding-bottom: 20px;
          margin-bottom: 25px;
        }
        .cert-banner-text {
          font-size: 24px;
          font-weight: bold;
          letter-spacing: 1px;
          margin-bottom: 5px;
          color: #990000;
        }
        .cert-table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        .cert-table th, .cert-table td {
          border: 1px solid #94a3b8;
          padding: 8px 12px;
          text-align: left;
          font-size: 14px;
        }
        .cert-table th { background: #f1f5f9; font-weight: bold; }
        
        .timeline-item-cert {
          margin-bottom: 12px;
          font-size: 13px;
          font-family: monospace;
          background: #f8fafc;
          padding: 8px;
          border-left: 3px solid #990000;
        }

        .risk-badge-cert {
          display: inline-block;
          background: #ef4444; color: white;
          padding: 4px 10px; border-radius: 4px; font-weight: bold;
        }

        /* Print Media Stylesheet */
        @media print {
          body * { visibility: hidden; }
          .cert-report-wrapper, .cert-report-wrapper * { visibility: visible; }
          .cert-report-wrapper {
            position: absolute;
            left: 0; top: 0; width: 100%;
            box-shadow: none; padding: 0; margin: 0;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 1. Header Area with System Level */}
      <div className="soc-header">
        <div className="soc-title-area">
          <h1>🛡️ SECUREBANK HONEYPOT SOC CONSOLE</h1>
          <div className="soc-subtitle">Vulnerability Monitoring · Deceptive Defense · Active Intelligence</div>
        </div>
        <div className={`system-gauge ${systemStatusClass}`}>
          DEFCON LEVEL: {systemStatus}
        </div>
      </div>

      {/* 2. Feature 8 Honeytoken Trigger alerts banner */}
      {activeAlerts.length > 0 && (
        <div className="alerts-banner">
          <div className="alert-item">
            <div>
              <strong>🚨 HONEYTOKEN TRIGGERED!</strong>
              <div style={{ marginTop: '5px', fontSize: '12px' }}>
                Critical breach alert: Attacker IP: {activeAlerts[0].source_ip} - Path: {activeAlerts[0].path} - Trigger Payload: "{activeAlerts[0].payload}"
              </div>
            </div>
            <button className="console-btn" onClick={() => handleGenerateReport(activeAlerts[0].source_ip)}>
              Investigate Host
            </button>
          </div>
        </div>
      )}

      {/* 3. Map and Leaderboard */}
      <div className="soc-grid">
        {/* Live World Threat Map (Feature 5) */}
        <div className="soc-card">
          <h2>🌍 Live World Threat Map (Real-Time Attacks)</h2>
          <div className="map-container">
            {/* Simple vector outline representing the coordinates of continent maps */}
            <svg width="100%" height="100%" viewBox="0 0 960 360" style={{ background: '#090d16' }}>
              {/* North America outline */}
              <path d="M120 70 L250 70 L300 120 L230 180 L180 180 L140 130 Z" fill="#1e293b" opacity="0.3" />
              {/* South America outline */}
              <path d="M220 185 L280 185 L250 290 L210 320 Z" fill="#1e293b" opacity="0.3" />
              {/* Europe outline */}
              <path d="M420 60 L500 60 L510 110 L440 120 Z" fill="#1e293b" opacity="0.3" />
              {/* Africa outline */}
              <path d="M450 130 L550 130 L560 210 L520 250 L480 190 Z" fill="#1e293b" opacity="0.3" />
              {/* Asia outline */}
              <path d="M510 50 L750 50 L810 180 L620 180 Z" fill="#1e293b" opacity="0.3" />
              {/* Australia outline */}
              <path d="M780 230 L840 230 L850 280 L790 280 Z" fill="#1e293b" opacity="0.3" />

              {/* Pulsing Dots representing geolocated attacker IPs */}
              {stats.attackers?.map((attacker, i) => {
                const coord = regionCoordinates[attacker.country.toLowerCase()] || 
                  Object.values(regionCoordinates)[i % Object.values(regionCoordinates).length]; // fallback
                return (
                  <g key={i}>
                    <circle cx={coord.x} cy={coord.y} r="15" className="dot-glow" />
                    <circle cx={coord.x} cy={coord.y} r="5" className="pulsing-dot" />
                    <text x={coord.x + 10} y={coord.y - 10} fill="#f1f5f9" fontSize="10" fontFamily="monospace">
                      {attacker.ip} ({attacker.city})
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Threat Scoring Leaderboard (Feature 7) */}
        <div className="soc-card">
          <h2>🏆 Top Attacker Profiles</h2>
          <div className="leaderboard-list">
            {stats.attackers?.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '13px' }}>No attacker profiles generated yet.</div>
            ) : (
              stats.attackers?.map((a, i) => {
                let ratingClass = 'medium';
                let ratingTextClass = 'score-medium';
                if (a.threat_score > 75) {
                  ratingClass = 'critical';
                  ratingTextClass = 'score-critical';
                } else if (a.threat_score > 40) {
                  ratingClass = 'high';
                  ratingTextClass = 'score-high';
                }

                return (
                  <div key={i} className={`leaderboard-item ${ratingClass}`}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{a.ip}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {a.city}, {a.country} · {a.tool} · Requests: {a.total_requests}
                      </div>
                    </div>
                    <div className="score-badge">
                      <span className={ratingTextClass}>{a.threat_score}</span> / 100
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. Live Events Feed */}
      <div className="soc-card feed-card">
        <h2>📜 Live Security Events Log Feed</h2>
        <div className="feed-table-container">
          <table className="feed-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Source IP</th>
                <th>Attack Type</th>
                <th>Method/Path</th>
                <th>Payload</th>
                <th>Scanner Tool</th>
                <th>OS</th>
                <th>Severity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                    Listening for connection attempts...
                  </td>
                </tr>
              ) : (
                events.map((e, i) => {
                  let sevClass = 'sev-low';
                  if (e.severity === 'CRITICAL') sevClass = 'sev-critical';
                  else if (e.severity === 'HIGH') sevClass = 'sev-high';
                  else if (e.severity === 'MEDIUM') sevClass = 'sev-medium';

                  return (
                    <tr key={i}>
                      <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
                      <td>{e.source_ip}</td>
                      <td>
                        <strong style={{ textTransform: 'uppercase' }}>{e.attack_type}</strong>
                      </td>
                      <td>
                        {e.method} {e.path}
                      </td>
                      <td style={{ fontFamily: 'monospace', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.payload}>
                        {e.payload}
                      </td>
                      <td>{e.tool_detected || 'Manual (Browser)'}</td>
                      <td>{e.os_fingerprint}</td>
                      <td>
                        <span className={sevClass}>{e.severity}</span>
                      </td>
                      <td>
                        <button className="action-link" onClick={() => handleStartReplay(e.session_id)}>
                          Replay
                        </button>
                        <button className="action-link" onClick={() => handleGenerateReport(e.source_ip)}>
                          Report
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: Feature 2 — Session Replay Viewer */}
      {/* ========================================================= */}
      {selectedSessionId && replayData && (
        <div className="soc-modal-overlay">
          <div className="soc-modal">
            <div className="modal-header">
              <h3>🎥 SOC Session Replay Console (Session ID: {selectedSessionId})</h3>
              <button className="close-btn" onClick={() => { setSelectedSessionId(null); setReplayData(null); setIsReplaying(false); }}>
                &times;
              </button>
            </div>
            
            <div className="replay-console">
              <div className="console-screen">
                <div style={{ color: '#38bdf8', marginBottom: '15px', borderBottom: '1px solid #1e293b', paddingBottom: '5px' }}>
                  CONSOLE FEED STARTED FOR IP: {replayData.ip}
                </div>
                {replayData.actions.slice(0, replayIndex + 1).map((act, i) => (
                  <div key={i} className="replay-step">
                    <span style={{ color: '#64748b' }}>[{new Date(act.timestamp).toLocaleTimeString()}]</span>{' '}
                    {act.type === 'navigate' ? (
                      <span>
                        Attacker navigated to <strong style={{ color: '#fbbf24' }}>{act.page}</strong> (Path: {act.path})
                      </span>
                    ) : (
                      <span>
                        Attacker clicked interactive element:{' '}
                        <strong style={{ color: '#ef4444' }}>"{act.label}"</strong>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="console-controls">
                <div>
                  <button className="console-btn" style={{ marginRight: '8px' }} onClick={() => setIsReplaying(!isReplaying)}>
                    {isReplaying ? '⏸️ Pause' : '▶️ Play'}
                  </button>
                  <button className="console-btn" onClick={() => setReplayIndex(0)}>
                    🔄 Restart
                  </button>
                </div>
                
                <div style={{ fontSize: '12px' }}>
                  Event {replayIndex + 1} of {replayData.actions.length}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Speed:</span>
                  <select 
                    style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', padding: '3px 8px', width: 'auto' }}
                    value={replaySpeed}
                    onChange={(e) => setReplaySpeed(parseInt(e.target.value))}
                  >
                    <option value="2500">Slow (2.5s)</option>
                    <option value="1500">Normal (1.5s)</option>
                    <option value="800">Fast (0.8s)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ color: '#64748b', fontSize: '11px', textAlign: 'center' }}>
              Deceptive Session Replay records and mimics the exact navigation logs and interactive clicks compiled from the honeypot node database.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: Feature 6 — Automated CERT Advisory Report */}
      {/* ========================================================= */}
      {selectedAttackerIp && certReport && (
        <div className="soc-modal-overlay">
          <div className="soc-modal" style={{ width: '850px' }}>
            <div className="modal-header no-print">
              <h3>📄 CERT Threat Incident Advisory Generator</h3>
              <div>
                <button className="console-btn" style={{ background: '#10b981', marginRight: '8px' }} onClick={handlePrintReport}>
                  🖨️ Export PDF
                </button>
                <button className="close-btn" onClick={() => { setSelectedAttackerIp(null); setCertReport(null); }}>
                  &times;
                </button>
              </div>
            </div>

            {/* Print-formatted CERT Incident advisory paper */}
            <div className="cert-report-wrapper">
              <div className="cert-header-sec">
                <div style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '4px', textTransform: 'uppercase', color: '#64748b' }}>
                  GOVERNMENT OF PAKISTAN · DEPT OF COMPUTER SCIENCE
                </div>
                <div className="cert-banner-text">NATIONAL COMPUTER EMERGENCY RESPONSE ADVISORY</div>
                <div style={{ fontSize: '12px', fontStyle: 'italic', color: '#475569' }}>
                  Incident Report ID: {certReport.incident_ref} · Status: Restricted
                </div>
              </div>

              <h3 style={{ borderBottom: '2px solid #1e293b', paddingBottom: '5px', fontSize: '16px', margin: '20px 0 10px 0' }}>
                1. EXECUTIVE INCIDENT SUMMARY
              </h3>
              <p style={{ fontSize: '14px', marginBottom: '15px' }}>
                On <strong>{new Date(certReport.report_date).toLocaleDateString()}</strong>, the Security Operations Centre detected coordinated exploit scans originating from IP address <strong>{certReport.attacker.ip}</strong>. The target system is the <em>SecureBank online banking portal</em> decoy infrastructure. The attacker utilized automated exploit utilities and path traversal vectors to target host files.
              </p>

              <h3 style={{ borderBottom: '2px solid #1e293b', paddingBottom: '5px', fontSize: '16px', margin: '20px 0 10px 0' }}>
                2. ATTACKER SOURCE IDENTIFICATION
              </h3>
              <table className="cert-table">
                <tbody>
                  <tr>
                    <th>Attacker IP Address</th>
                    <td>{certReport.attacker.ip}</td>
                    <th>Geographic Origin</th>
                    <td>{certReport.attacker.city}, {certReport.attacker.country}</td>
                  </tr>
                  <tr>
                    <th>Autonomous System (ISP)</th>
                    <td>{certReport.attacker.isp}</td>
                    <th>Scanner Tool Signature</th>
                    <td>{certReport.attacker.tool}</td>
                  </tr>
                  <tr>
                    <th>Operating System</th>
                    <td>{certReport.attacker.os}</td>
                    <th>Total Queries Captured</th>
                    <td>{certReport.attacker.total_requests}</td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ borderBottom: '2px solid #1e293b', paddingBottom: '5px', fontSize: '16px', margin: '20px 0 10px 0' }}>
                3. DETAILED ACTION & ATTACK TIMELINE
              </h3>
              <div style={{ margin: '15px 0' }}>
                {certReport.timeline.map((line, i) => (
                  <div key={i} className="timeline-item-cert">
                    <strong>[{new Date(line.timestamp).toLocaleTimeString()}]</strong> - [METHOD: {line.method}] - [ROUTE: {line.path}]<br />
                    <span style={{ color: '#b91c1c' }}>Payload: {line.payload}</span> · <span style={{ color: '#475569' }}>Severity: {line.severity}</span>
                  </div>
                ))}
              </div>

              <h3 style={{ borderBottom: '2px solid #1e293b', paddingBottom: '5px', fontSize: '16px', margin: '20px 0 10px 0' }}>
                4. SECURITY RISK ASSESSMENT & CORRELATION
              </h3>
              <table className="cert-table">
                <tbody>
                  <tr>
                    <th>Calculated Threat Score</th>
                    <td style={{ fontWeight: 'bold' }}>{certReport.risk_assessment.threat_score} / 100</td>
                    <th>Assigned Risk Classification</th>
                    <td>
                      <span className="risk-badge-cert">{certReport.risk_assessment.risk_level}</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Exploit Assessment</th>
                    <td colSpan="3">{certReport.risk_assessment.summary}</td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ borderBottom: '2px solid #1e293b', paddingBottom: '5px', fontSize: '16px', margin: '20px 0 10px 0' }}>
                5. MANDATORY SYSTEM MITIGATION RECOMMENDATIONS
              </h3>
              <ul style={{ paddingLeft: '20px', fontSize: '13px', margin: '10px 0' }}>
                {certReport.risk_assessment.recommended_actions.map((act, i) => (
                  <li key={i} style={{ marginBottom: '8px' }}>{act}</li>
                ))}
              </ul>

              <h3 style={{ borderBottom: '2px solid #1e293b', paddingBottom: '5px', fontSize: '16px', margin: '20px 0 10px 0' }}>
                6. INDICATORS OF COMPROMISE (IOC) INDEX
              </h3>
              <pre style={{ background: '#f8fafc', padding: '15px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(certReport.ioc, null, 2)}
              </pre>

              <div style={{ marginTop: '30px', borderTop: '1px solid #cbd5e1', paddingTop: '15px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                This advisory contains threat intelligence compiled autonomously from SecureBank security honeypots. Distribution is restricted to authorized administrative nodes.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SocDashboard;
