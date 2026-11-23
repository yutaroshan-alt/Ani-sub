// Vercel serverless status endpoint. The Messenger bot itself needs a persistent
// process (Render / Railway / VPS); this function only reports deployment health.
module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).end(JSON.stringify({
    status: "online",
    engine: "Aliya.js",
    mode: "vercel-status",
    credit: "Made by 0xMr_King x ┃ Tanin Islam",
    note: "Bot process runs on Render/Railway/VPS, not on serverless."
  }));
};
