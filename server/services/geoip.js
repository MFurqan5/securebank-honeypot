const geoip = require("geoip-lite");
const pool = require("../db/pool");

async function enrich(ip) {
  try {
    const geo = geoip.lookup(ip);
    if (!geo) return null;

    const data = {
      country: geo.country,
      city: geo.city,
      latitude: geo.ll[0],
      longitude: geo.ll[1],
    };

    // Upsert into attacker_profiles — update geo fields including lat/long
    await pool
      .query(
        `UPDATE attacker_profiles
         SET country = $2, city = $3, latitude = $4, longitude = $5, last_seen = NOW()
       WHERE ip = $1`,
        [ip, data.country, data.city, data.latitude, data.longitude],
      )
      .catch(() => {}); // never crash

    return data;
  } catch {
    return null;
  }
}

module.exports = { enrich };
