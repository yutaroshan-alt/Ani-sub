const axios = require("axios");

module.exports = {
  config: {
    name: "check",
    aliases: ["webstatus", "sitecheck", "pingweb"],
    version: "1.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    role: 0,
    shortDescription: "Check if a website is online or offline",
    longDescription: "Pings a website URL to monitor its live availability, status code, and response latency.",
    category: "utility",
    guide: { en: "{pn} [website link]" }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    let url = args[0];

    if (!url) {
      return api.sendMessage("Please provide a website URL to check. Example: (check google.com", threadID, messageID);
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    api.setMessageReaction("⌛", messageID, () => {}, true);

    const startTime = Date.now();

    try {
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const responseTime = Date.now() - startTime;
      const statusCode = response.status;
      
      api.setMessageReaction("🟢", messageID, () => {}, true);

      const infoCard =
        `WEBSITE MONITOR\n` +
        `URL    : ${url}\n` +
        `Status : ONLINE\n` +
        `Code   : ${statusCode} OK\n` +
        `Ping   : ${responseTime} ms\n` +
        `Author : 0xMr_King x | Tanin Islam`;

      return api.sendMessage(infoCard, threadID, () => {
        // ── SYSTEM REFRESH ──
        if (global.gc) global.gc();
        else if (process.gc) process.gc();
      }, messageID);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      api.setMessageReaction("🔴", messageID, () => {}, true);

      let errorStatus = "OFFLINE / DOWN";
      let errorCode = error.response ? error.response.status : "TIMEOUT/UNKNOWN";

      if (error.response) {
        errorStatus = "SERVER ERROR (BUT ALIVE)";
      }

      const errorCard =
        `WEBSITE MONITOR\n` +
        `URL    : ${url}\n` +
        `Status : ${errorStatus}\n` +
        `Code   : ${errorCode}\n` +
        `Time   : ${responseTime} ms\n` +
        `Author : 0xMr_King x | Tanin Islam`;

      return api.sendMessage(errorCard, threadID, () => {
        // ── SYSTEM REFRESH ──
        if (global.gc) global.gc();
        else if (process.gc) process.gc();
      }, messageID);
    }
  }
};
