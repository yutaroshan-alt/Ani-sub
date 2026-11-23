const axios = require("axios");
const fs = require("fs");
const path = require("path");

const baseApiUrl = async () => require("./baseApiUrl.json").mahmud;

/**
* @author 0xMr_King x ┃ Tanin Islam
* @author: do not delete it
*/

module.exports = {
  config: {
    name: "jail2",
    aliases: [],
    version: "1.7",
    author: "0xMr_King x ┃ Tanin Islam",
    role: 0,
    category: "Tag Fun",
    cooldown: 10,
    guide: "gay [mention-reply-UID]",
  },

  onStart: async function ({ api, event, args }) {
     const obfuscatedAuthor = "0xMr_King x ┃ Tanin Islam";
     if (module.exports.config.author !== obfuscatedAuthor) {
     return api.sendMessage(
     "You are not authorized to change the author name.", event.threadID, event.messageID );
   }

    const { threadID, messageID, messageReply, mentions } = event;
    let id2; if (messageReply) { id2 = messageReply.senderID; } else if (Object.keys(mentions).length > 0) {
    id2 = Object.keys(mentions)[0];  } else if (args[0]) {  id2 = args[0]; } else {
    return api.sendMessage( "baby, Mention, reply, or provide UID of the target.", threadID, messageID );
  }

   try {
    const url = `${await baseApiUrl()}/api/dig?type=jail&user=${id2}`;
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const filePath = path.join(__dirname, `jail_${id2}.png`);
    fs.writeFileSync(filePath, response.data);

     
    api.sendMessage({ attachment: fs.createReadStream(filePath),
    body: `𝐄𝐟𝐟𝐞𝐜𝐭 jail 𝐬𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥 🐸`,
     },
    threadID, () => fs.unlinkSync(filePath),  messageID );
  } catch (err) {
    console.error(err);
    api.sendMessage(`🥹error, contact Kakashi.`, threadID, messageID);
    }
  },
};
