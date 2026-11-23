const engine = require("../../textEngine.js");

module.exports = {
	config: {
		name: "boldtext",
		aliases: ["bold", "btext", "boldtxt", "boldify"],
		version: "1.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 4,
		role: 0,
		shortDescription: "Convert any text to bold (and 20+ other styles)",
		longDescription: "Bold text for Latin, keeps Bengali/Arabic/emoji intact. Reply to a message to style it.",
		category: "text",
		guide: "{pn} <text>\n{pn} <style|number> <text>\n{pn} list\n{pn} (reply to a message)"
	},

	onStart: async function ({ message, args, event }) {
		let text = args.join(" ").trim();
		let style = "bold";

		if (!text && event.messageReply && event.messageReply.body)
			text = event.messageReply.body.trim();

		if (args[0] && args[0].toLowerCase() === "list")
			return message.reply(engine.list(args[1] || 1));

		if (args.length > 1 && engine.resolveStyle(args[0])) {
			style = engine.resolveStyle(args[0]);
			text = args.slice(1).join(" ").trim();
		}

		if (!text)
			return message.reply([
				engine.styleHeader('𝐁𝐨𝐥𝐝 𝐓𝐞𝐱𝐭 𝐔𝐬𝐚𝐠𝐞'),
				engine.styleLine('Example', `${engine.currentPrefix()}boldtext Hello bold`),
				engine.styleLine('Styles', `${engine.currentPrefix()}boldtext list`)
			].join('\n'));

		return message.reply([
			engine.styleHeader('𝐁𝐨𝐥𝐝 𝐓𝐞𝐱𝐭'),
			engine.styleLine('Output', engine.convert(text, style))
		].join('\n'));
	}
};
