const core = require("../../pairCore.js");

const STYLE = {
	width: 586,
	height: 330,
	background: "https://i.imgur.com/6BF4EVq.jpeg",
	from: "#c2e9fb",
	to: "#abf1e4",
	drawAvatars(ctx, one, two) {
		core.drawAvatar(ctx, one, 30, 40, 95, "#c8e6c9", "circle", "A");
		core.drawAvatar(ctx, two, 30, 160, 95, "#c8e6c9", "circle", "B");
	},
	message(a, b, p) {
		return `✨ 𝗘𝗡𝗘𝗡 𝗢𝗙 𝗘𝗧𝗘𝗥𝗡𝗔𝗟 𝗟𝗢𝗩𝗘 ✨\n\n🌸 ${a} 🍃\n🌸 ${b} 🍃\n\n🌿 𝓘𝓷 𝓽𝓱𝓮 𝓺𝓾𝓲𝓮𝓽 𝔀𝓱𝓲𝓼𝓹𝓮𝓻𝓼 𝓸𝓯 𝓽𝓱𝓮 𝔀𝓲𝓷𝓭, 𝔂𝓸𝓾𝓻 𝓼𝓸𝓾𝓵𝓼 𝓪𝓻𝓮 𝔀𝓸𝓿𝓮𝓷 𝓽𝓸𝓰𝓮𝓽𝓱𝓮𝓻 𝓯𝓸𝓻𝓮𝓿𝓮𝓻 🍃\n\n💖 Compatibility Level: ${p}% 💖`;
	}
};

module.exports = {
	config: {
		name: "pair8",
		aliases: ["lovepair8", "match8"],
		author: "0xMr_King x ┃ Tanin Islam",
		version: "2.0",
		role: 0,
		category: "love",
		shortDescription: { en: "💘 Generate an upgraded love match with left side vertical circular avatars" },
		longDescription: { en: "Calculates an upgraded love match between group members with custom background and left-side vertical circular avatars." },
		guide: { en: "{p}{n} — Find an upgraded love match" }
	},
	onStart: ({ api, event }) => core.run({ api, event, style: STYLE })
};
