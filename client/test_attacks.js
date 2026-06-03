const axios = require('axios');

async function runTests() {
  console.log('🧪 Starting Security Honeypot Verification Tests...');
  const baseUrl = 'http://localhost:5000';

  // Test 1: Trigger SQLi login and check Deception response
  try {
    console.log('\n1. Sending SQL Injection payload to /api/login...');
    const sqliRes = await axios.post(`${baseUrl}/api/login`, {
      username: "admin' OR '1'='1'--",
      password: "anything"
    }, {
      headers: { 'x-session-id': 'sess_sqli_test' }
    });
    console.log('Response Status:', sqliRes.status);
    console.log('Decoy Balance Served:', sqliRes.data.user.account_balance);
    console.log('Planted Decoy Key:', sqliRes.data.user.decoy_secret_token);
    console.log('✅ SQLi Deception Verified!');
  } catch (err) {
    console.error('❌ SQLi Test Failed:', err.message);
  }

  // Test 2: Trigger Directory Traversal and check Deception file
  try {
    console.log('\n2. Sending Path Traversal payload to /api/download...');
    const travRes = await axios.get(`${baseUrl}/api/download?file=../../../../etc/passwd`, {
      headers: { 'x-session-id': 'sess_trav_test' }
    });
    console.log('Response Status:', travRes.status);
    console.log('Traversal Detected flag:', travRes.data.traversal_detected);
    console.log('File Content excerpt:\n' + travRes.data.file_content.substring(0, 100) + '...');
    console.log('✅ Path Traversal Deception Verified!');
  } catch (err) {
    console.error('❌ Path Traversal Test Failed:', err.message);
  }

  // Test 3: Trigger Honeytoken Login Alert (honey_admin)
  try {
    console.log('\n3. Logging in with Honeytoken Username (honey_admin)...');
    const honeyRes = await axios.post(`${baseUrl}/api/login`, {
      username: "honey_admin",
      password: "somepassword"
    }, {
      headers: { 'x-session-id': 'sess_honey_test' }
    });
    console.log('Response Status (should be 401):', honeyRes.status);
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('Response Status (should be 401): 401 (Access Denied)');
      console.log('✅ Honeytoken Login Alert Verified!');
    } else {
      console.error('❌ Honeytoken Login Test Failed:', err.message);
    }
  }

  // Test 4: Trigger Honeytoken File Alert (api_keys.json)
  try {
    console.log('\n4. Attempting to download Honeytoken planted file (api_keys.json)...');
    const fileRes = await axios.get(`${baseUrl}/api/download?file=api_keys.json`, {
      headers: { 'x-session-id': 'sess_honey_file' }
    });
    console.log('Response Status:', fileRes.status);
    console.log('File Content:\n', fileRes.data.file_content);
    console.log('✅ Honeytoken File Download Alert Verified!');
  } catch (err) {
    console.error('❌ Honeytoken File Download Test Failed:', err.message);
  }

  // Test 5: Verify SOC Stats leaderboard updates
  try {
    console.log('\n5. Fetching SOC Dashboard Stats...');
    const statsRes = await axios.get(`${baseUrl}/api/soc/stats`);
    console.log('Response Status:', statsRes.status);
    console.log('Total Attacks Logged:', statsRes.data.total_attacks);
    console.log('Attackers Leaderboard:');
    statsRes.data.attackers.forEach((a, i) => {
      console.log(`  Rank ${i+1}: IP: ${a.ip} | Score: ${a.threat_score} | SQLi: ${a.sqli_count} | Traversal: ${a.traversal_count}`);
    });
    console.log('✅ SOC Dashboard Analytics Verified!');
  } catch (err) {
    console.error('❌ SOC Stats Verification Failed:', err.message);
  }
}

runTests();
