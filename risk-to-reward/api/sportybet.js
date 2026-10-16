// Vercel serverless function for Risk to Reward.
// The browser can't call SportyBet directly, so the app asks this function instead.
//
//   /api/sportybet?code=ABC123          -> loads a booking code (selections, markets, odds)
//   /api/sportybet?events=sr:match:1,.. -> final scores for up to 25 matches (for auto-settling)

const BASE = "https://www.sportybet.com/api/ng";
const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Referer": "https://www.sportybet.com/ng/",
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function loadCode(res, raw) {
  const code = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4 || code.length > 12) return send(res, 400, { error: "Type the booking code from your SportyBet slip." });

  const r = await fetch(BASE + "/orders/share/" + code, { headers: HEADERS });
  const j = await r.json();
  // bizCode 10000 = success. Anything else is SportyBet saying no (expired or invalid code).
  if (j.bizCode !== 10000 || !j.data) return send(res, 404, { error: j.message || "That code is invalid or has expired." });

  return send(res, 200, {
    code,
    outcomes: j.data.outcomes || [],
    unavailable: (j.data.unavailableOutcomes || []).length,
  });
}

async function loadEvents(res, raw) {
  const ids = String(raw).split(",").map(s => s.trim()).filter(s => /^sr:[a-z_]+:\d+$/i.test(s)).slice(0, 25);
  if (!ids.length) return send(res, 400, { error: "No matches to check." });

  const events = {};
  await Promise.all(ids.map(async id => {
    try {
      // productId 3 = pre-match/finished, 1 = live. Try both.
      let j = null;
      for (const product of [3, 1]) {
        const r = await fetch(BASE + "/factsCenter/event?eventId=" + encodeURIComponent(id) + "&productId=" + product, { headers: HEADERS });
        j = await r.json();
        if (j.bizCode === 10000 && j.data) break;
      }
      if (!j || j.bizCode !== 10000 || !j.data) return;
      const d = j.data;
      events[id] = {
        status: d.status,             // 4 = ended
        matchStatus: d.matchStatus,   // e.g. "Ended", "Cancelled"
        setScore: d.setScore,         // final score, e.g. "2:1"
        gameScore: d.gameScore || [], // per period, e.g. ["1:0", "1:1"] (1st half, 2nd half)
        playedSeconds: d.playedSeconds || "", // match clock while live, e.g. "67:12"
      };
    } catch (e) { /* skip this match; the app tries again later */ }
  }));
  return send(res, 200, { events });
}

module.exports = async (req, res) => {
  const q = req.query || {};
  try {
    if (q.events) return await loadEvents(res, q.events);
    if (q.code) return await loadCode(res, q.code);
    return send(res, 400, { error: "Type the booking code from your SportyBet slip." });
  } catch (e) {
    return send(res, 502, { error: "Couldn't reach SportyBet right now. Try again in a minute." });
  }
};