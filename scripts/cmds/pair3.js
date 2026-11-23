const core = require("../../pairCore.js");

const STYLE = {
	width: 800,
	height: 800,
	background: "https://i.imgur.com/fLcxkVF.jpeg",
	from: "#ff9a9e",
	to: "#fad0c4",
	drawAvatars(ctx, one, two) {
		core.drawAvatar(ctx, one, 220, 620, 140, "#ff80ab", "circle", "A");
		core.drawAvatar(ctx, two, 440, 620, 140, "#ff80ab", "circle", "B");
	},
	message(a, b, p) {
		return `💞 𝗠𝗮𝘁𝗰𝗵𝗺𝗮𝗸𝗶𝗻𝗴 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲 💞\n\n🎀  ${a} ✨️\n🎀  ${b} ✨️\n\n🕊️ 𝓓𝓮𝓼𝓽𝓲𝓷𝔂 𝓱𝓪𝓼 𝔀𝓻𝓲𝓽𝓽𝓮𝓷 𝔂𝓸𝓾𝓻 𝓷𝓪𝓶𝓮𝓼 𝓽𝓸𝓰𝓮𝓽𝓱𝓮𝓻  🌹 𝓜𝓪𝔂 𝔂𝓸𝓾𝓻 𝓫𝓸𝓷𝓭 𝓵𝓪𝓼𝓽 𝓯𝓸𝓻𝓮𝓿𝓮𝓻  ✨️\n\n💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair3",
		aliases: ["lovepair3", "match3"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "1.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate a love match with bottom pink circle avatars" },
		longDescription: { en: "Calculates a love match between group members with custom background and bottom pink-bordered circular avatars." },
		guide: { en: "{p}{n} — Find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
