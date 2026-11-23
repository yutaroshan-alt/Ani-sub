const { adminIDs: getAdminIDs, ownerID: getOwnerID } = require("../../func/bot-uids");
module.exports = {
  config: {
    name: "addowner",
    version: "1.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 0,
    shortDescription: "Add bot owner to group",
    category: "group",
    guide: "{pn}"
  },

  onStart: async function ({ api, event }) {
    const ownerID = getOwnerID();
    if (!ownerID) return api.sendMessage("❌ Owner UID config-e nei.", event.threadID);

    try {
      await api.addUserToGroup(ownerID, event.threadID);
      api.sendMessage(
        "✅ Bot Owner ke group e add kora holo.",
        event.threadID
      );
    } catch (e) {
      api.sendMessage(
        "❌ Owner ke add kora jay nai. Bot admin na hole add korte parbe na.",
        event.threadID
      );
    }
  }
};
