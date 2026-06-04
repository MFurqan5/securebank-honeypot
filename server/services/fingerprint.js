const { UAParser } = require('ua-parser-js');
const pool = require('../db/connection'); // Fixed import

const TOOL_PATTERNS = [
  { pattern: /sqlmap/i,           tool: 'SQLMap' },
  { pattern: /nikto/i,            tool: 'Nikto' },
  { pattern: /python-requests/i,  tool: 'Python Script' },
  { pattern: /curl\//i,           tool: 'Curl' },
  { pattern: /nmap/i,             tool: 'Nmap' },
  { pattern: /hydra/i,            tool: 'Hydra' },
  { pattern: /dirbuster/i,        tool: 'DirBuster' },
  { pattern: /dirb/i,             tool: 'DirB' },
  { pattern: /masscan/i,          tool: 'Masscan' },
  { pattern: /burp/i,             tool: 'Burp Suite' },
  { pattern: /postman/i,          tool: 'Postman' },
  { pattern: /go-http-client/i,   tool: 'Go Script' },
];

function detect(userAgent) {
  if (!userAgent) return { os: null, tool: null, browser: null };

  let tool = null;
  for (const { pattern, tool: name } of TOOL_PATTERNS) {
    if (pattern.test(userAgent)) {
      tool = name;
      break;
    }
  }

  let os = null;
  let browser = null;
  
  try {
    const parser = new UAParser(userAgent);
    const osInfo = parser.getOS();
    const browserInfo = parser.getBrowser();
    
    if (osInfo && osInfo.name) {
      os = osInfo.version ? `${osInfo.name} ${osInfo.version}` : osInfo.name;
    }
    
    if (browserInfo && browserInfo.name) {
      browser = browserInfo.version ? `${browserInfo.name} ${browserInfo.version}` : browserInfo.name;
    }
  } catch (error) {
    // Fallback: simple string match
    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/Mac/i.test(userAgent)) os = 'macOS';
    else if (/Android/i.test(userAgent)) os = 'Android';
    else if (/iPhone|iPad/i.test(userAgent)) os = 'iOS';
  }

  return { os, tool, browser };
}

async function updateProfile(ip, os, tool) {
  try {
    // Only update if values are not null
    const updates = [];
    const values = [ip];
    let paramCount = 2;
    
    if (os) {
      updates.push(`os = $${paramCount}`);
      values.push(os);
      paramCount++;
    }
    
    if (tool) {
      updates.push(`tool = $${paramCount}`);
      values.push(tool);
      paramCount++;
    }
    
    if (updates.length > 0) {
      const query = `UPDATE attacker_profiles SET ${updates.join(', ')} WHERE ip = $1`;
      await pool.query(query, values);
      console.log(`[UserAgent] Updated profile for ${ip}: os=${os}, tool=${tool}`);
    }
  } catch (error) {
    console.error('[UserAgent] Update error:', error.message);
  }
}

// Enhanced: Detect and update in one call
async function detectAndUpdate(ip, userAgent) {
  const { os, tool, browser } = detect(userAgent);
  await updateProfile(ip, os, tool);
  return { os, tool, browser };
}

module.exports = { detect, updateProfile, detectAndUpdate };