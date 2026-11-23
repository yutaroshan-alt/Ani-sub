const { adminIDs: getAdminIDs, ownerID: getOwnerID } = require("../../func/bot-uids");
module.exports.config = {
    role: 2,
    countDown: 5,
    category: "spam",
    shortDescription: "",
    longDescription: "",
    guide: "{pn} [msg] [amount]",
    author: "0xMr_King x ┃ Tanin Islam",
  
name: "spam",
 version: "",
 hasPermssion: 2,
 credits: "0xMr_King x ┃ Tanin Islam",
 description: "",
 commandCategory: "spam",
 usages: "[msg] [amount]",
 cooldowns: 5,
 dependencies: "",
};

module.exports.onStart = function ({ api, event, Users, args }) {
 const permission = getAdminIDs();
 if (!permission.includes(event.senderID))
 return api.sendMessage("Only Bot Admin Can Use this command", event.threadID, event.messageID);
 if (args.length !== 2) {
 api.sendMessage(`Invalid number of arguments. Usage: ${global.config.PREFIX}spam [msg] [amount]`, event.threadID);
 return;
 }
 var { threadID, messageID } = event;
 var k = function (k) { api.sendMessage(k, threadID)};

 const msg = args[0];
 const count = args[1];

 //*vonglap

for (i = 0; i < `${count}`; i++) {
 k(`${msg}`);
}

}
