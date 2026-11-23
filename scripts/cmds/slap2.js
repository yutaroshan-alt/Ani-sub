const axios = require("axios");
const fs = require("fs");
const path = require("path");

const baseApiUrl = async () => require("./baseApiUrl.json").mahmud;

/**
 * @author 0xMr_King x ┃ Tanin Islam
 * @author: do not delete it
 */

module.exports.config = {
    role: 0,
    countDown: 8,
    category: "fun",
    shortDescription: "Fun slap image",
    longDescription: "Fun slap image",
    guide: "{pn} slap2 @mention / reply / uid",
  
  name: "slap2",
  version: "1.7",
  hasPermssion: 0,
  credits: "0xMr_King x ┃ Tanin Islam",
  description: "Fun slap image",
  commandCategory: "fun",
  usages: "slap2 @mention / reply / uid",
  cooldowns: 8
};

module.exports.onStart = async function ({ api, event, args }) {
  const obfuscatedAuthor = "0xMr_King x ┃ Tanin Islam";
  if (module.exports.config.credits !== obfuscatedAuthor) {
    return api.sendMessage(
      "You are not authorized to change the author name.",
      event.threadID,
      event.messageID
    );
  }

  const { threadID, messageID, messageReply, mentions, senderID } = event;

  let targetID;

  if (messageReply) {
    targetID = messageReply.senderID;
  } else if (Object.keys(mentions).length > 0) {
    targetID = Object.keys(mentions)[0];
  } else if (args[0]) {
    targetID = args[0];
  } else {
    return api.sendMessage(
      "❌ Mention, reply, or provide UID of the target.",
      threadID,
      messageID
    );
  }

  try {
    const url = `${await baseApiUrl()}/api/dig?type=buttslap&user=${senderID}&user2=${targetID}`;
    const res = await axios.get(url, { responseType: "arraybuffer" });

    const imgPath = path.join(__dirname, `/cache/slap_${targetID}.png`);
    fs.writeFileSync(imgPath, res.data);

    api.sendMessage(
      {
        body: "💥 Buttslap successful!",
        attachment: fs.createReadStream(imgPath)
      },
      threadID,
      () => fs.unlinkSync(imgPath),
      messageID
    );
  } catch (e) {
    console.error(e);
    api.sendMessage("🥹 Error! Contact 0xMr_King x ┃ Tanin Islam.", threadID, messageID);
  }
};
