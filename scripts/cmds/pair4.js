const core = require("../../pairCore.js");

const STYLE = {
	width: 800,
	height: 450,
	background: "https://i.imgur.com/cuwycjP.jpeg",
	from: "#a18cd1",
	to: "#fbc2eb",
	drawAvatars(ctx, one, two, w) {
		core.drawAvatar(ctx, one, 40, 150, 130, "#9c27b0", "circle", "A");
		core.drawAvatar(ctx, two, w - 170, 150, 130, "#9c27b0", "circle", "B");
	},
	message(a, b, p) {
		return `✨ 𝗟𝗼𝘃𝗲 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗶𝗼𝗻 𝗙𝗼𝘂𝗻𝗱 ✨\n\n🎀  ${a} 💫\n🎀  ${b} 💫\n\n🌌 𝓤𝓷𝓭𝓮𝓻 𝓽𝓱𝓮 𝓼𝓽𝓪𝓻𝓻𝔂 𝓷𝓲𝓰𝓱𝓽, 𝔂𝓸𝓾𝓻 𝓱𝓮𝓪𝓻𝓽𝓼 𝓫𝓮𝓪𝓽 𝓪𝓼 𝓸𝓷𝓮  💜\n\n💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair4",
		aliases: ["lovepair4", "match4"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "1.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate a love match with purple circle avatars on edges" },
		longDescription: { en: "Calculates a love match between group members with custom background and edge purple-bordered circular avatars." },
		guide: { en: "{p}{n} — Find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
