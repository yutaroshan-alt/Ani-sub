const core = require("../../pairCore.js");

const STYLE = {
	width: 800,
	height: 400,
	background: "https://files.catbox.moe/29jl5s.jpg",
	from: "#ffd1ff",
	to: "#ffe9d6",
	drawAvatars(ctx, one, two, w) {
		core.drawAvatar(ctx, one, 385, 40, 170, "#ff80ab", "circle", "A");
		core.drawAvatar(ctx, two, w - 213, 190, 170, "#ff80ab", "circle", "B");
	},
	message(a, b, p) {
		return `💞 𝗠𝗮𝘁𝗰𝗵𝗺𝗮𝗸𝗶𝗻𝗴 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲 💞\n\n🎀  ${a} ✨️\n🎀  ${b} ✨️\n\n🕊️ 𝓓𝓮𝓼𝓽𝓲𝓷𝔂 𝓱𝓪𝓼 𝔀𝓻𝓲𝓽𝓽𝓮𝓷 𝔂𝓸𝓾𝓻 𝓷𝓪𝓶𝓮𝓼 𝓽𝓸𝓷𝓲𝓰𝓱𝓽  🌹 𝓜𝓪𝔂 𝔂𝓸𝓾𝓻 𝓫𝓸𝓷𝓭 𝓵𝓪𝓼𝓽 𝓯𝓸𝓻𝓮𝓿𝓮𝓻  ✨️\n\n💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair",
		aliases: ["lovepair", "match"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "1.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate a love match between you and another group member" },
		longDescription: { en: "Calculates a love match between group members. Shows circular avatars, background and love percentage." },
		guide: { en: "{p}{n} — Use this command in a group to find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
