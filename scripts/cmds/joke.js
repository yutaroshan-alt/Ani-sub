 
const axios = require("axios");

module.exports = {
	config: {
		name: "joke",
		aliases: ["jokes", "dadjoke", "funny"],
		version: "1.1.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 3,
		role: 0,
		category: "fun",
		shortDescription: "Get a random dad joke",
		guide: "{pn}"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID } = event;
		api.setMessageReaction("😂", messageID, () => {}, true);

		try {
			const res = await axios.get("https://icanhazdadjoke.com/", {
				headers: {
					Accept: "application/json",
					"User-Agent": "Aliya-Official-Bot"
				}
			});

			const jokeText = res.data.joke;
			const msg = `𓍢ִ໋🌸✧ ── ͟͟͞͞Rᴀɴᴅᴏᴍ Jᴏᴋᴇ ── ✧🌸𓍢ִ໋\n\n${jokeText}`;
			return api.sendMessage(msg, threadID, messageID);
		} catch (err) {
			api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
		}
	}
};