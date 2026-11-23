const core = require("../../pairCore.js");

const STYLE = {
	width: 736,
	height: 414,
	background: "https://i.imgur.com/jhg6u7K.jpeg",
	from: "#a8edea",
	to: "#fed6e3",
	drawAvatars(ctx, one, two) {
		core.drawAvatar(ctx, one, 180, 40, 100, "#81c784", "circle", "A");
		core.drawAvatar(ctx, two, 450, 40, 100, "#81c784", "circle", "B");
	},
	message(a, b, p) {
		return `🌿 𝗦𝘂𝗻𝗻𝘆 𝗠𝗮𝘁𝗰𝗵𝗺𝗮𝗸𝗶𝗻𝗴 🌿\n\n🎀  ${a} ✨️\n🎀  ${b} ✨️\n\n💚 𝓘𝓷 𝓽𝓱𝓮 𝘨𝓻𝓮𝓮𝓷 𝓼𝓱𝓪𝓭𝓮 𝓸𝓯 𝓽𝓲𝓶𝓮, 𝔂𝓸𝓾𝓻 𝓱𝓮𝓪𝓻𝓽𝓼 𝓯𝓲𝓷𝓭 𝓮𝓪𝓬𝓱 𝓸𝓽𝓱𝓮𝓻 𝓹𝓮𝓻𝓯𝓮𝓬𝓽𝓵𝔂 🌱\n\n💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair7",
		aliases: ["lovepair7", "match7"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "1.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate a love match under sunny greenery with circular avatars" },
		longDescription: { en: "Calculates a love match between group members with custom background and perfectly aligned circular avatars." },
		guide: { en: "{p}{n} — Find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
