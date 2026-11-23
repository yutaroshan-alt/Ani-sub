const core = require("../../pairCore.js");

const STYLE = {
	width: 800,
	height: 400,
	background: "https://i.imgur.com/J8gy1tA.jpeg",
	from: "#ff9a9e",
	to: "#fecfef",
	drawAvatars(ctx, one, two, w) {
		core.drawAvatar(ctx, one, w - 210, 40, 150, "#ff80ab", "box", "A");
		core.drawAvatar(ctx, two, w - 210, 210, 150, "#ff80ab", "box", "B");
	},
	message(a, b, p) {
		return `💞 𝗠𝗮𝘁𝗰𝗵𝗺𝗮𝗸𝗶𝗻𝗴 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲 💞\n\n🎀  ${a} ✨️\n🎀  ${b} ✨️\n\n🕊️ 𝓓𝓮𝓼𝓽𝓲𝓷𝔂 𝓱𝓪𝓼 𝔀𝓻𝓲𝓽𝓽𝓮𝓷 𝔂𝓸𝓾𝓻 𝓷𝓪𝓶𝓮𝓼 𝓽𝓸𝓰𝓮𝓽𝓱𝓮𝓻  🌹 𝓜𝓪𝔂 𝔂𝓸𝓾𝓻 𝓫𝓸𝓷𝓭 𝓵𝓪𝓼𝓽 𝓯𝓸𝓻𝓮𝓿𝓮𝓻  ✨️\n\n💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair2",
		aliases: ["lovepair2", "match2"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "2.1",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate a love match with boxed profile pictures" },
		longDescription: { en: "Calculates a love match between group members with custom background and right-side boxed avatars." },
		guide: { en: "{p}{n} — Find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
