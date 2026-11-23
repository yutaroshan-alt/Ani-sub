const util = require("util");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { exec, execSync } = require("child_process");

const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const MAX_LENGTH = 3800;
const TIMEOUT_MS = 60000;

function clean(text) {
	let out = String(text);
	if (process.env.HOME) out = out.split(process.env.HOME).join("~");
	out = out.split(process.cwd()).join(".");
	return out.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

function format(value) {
	if (value === undefined) return "";
	if (typeof value === "string") return clean(value);
	if (typeof value === "bigint") return value.toString() + "n";
	if (typeof value === "function") return clean(value.toString());
	if (value instanceof Error) return clean(value.stack || value.message);
	if (Buffer.isBuffer(value)) return clean(value.toString("utf8"));
	if (value instanceof Map) {
		const obj = {};
		value.forEach((v, k) => { obj[String(k)] = v; });
		return clean(util.inspect(obj, { depth: 4, maxArrayLength: 50 }));
	}
	if (value instanceof Set) {
		return clean(util.inspect([...value], { depth: 4, maxArrayLength: 50 }));
	}
	return clean(util.inspect(value, { depth: 4, maxArrayLength: 50, breakLength: 120, colors: false, getters: false }));
}

function sendText(api, threadID, messageID, text, title) {
	let body = format(text);
	const chunks = [];
	while (body.length > MAX_LENGTH) {
		chunks.push(body.slice(0, MAX_LENGTH));
		body = body.slice(MAX_LENGTH);
	}
	chunks.push(body);
	const header = title ? `${title}\n\n` : "";
	return Promise.all(chunks.map((chunk, index) => {
		const label = chunks.length > 1 ? `[${index + 1}/${chunks.length}]\n` : "";
		return api.sendMessage(`${header}${label}\`\`\`javascript\n${chunk}\n\`\`\``, threadID, messageID);
	}));
}

async function runCode({ api, event, code, args, role, context = {} }) {
	const { threadID, messageID, senderID } = event;

	if (Number(role || 0) < 2)
		return api.sendMessage(`⛔ Admin only.\nMade by ${AUTHOR}`, threadID, messageID);

	code = String(code || "").replace(/^\s*```(?:js|javascript)?\s*/i, "").replace(/```\s*$/, "");
	code = code.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, "$2");
	if (!code.trim()) return;

	const out = data => sendText(api, threadID, messageID, data);
	const output = out;
	const react = emoji => api.setMessageReaction(emoji, messageID, () => {}, true);
	const reply = text => api.sendMessage(clean(text), threadID, messageID);
	const send = (text, targetID = threadID) => api.sendMessage(clean(text), targetID);

	const base = {
		api, event, args, message: context.message, role, threadID, messageID, senderID,
		models: context.models, usersData: context.usersData, threadsData: context.threadsData,
		globalData: context.globalData, dashBoardData: context.dashBoardData,
		envCommands: global.GoatBot?.envCommands, envGlobal: global.GoatBot?.envGlobal,
		utils: global.utils, GoatBot: global.GoatBot, client: global.client,
		textEngine: global.textEngine,
		getPrefix: tid => (global.utils && global.utils.getPrefix ? global.utils.getPrefix(tid || threadID) : "("),
		sleep: ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0))),
		out, output, react, reply, send,
		axios, fs, path, exec, execSync, util, require
	};

	let timer;
	try {
		const names = Object.keys(base);
		const values = Object.values(base);
		const fn = eval(`(async (${names.join(", ")}) => { ${code}\n})`);
		const guard = new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`Evaluation timed out after ${global.utils.formatDuration(TIMEOUT_MS / 1000)}.`)), TIMEOUT_MS);
		});
		const result = await Promise.race([fn(...values), guard]);
		if (result === undefined) return;
		return sendText(api, threadID, messageID, result, "✨ EVAL RESULT");
	}
	catch (err) {
		return sendText(api, threadID, messageID, err.stack || err.message || err, "❌ EVAL ERROR");
	}
	finally {
		if (timer) clearTimeout(timer);
	}
}

module.exports = {
	config: {
		name: "eval",
		version: "7.0.0",
		author: AUTHOR,
		countDown: 0,
		role: 2,
		description: {
			en: "Advanced JavaScript evaluation engine with safe output, reply code and timeout"
		},
		category: "owner",
		guide: {
			en: "   {pn} <javascript_code>\n   {pn} reply to a message with code\n   {pn} help"
		}
	},

	onStart: async function ({ api, event, args, message, models, usersData, threadsData, globalData, dashBoardData, role }) {
		const first = String(args[0] || "").toLowerCase();
		if (!args.length || first === "help" || first === "manual") {
			const manual =
				`━━━ EVAL MANUAL ━━━\n\n` +
				`• Run JavaScript: ${global.utils?.getPrefix?.(event.threadID) || "("}eval 2 + 2\n` +
				`• Reply to a message with code to evaluate it.\n` +
				`• Fenced JavaScript code blocks are accepted.\n\n` +
				`CONTEXT\n` +
				`api, event, args, message, role, threadID, messageID, senderID\n` +
				`usersData, threadsData, globalData, dashBoardData, models\n` +
				`utils, GoatBot, client, textEngine, axios, fs, path, exec, execSync, util, require\n` +
				`out(data), output(data), reply(text), send(text, threadID), react(emoji)\n` +
				`sleep(ms), getPrefix(threadID)\n\n` +
				`• Uses return for a result value; out() sends extra output.\n` +
				`• Long results are split into numbered chunks instead of being truncated.\n` +
				`• Async/await is supported. Timeout: ${global.utils.formatDuration(TIMEOUT_MS / 1000)}.\n` +
				`• Home directory and ANSI codes are removed from results.\n\n` +
				`Made by ${AUTHOR}`;
			return api.sendMessage(manual, event.threadID, event.messageID);
		}

		const code = args.join(" ");
		if (global.GoatBot?.onReply) {
			global.GoatBot.onReply.set(event.messageID, {
				commandName: this.config.name,
				messageID: event.messageID,
				author: event.senderID
			});
		}
		return runCode({ api, event, code, args, role, context: { message, models, usersData, threadsData, globalData, dashBoardData } });
	},

	onReply: async function ({ api, event, Reply, role }) {
		if (String(event.senderID) !== String(Reply.author)) return;
		const body = String(event.body || "").replace(/^\s*```(?:js|javascript)?\s*/i, "").replace(/```\s*$/, "");
		if (!body.trim()) return;
		return runCode({ api, event, code: body, args: body.split(/\s+/), role });
	}
};
