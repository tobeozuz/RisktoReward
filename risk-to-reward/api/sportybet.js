// Vercel serverless function: loads a SportyBet (Nigeria) booking code.
// The browser can't call SportyBet directly, so the app asks this function instead.
// Usage: /api/sportybet?code=ABC123

module.exports = async (req, res) => {
  const code = String((req.query && req.query.code) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (code.length < 4 || code.length > 12) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Type the booking code from your SportyBet slip." }));
  }

  try {
    const r = await fetch("https://www.sportybet.com/api/ng/orders/share/" + code, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Referer": "https://www.sportybet.com/ng/",
      },
    });
    const j = await r.json();

    // bizCode 10000 = success. Anything else is SportyBet saying no (expired or invalid code).
    if (j.bizCode !== 10000 || !j.data) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: j.message || "That code is invalid or has expired." }));
    }

    const d = j.data;
    res.statusCode = 200;
    return res.end(JSON.stringify({
      code,
      outcomes: d.outcomes || [],
      unavailable: (d.unavailableOutcomes || []).length,
    }));
  } catch (e) {
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: "Couldn't reach SportyBet right now. Try again in a minute." }));
  }
};


