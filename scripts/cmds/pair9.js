const core = require("../../pairCore.js");

const STYLE = {
	width: 546,
	height: 373,
	background: "https://i.imgur.com/pUVpWbb.jpeg",
	from: "#fbc2eb",
	to: "#a6c1ee",
	drawAvatars(ctx, one, two) {
		core.drawAvatar(ctx, one, 35, 40, 95, "#ffffff", "circle", "A");
		core.drawAvatar(ctx, two, 35, 175, 95, "#ffffff", "circle", "B");
	},
	message(a, b, p) {
		return `✨ 𝗘𝗟𝗘𝗚𝗔𝗡𝗧 𝗟𝗢𝗩𝗘 𝗠𝗔𝗧𝗖𝗛 ✨\n\n🌸 ${a} 🤍\n🌸 ${b} 🤍\n\n⚔️ 𝗧𝘄𝗼 𝗵𝗲𝗮𝗿𝘁𝘀 𝗯𝗹𝗼𝘀𝘀𝗼𝗺𝗶𝗻𝗴 𝘁𝗼𝗴𝗲𝘁𝗵𝗲𝗿 𝗶𝗻 𝘁𝗵𝗲 𝗽𝘂𝗿𝗲𝘀𝘁 𝗴𝗮𝗿𝗱𝗲𝗻 𝗼𝗳 𝗱𝗲𝘀𝘁𝗶𝗻𝘆 🌸\n\n💘 𝗖𝗼𝗺𝗽𝗮𝘁𝗶𝗯𝗶𝗹𝗶𝘁𝘆: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair9",
		aliases: ["lovepair9", "match9"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "1.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate an elegant love match with left side vertical circular avatars" },
		longDescription: { en: "Calculates an elegant love match between group members with custom background and left-side vertical circular avatars." },
		guide: { en: "{p}{n} — Find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
