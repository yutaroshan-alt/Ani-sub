module.exports = {
	config: {
		name: "commandName",
		version: "4.0",
		author: "0xMr_King x ┃ Tanin Islam",
		category: "events"
	},

	langs: {
		en: {
			hello: "Hello new member!",
			helloWithName: "Hello new member, your ID is %1"
		}
	},

	onStart: async function ({ api, usersData, threadsData, message, event, userModel, threadModel, prefix, dashBoardModel, globalModel, dashBoardData, globalData, envCommands, envEvents, envGlobal, role, getLang, commandName }) {
		if (event.logMessageType === "log:subscribe") { 
			return message.send(getLang("hello"));
		}
	}
};
