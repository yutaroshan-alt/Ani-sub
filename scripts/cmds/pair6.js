const core = require("../../pairCore.js");

const STYLE = {
	width: 736,
	height: 414,
	background: "https://i.imgur.com/4r1eplj.jpeg",
	from: "#ffdde1",
	to: "#ee9ca7",
	drawAvatars(ctx, one, two) {
		core.drawAvatar(ctx, one, 180, 50, 100, "#ffb7c5", "circle", "A");
		core.drawAvatar(ctx, two, 450, 50, 100, "#ffb7c5", "circle", "B");
	},
	message(a, b, p) {
		return `🌸 𝓒𝓱𝓮𝓻𝓻𝔂 𝓑𝓵𝓸𝓼𝓸𝓸𝓶 𝓛𝓸𝓿𝓮 🌸\n\n🎀  ${a} ✨️\n🎀  ${b} ✨️\n\n🌸 𝓤𝓷𝓭𝓮𝓻 𝓽𝓱𝓮 𝓫𝓵𝓸𝓼𝓼𝓸𝓶𝓲𝓷𝓰 𝓫𝓻𝓪𝓷𝓬𝓱𝓮𝓼, 𝔂𝓸𝓾𝓻 𝓼𝓸𝓾𝓵𝓼 𝓪𝓻𝓮 𝓫𝓸𝓾𝓷𝓭 𝓽𝓸𝓰𝓮𝓽𝓱𝓮𝓻  🍡\n\n💘 𝙲𝚘𝚖𝚙𝚊𝚝𝚒𝚋𝚒𝚕𝚒𝚝𝚢: ${p}% 💘`;
	}
};

module.exports = {
	config: {
		name: "pair6",
		aliases: ["lovepair6", "match6"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "1.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate a love match under cherry blossoms with circular avatars" },
		longDescription: { en: "Calculates a love match between group members with custom cherry blossom background and elegantly positioned circular avatars." },
		guide: { en: "{p}{n} — Find a love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
