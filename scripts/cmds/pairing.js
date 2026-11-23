const core = require("../../pairCore.js");

const STYLE = {
	width: 800,
	height: 450,
	background: "https://i.imgur.com/J8gy1tA.jpeg",
	from: "#ff9a9e",
	to: "#fad0c4",
	drawAvatars(ctx, one, two, w) {
		core.drawAvatar(ctx, one, w - 210, 60, 150, "#ff80ab", "circle", "A");
		core.drawAvatar(ctx, two, w - 210, 240, 150, "#ff80ab", "circle", "B");
	},
	message(a, b, p) {
		return `𝐂𝐎𝐍𝐆𝐑𝐀𝐓𝐔𝐋𝐀𝐓𝐈𝐎𝐍𝐒\n━━━━━━━━━━━━━━━━\n${a}\n❤️ LOVE WITH ❤️\n${b}\n\nLove Match: ${p}% ❤️`;
	}
};

module.exports.config = {
	role: 0,
	countDown: 5,
	category: "love",
	shortDescription: "Pair sender with a random user from the group",
	longDescription: "Pair sender with a random group member with a love percentage and avatar image",
	guide: "{pn} pairing",
	author: "0xMr_King x ┃ Tanin Islam",
	name: "pairing",
	version: "1.0.1",
	hasPermssion: 0,
	credits: "0xMr_King x ┃ Tanin Islam",
	description: "Pair sender with a random user from the group",
	commandCategory: "love",
	usePrefix: true,
	usages: "pairing",
	cooldowns: 5
};

module.exports.onStart = ({ event, api }) => core.run({ api, event, style: STYLE });
