const engine = require("../../textEngine.js");

module.exports = {
	config: {
		name: "simpletext",
		aliases: ["simple", "plaintext", "clean", "normaltext"],
		version: "1.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 4,
		role: 0,
		shortDescription: "Clean / normalize any text (all languages supported)",
		longDescription: "Removes invisible characters, converts fancy Unicode back to plain text and applies case options.",
		category: "text",
		guide: "{pn} <text> [--upper|--lower|--title|--nospaces]\n{pn} (reply to a message)"
	},

	onStart: async function ({ message, args, event }) {
		let mode = "plain";
		const flags = ["--upper", "--lower", "--title", "--nospaces"];
		const found = args.find(a => flags.includes(a.toLowerCase()));
		if (found) mode = found.toLowerCase().slice(2);

		let text = args.filter(a => !flags.includes(a.toLowerCase())).join(" ").trim();
		if (!text && event.messageReply && event.messageReply.body)
			text = event.messageReply.body;

		if (!text)
			return message.reply([
				engine.styleHeader('𝐒𝐢𝐦𝐩𝐥𝐞 𝐓𝐞𝐱𝐭 𝐔𝐬𝐚𝐠𝐞'),
				engine.styleLine('Example', `${engine.currentPrefix()}simpletext 𝐇𝐞𝐥𝐥𝐨 --lower`)
			].join('\n'));

		const clean = engine.normalizeSimple(text, mode);
		return message.reply([
			engine.styleHeader('𝐒𝐢𝐦𝐩𝐥𝐞 𝐓𝐞𝐱𝐭'),
			engine.styleLine('Output', clean),
			engine.styleLine('Scripts', engine.detectScripts(clean).join(', '))
		].join('\n'));
	}
};
