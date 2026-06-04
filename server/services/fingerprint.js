const { UAParser } = require('ua-parser-js');
const pool = require('../db/pool');

const TOOL_PATTERNS = [
  { pattern: /sqlmap/i,           tool: 'sqlmap' },
  { pattern: /Nikto/i,            tool: 'nikto' },
  { pattern: /python-requests/i,  tool: 'python_script' },
  { pattern: /curl\//i,           tool: 'curl' },
  { pattern: /Nmap/i,             tool: 'nmap' },
  { pattern: /Hydra/i,            tool: 'hydra' },
  { pattern: /DirBuster/i,        tool: 'dirbuster' },
  { pattern: /masscan/i,          tool: 'masscan' },
];

function detect(userAgent) {
  if (!userAgent) return { os: null, tool: null };

  let tool = null;
  for (const { pattern, tool: name } of TOOL_PATTERNS) {
    if (pattern.test(userAgent)) {
      tool = name;
      break;
    }
  }

  let os = null;
  try {
    const parser = new UAParser(userAgent);
    const osInfo = parser.getOS();
    if (osInfo && osInfo.name) {
      os = osInfo.version ? `${osInfo.name} ${osInfo.version}` : osInfo.name;
    }
  } catch {
    // fallback: simple string match
    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/Mac/i.test(userAgent)) os = 'macOS';
  }

  return { os, tool };
}

async function updateProfile(ip, os, tool) {
  try {
    await pool.query(
      `UPDATE attacker_profiles SET os = $2, tool = $3 WHERE ip = $1`,
      [ip, os, tool]
    );
  } catch {
    // never crash
  }
}

module.exports = { detect, updateProfile };
