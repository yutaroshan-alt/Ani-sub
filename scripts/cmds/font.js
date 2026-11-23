const engine = require("../../textEngine.js");

module.exports = {
	config: {
		name: "font",
		aliases: ["fonts", "style", "fontstyle"],
		version: "3.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 4,
		role: 0,
		shortDescription: "Convert text to 23+ fancy Unicode fonts (offline)",
		longDescription: "No API needed. Supports every script: Bengali, English, Arabic, emoji — nothing gets broken.",
		category: "text",
		guide: "{pn} list [page]\n{pn} <number|style> <text>\n{pn} (reply to a message)"
	},

	onStart: async function ({ message, args, event }) {
		if (!args.length || args[0].toLowerCase() === "list")
			return message.reply(engine.list(args[1] || 1));

		let text = args.slice(1).join(" ").trim();
		if (!text && event.messageReply && event.messageReply.body)
			text = event.messageReply.body;
		if (!text)
			return message.reply([
				engine.styleHeader('𝐅𝐨𝐧𝐭 𝐔𝐬𝐚𝐠𝐞'),
				engine.styleLine('Use', `${engine.currentPrefix()}font <number|name> <text>`),
				engine.styleLine('Styles', `${engine.currentPrefix()}font list`)
			].join('\n'));

		const resolved = engine.resolveStyle(args[0]);
		return message.reply([
			engine.styleHeader('𝐅𝐨𝐧𝐭 𝐒𝐭𝐲𝐥𝐞'),
			engine.styleLine('Output', engine.convert(text, resolved))
		].join('\n'));
	}
};
