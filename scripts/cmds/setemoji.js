module.exports.config = {
    role: 0,
    countDown: 3,
    category: "Group",
    shortDescription: "Change emoji in group",
    longDescription: "Change emoji in group",
    guide: "{pn} setemoji [emoji]",
    author: "0xMr_King x ┃ Tanin Islam",
  
	name: "setemoji",
	version: "1.0.0",
	hasPermssion: 0,
	credits: "0xMr_King x ┃ Tanin Islam",
	description: "Change emoji in group",
	commandCategory: "Group",
	usages: "setemoji [emoji]",
	cooldowns: 3
};

module.exports.onStart = async function({ api, event, args }) {
	const emoji = args.join(" ")
	api.changeThreadEmoji(`${args.join(" ")}`, event.threadID, event.messagaID);
}