const axios = require("axios");

const baseApiUrl = async () => require("./baseApiUrl.json").mahmud;

/**
* @author 0xMr_King x ┃ Tanin Islam
* @author: do not delete it
*/

module.exports = {
  config: {
    name: "footballgame",
    aliases: ["football"],
    version: "1.7",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 10,
    role: 0,
    category: "game",
    guide: {
      en: "{pn}"
    }
  },

  onReply: async function ({ api, event, Reply, usersData }) {
    const obfuscatedAuthor = "0xMr_King x ┃ Tanin Islam";  if (module.exports.config.author !== obfuscatedAuthor) {
    return api.sendMessage("You are not authorized to change the author name.", event.threadID, event.messageID);
  }
    const { footballNames, author, messageID } = Reply;
    const getCoin = 500;
    const getExp = 121;

    if (event.senderID !== author) {
      return api.sendMessage("𝐓𝐡𝐢𝐬 𝐢𝐬 𝐧𝐨𝐭 𝐲𝐨𝐮𝐫 𝐪𝐮𝐢𝐳 𝐛𝐚𝐛𝐲 >🐸", event.threadID, event.messageID);
    }

    const reply = event.body.trim().toLowerCase();
    const isCorrect = footballNames.some(name => name.toLowerCase() === reply);
    const userData = await usersData.get(event.senderID);

    await api.unsendMessage(messageID);

    if (isCorrect) {
      try {
        await usersData.set(event.senderID, {
          money: userData.money + getCoin,
          exp: userData.exp + getExp
        });

        return api.sendMessage(
          `✅ | Correct answer baby.\nYou have earned ${getCoin} coins and ${getExp} exp.`,
          event.threadID,
          event.messageID
        );
      } catch (err) {
        console.log("Error:", err.message);
      }
    } else {
      return api.sendMessage(
        `❌ | Wrong Answer baby.\nCorrect answer was: ${footballNames.join(" / ")}`,
        event.threadID,
        event.messageID
      );
    }
  },

  onStart: async function ({ api, event, usersData }) {
    const obfuscatedAuthor = "0xMr_King x ┃ Tanin Islam"; 
    if (module.exports.config.author !== obfuscatedAuthor) {
      return api.sendMessage("You are not authorized to change the author name.\n", event.threadID, event.messageID);
    }

    try {
      const { senderID } = event;
      const userData = await usersData.get(senderID);

      const apiUrl = await baseApiUrl();
      const response = await axios.get(`${apiUrl}/api/football`);
      const { name, imgurLink } = response.data.football;
      const footballNames = Array.isArray(name) ? name : [name];

      const imageStream = await axios({
        url: imgurLink,
        method: "GET",
        responseType: "stream",
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      api.sendMessage(
        {
          body: "A famous footballer has appeared! Guess their name.",
          attachment: imageStream.data
        },
        event.threadID,
        (err, info) => {
          if (err) return;
          global.GoatBot.onReply.set(info.messageID, {
            commandName: this.config.name,
            type: "reply",
            messageID: info.messageID,
            author: senderID,
            footballNames
          });

          setTimeout(() => {
            api.unsendMessage(info.messageID);
          }, 40000);
        },
        event.messageID
      );
    } catch (error) {
      console.error("Error:", error.message);
      api.sendMessage("🥹error, contact 0xMr_King x ┃ Tanin Islam.", event.threadID, event.messageID);
    }
  }
};
