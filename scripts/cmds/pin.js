const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { downloadPinVideo } = require("../../pinVideo.js");

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

module.exports = {
  config: {
    name: "pin",
    aliases: ["pinterest-base"],
    version: "1.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 0,
    shortDescription: "Search and download Pinterest images or videos",
    longDescription: "Searches Pinterest for images or videos by keyword using 0xMr_King API.",
    category: "media",
    guide: "{pn} [query] or {pn} [query] -v (for video)"
  },

  onStart: async function ({ api, message, event, args }) {
    if (!args[0]) {
      return message.reply("Please provide a search query! (Ex: pin anime wallpaper or pin nature -v)");
    }

    let isVideo = false;
    let queryArgs = [];

    for (const arg of args) {
      if (arg.toLowerCase() === "-v" || arg.toLowerCase() === "--video" || arg.toLowerCase() === "type=video") {
        isVideo = true;
      } else {
        queryArgs.push(arg);
      }
    }

    const query = queryArgs.join(" ").trim();
    if (!query) {
      return message.reply("Please provide a valid search keyword!");
    }

    api.setMessageReaction("🏯", event.messageID, () => {}, true);

    const baseUrl = String(process.env.API_BASE_URL || "https://0x-mr-king-api-server-i73g.vercel.app").replace(/\/+$/, "");

    try {
      const params = { query: query };
      if (isVideo) {
        params.type = "video";
      }

      const res = await axios.get(`${baseUrl}/api/pin`, { params });

      const payload = res.data && res.data.data ? res.data.data : res.data;
      const results = Array.isArray(payload)
        ? payload
        : payload && Array.isArray(payload.results)
        ? payload.results
        : payload && Array.isArray(payload.pins)
        ? payload.pins
        : payload && Array.isArray(payload.images)
        ? payload.images
        : payload && Array.isArray(payload.videos)
        ? payload.videos
        : payload
        ? [payload]
        : [];

      if (!res.data || res.data.success === false || results.length === 0) {
        throw new Error("No Pinterest results found!");
      }

      const attachments = [];
      const tempFiles = [];
      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);

      if (isVideo) {
        const picked = results[Math.floor(Math.random() * results.length)];
        if (!picked) throw new Error("Video result not found!");

        const item = typeof picked === "string"
          ? { media_url: picked, is_hls: /\.m3u8(\?|$)/i.test(picked) }
          : picked;
        const rawMediaUrl = item.media_url || item.video_url || item.download_url || item.url || item.download_api_url;
        if (!rawMediaUrl) throw new Error("Video URL not found!");

        if (!item.media_url) item.media_url = rawMediaUrl;
        if (item.download_api_url && item.download_api_url.startsWith("/"))
          item.download_api_url = `${baseUrl}${item.download_api_url}`;

        const video = await downloadPinVideo(item, cacheDir);
        attachments.push(fs.createReadStream(video.path));
        tempFiles.push(video.path);
      } else {
        const shuffled = results.sort(() => 0.5 - Math.random()).slice(0, 6);

        for (let i = 0; i < shuffled.length; i++) {
          const item = shuffled[i];
          const rawImgUrl = typeof item === "string"
            ? item
            : item.image_url || item.download_url || item.url || item.media_url || item.image;

          if (!rawImgUrl) continue;

          try {
            const imgUrl = await getDownloadUrl(rawImgUrl, baseUrl);
            if (!imgUrl) continue;
            const buffer = await downloadBuffer(imgUrl);
            const ext = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(imgUrl) ? (imgUrl.match(/\.(png|jpe?g|webp|gif)/i)[1].toLowerCase().replace("jpeg", "jpg")) : "jpg";
            const filePath = path.join(cacheDir, `pin_${Date.now()}_${i}.${ext}`);
            fs.writeFileSync(filePath, Buffer.from(buffer));

            attachments.push(fs.createReadStream(filePath));
            tempFiles.push(filePath);
          } catch (e) {}
        }
      }

      if (attachments.length === 0) {
        throw new Error("Failed to download Pinterest media!");
      }

      api.setMessageReaction("🐇", event.messageID, () => {}, true);

      const infoCard =
        `╭─────────────────────────────────⬣\n` +
        `│ Made by 0xMr_King x ┃ Tanin Islam\n` +
        `╰─────────────────────────────────⬣`;

      return message.reply(
        { body: infoCard, attachment: attachments },
        () => {
          for (const file of tempFiles) {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          }
        }
      );
    } catch (error) {
      if (process.env.DEBUG_API) console.error("Pin Error:", error.message);
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      return message.reply("Failed to fetch Pinterest media, please try again!");
    }
  }
};
                                            
