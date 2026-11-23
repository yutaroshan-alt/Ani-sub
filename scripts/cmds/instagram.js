const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const AUTODL_API = "https://xsaim8x-xxx-api.onrender.com/api/auto";
const SUPPORTED_AUTODL_DOMAINS = [
  "facebook.com", "fb.watch", "youtube.com", "youtu.be", "tiktok.com",
  "instagram.com", "instagr.am", "likee.com", "likee.video", "capcut.com",
  "spotify.com", "terabox.com", "twitter.com", "x.com", "drive.google.com",
  "soundcloud.com", "ndown.app", "pinterest.com", "pin.it"
];

function isAutoDlSupported(url = "") {
  return SUPPORTED_AUTODL_DOMAINS.some(domain => url.includes(domain));
}

async function getDownloadUrl(url, baseUrl) {
  if (!url) return null;
  let finalUrl = url;
  if (finalUrl.startsWith("/")) finalUrl = `${baseUrl}${finalUrl}`;

  if (isAutoDlSupported(finalUrl)) {
    try {
      const res = await axios.get(AUTODL_API, {
        params: { url: finalUrl },
        timeout: 60000
      });
      const mediaURL = res.data?.high_quality || res.data?.low_quality || res.data?.data?.high_quality || res.data?.data?.low_quality;
      if (mediaURL) return mediaURL;
    } catch (e) {}
  }
  return finalUrl;
}

async function downloadBuffer(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: { "user-agent": "Mozilla/5.0" }
  });
  return Buffer.from(res.data);
}

const defaultQueries = [
  "gojo edit",
  "anime reel edit",
  "aesthetic reel",
  "phonk edit",
  "attitude reel",
  "lofi edit",
  "viral reel",
  "goku aura editz",
  "aliya anime"
];

module.exports = {
  config: {
    name: "instagram",
    aliases: ["ig"],
    version: "1.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 0,
    shortDescription: "Fetch and send random or searched Instagram reels",
    longDescription: "Sends random or searched Instagram reel videos using 0xMr_King API.",
    category: "media",
    guide: "{pn} [optional query]"
  },

  onStart: async function ({ api, message, event, args }) {
    let query = args.join(" ").trim();

    if (!query) {
      query = defaultQueries[Math.floor(Math.random() * defaultQueries.length)];
    }

    api.setMessageReaction("🏯", event.messageID, () => {}, true);

    const baseUrl = String(process.env.API_BASE_URL || "https://0x-mr-king-api-server-i73g.vercel.app").replace(/\/+$/, "");

    try {
      const res = await axios.get(`${baseUrl}/api/instagram`, {
        params: { query: query }
      });

      const payload = res.data && res.data.data ? res.data.data : null;
      const candidate = Array.isArray(payload)
        ? payload[Math.floor(Math.random() * payload.length)]
        : payload;

      const rawVideoUrl = candidate
        ? (candidate.download_api_url
            ? `${baseUrl}${candidate.download_api_url}`
            : candidate.download_url || candidate.video_url || candidate.url)
        : null;

      if (!res.data || !res.data.success || !rawVideoUrl) {
        throw new Error("No Instagram videos found!");
      }

      const videoUrl = await getDownloadUrl(rawVideoUrl, baseUrl);
      if (!videoUrl) throw new Error("No downloadable video URL found!");

      const buffer = await downloadBuffer(videoUrl);
      const filePath = path.join(__dirname, "cache", `ig_${Date.now()}.mp4`);

      await fs.ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, Buffer.from(buffer));

      api.setMessageReaction("🐇", event.messageID, () => {}, true);

      const infoCard =
        `╭─────────────────────────────────⬣\n` +
        `│ Made by 0xMr_King x ┃ Tanin Islam\n` +
        `╰─────────────────────────────────⬣`;

      return message.reply(
        { body: infoCard, attachment: fs.createReadStream(filePath) },
        () => {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      );
    } catch (error) {
      console.error("Instagram Error:", error.message);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return message.reply("Failed to fetch Instagram video, please try again!");
    }
  }
};
        
