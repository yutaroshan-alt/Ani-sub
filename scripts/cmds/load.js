module.exports.config = {
    role: 2,
    countDown: 30,
    category: "Admin",
    shortDescription: "reload config file data",
    longDescription: "reload config file data",
    guide: "{pn} []",
    author: "0xMr_King x ┃ Tanin Islam",
  
	name: "load",
	version: "1.0.0",
	hasPermssion: 2,
	credits: "0xMr_King x ┃ Tanin Islam",
	description: "reload config file data",
	commandCategory: "Admin",
	usages: "[]",
	cooldowns: 30
};
module.exports.onStart = async function({ api, event, args,Threads, Users }) {
delete require.cache[require.resolve(global.client.configPath)];
global.config = require(global.client.configPath);
return api.sendMessage("[OK] Reloading config...", event.threadID, event.messageID);    
} 