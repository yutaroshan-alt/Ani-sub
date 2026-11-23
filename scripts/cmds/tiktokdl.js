const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "tiktokdl",
    aliases: ["ttdl", "tiktok-base"],
    version: "1.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 0,
    shortDescription: "Download TikTok video without watermark",
    longDescription: "Fetches and sends a TikTok video from a provided TikTok link using 0xMr_King API.",
    category: "media",
    guide: "{pn} [tiktok_url]"
  },

  onStart: async function ({ api, message, event, args }) {
    const input = args.join(" ").trim();

    if (!input) {
      return message.reply("Please provide a valid TikTok video URL!");
    }

    api.setMessageReaction("🏯", event.messageID, () => {}, true);

    const baseUrl = String(process.env.API_BASE_URL || "https://0x-mr-king-api-server-i73g.vercel.app").replace(/\/+$/, "");

    try {
      const res = await axios.get(`${baseUrl}/api/tiktokdl`, {
        params: { url: input, link: input }
      });

      const payload = res.data && res.data.data ? res.data.data : res.data;
      const candidate = Array.isArray(payload) ? payload[0] : payload;

      const videoUrl = candidate
        ? (candidate.download_api_url
            ? `${baseUrl}${candidate.download_api_url}`
            : candidate.download_url || candidate.video_url || candidate.play || candidate.url)
        : null;

      if (!videoUrl) {
        throw new Error("Video download URL not found!");
      }

      const buffer = (await axios.get(videoUrl, { responseType: "arraybuffer" })).data;
      const filePath = path.join(__dirname, "cache", `ttdl_${Date.now()}.mp4`);

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
      console.error("TikTokDL Error:", error.message);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return message.reply("Failed to download TikTok video, please check the link and try again!");
    }
  }
};
