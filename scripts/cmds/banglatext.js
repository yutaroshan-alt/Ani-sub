const engine = require("../../textEngine.js");

const BOX = ["╭──────────────⬣", "│ ", "╰──────────────⬣"];
const STARS = ["✦ ─────────── ✦", "   ", "✦ ─────────── ✦"];
const HEART = ["♡──────────♡", "♥ ", "♡──────────♡"];

const DECORATIONS = {
	plain: BOX, box: BOX, star: STARS, heart: HEART
};

module.exports = {
	config: {
		name: "banglatext",
		aliases: ["bangla", "bntext", "btextbangla", "banglastyle"],
		version: "1.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 4,
		role: 0,
		shortDescription: "Bengali text with styles — works with any script and emoji",
		longDescription: "Bangla, English, Arabic, emoji — all preserved. Styles: box, star, heart, bold, underline, strike, plain.",
		category: "text",
		guide: "{pn} <style> <text>\n{pn} list\n{pn} (reply to a message)"
	},

	onStart: async function ({ message, args, event }) {
		const first = (args[0] || "").toLowerCase();
		if (first === "list" || first === "help") {
			return message.reply([
				engine.styleHeader('🇧🇩 𝐁𝐚𝐧𝐠𝐥𝐚 𝐓𝐞𝐱𝐭 𝐒𝐭𝐲𝐥𝐞𝐬'),
				engine.styleLine('box / star / heart', 'decorative frame'),
				engine.styleLine('bold / italic / script / mono', 'Unicode styles'),
				engine.styleLine('underline / strike / overline', 'combining marks'),
				engine.styleLine('plain', 'clean original text'),
				'',
				engine.styleLine('Scripts', 'বাংলা, English, العربية, हिन्दी, emoji — সব সাপোর্টেড')
			].join('\n'));
		}

		const isDecoration = first in DECORATIONS;
		const isStyle = !isDecoration && !!engine.resolveStyle(first) && (args.length > 1 || /^\d+$/.test(first));
		let text = (isDecoration || isStyle ? args.slice(1) : args).join(" ").trim();
		if (!text && event.messageReply && event.messageReply.body)
			text = event.messageReply.body.trim();
		if (!text)
			return message.reply([
				engine.styleHeader('𝐁𝐚𝐧𝐠𝐥𝐚 𝐓𝐞𝐱𝐭 𝐔𝐬𝐚𝐠𝐞'),
				engine.styleLine('Example', `${engine.currentPrefix()}banglatext box তোমার টেক্সট`),
				engine.styleLine('Styles', `${engine.currentPrefix()}banglatext list`)
			].join('\n'));

		if (isStyle) {
			return message.reply([
				engine.styleHeader('𝐁𝐚𝐧𝐠𝐥𝐚 𝐓𝐞𝐱𝐭'),
				engine.styleLine('Output', engine.convert(text, first)),
				engine.styleLine('Script', engine.detectScripts(text).join(', '))
			].join('\n'));
		}

		const decorated = isDecoration ? DECORATIONS[first] : DECORATIONS.box;
		return message.reply([
			engine.styleHeader('𝐁𝐚𝐧𝐠𝐥𝐚 𝐓𝐞𝐱𝐭'),
			decorated[0],
			decorated[1] + engine.stripFormat(text),
			decorated[2],
			engine.styleLine('Script', engine.detectScripts(text).join(', '))
		].join('\n'));
	}
};
