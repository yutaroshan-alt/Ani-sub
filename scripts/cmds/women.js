const fs = require("fs");
module.exports.config = {
    role: 0,
    countDown: 5,
    category: "no prefix",
    shortDescription: "hihihihi",
    longDescription: "hihihihi",
    guide: "{pn} women",
    author: "0xMr_King x ┃ Tanin Islam",
  
	name: "women",
    version: "1.0.1",
	hasPermssion: 0,
	credits: "0xMr_King x ┃ Tanin Islam", 
	description: "hihihihi",
	commandCategory: "no prefix",
	usages: "women",
    cooldowns: 5, 
};

module.exports.handleEvent = function({ api, event, client, __GLOBAL }) {
	var { threadID, messageID } = event;
	if (event.body.indexOf("Women")==0 || event.body.indexOf("women")==0 || event.body.indexOf("WOMEN")==0 || event.body.indexOf("☕")==0) {
		var msg = {
				body: "hahaha Women 🤣",
				attachment: fs.createReadStream(__dirname + `/noprefix/wn.mp4`)
			}
			api.sendMessage(msg, threadID, messageID);
    api.setMessageReaction("☕", event.messageID, (err) => {}, true)
		}
	}
	module.exports.onStart = function({ api, event, client, __GLOBAL }) {

  }
