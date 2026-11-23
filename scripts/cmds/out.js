module.exports = {
  config: {
    name: "out",
    aliases: ["leave"],
    version: "1.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 3,
    shortDescription: {
      en: "Bot leaves the group",
    },
    category: "owner",
    guide: {
      en: "{pn} — Make bot leave from this group"
    }
  },

  onStart: async function ({ api, event }) {
    try {

      await api.sendMessage(
        "😢 𝘖𝘬𝘢𝘺, 𝘐'𝘮 𝘭𝘦𝘢𝘷𝘪𝘯𝘨 𝘵𝘩𝘪𝘴 𝘨𝘳𝘰𝘶𝘱...\n💌 𝘛𝘢𝘬𝘦 𝘤𝘢𝘳𝘦 𝘦𝘷𝘦𝘳𝘺𝘰𝘯𝘦 💖",
        event.threadID
      );

      setTimeout(() => {
        api.removeUserFromGroup(api.getCurrentUserID(), event.threadID);
      }, 500);
    } catch (err) {
      console.error(err);
      api.sendMessage("❌ Failed to leave the group.", event.threadID);
    }
  }
};
