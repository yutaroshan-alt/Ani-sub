const axios = require("axios");
const fs = require("fs");
const path = require("path");

const mahmud = async () => require("./baseApiUrl.json").mahmud;

module.exports = {
  config: {
    name: "onepiece",
    aliases: ["onepiecevid", "onep", "onepvideo"],
    version: "1.7",
    role: 0,
    author: "0xMr_King x ┃ Tanin Islam",
    category: "anime",
    guide: {
      en: "Use {pn} to get a random onepiece video."
    }
  },

  onStart: async function ({ api, event }) {
    const obfuscatedAuthor = "0xMr_King x ┃ Tanin Islam"; 
    if (module.exports.config.author !== obfuscatedAuthor) {
      return api.sendMessage("You are not authorized to change the author name.", event.threadID, event.messageID);
    }
    
    try {
      const apiUrl = await mahmud();
      const res = await axios.get(`${apiUrl}/api/album/mahmud/videos/onepiece?userID=${event.senderID}`);
      if (!res.data.success || !res.data.videos.length)
        return api.sendMessage("❌ | No onepiece videos found.", event.threadID, event.messageID);

      const url = res.data.videos[Math.floor(Math.random() * res.data.videos.length)];
      const filePath = path.join(__dirname, "temp_video.mp4");

      const video = await axios({
        url,
        method: "GET",
        responseType: "stream",
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const writer = fs.createWriteStream(filePath);
      video.data.pipe(writer);

      writer.on("finish", () => {
        api.sendMessage({
          body: "✨ | 𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐎𝐧𝐞 𝐩𝐢𝐞𝐜𝐞 𝐯𝐢𝐝𝐞𝐨",
          attachment: fs.createReadStream(filePath)
        }, event.threadID, () => fs.unlinkSync(filePath), event.messageID);
      });

      writer.on("error", () => {
        api.sendMessage("❌ | Download error.", event.threadID, event.messageID);
      });
    } catch (e) {
      console.error("ERROR:", e);
      api.sendMessage("🥹error, contact 0xMr_King x ┃ Tanin Islam.", event.threadID, event.messageID);
    }
  }
};
