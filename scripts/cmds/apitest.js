const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const TEST_TIMEOUT = 12000;
const CHUNK_SIZE = 4200;
// These two execute arbitrary code / shell commands. They get config + syntax
// checks only; running them through the dry-run harness is never safe.
const NO_DRY_RUN = new Set(["eval", "shell"]);

function cleanArg(value) {
	return String(value == null ? "" : value).trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

function stringify(value) {
	if (value == null) return "(empty)";
	if (typeof value === "string") return value;
	if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
	if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
	try {
		const json = JSON.stringify(value, null, 2);
		return json === undefined ? String(value) : json;
	}
	catch (e) { return String(value); }
}

function clip(value, limit = 1600) {
	const text = stringify(value);
	return text.length > limit ? `${text.slice(0, limit)}\n... [truncated ${text.length - limit} chars]` : text;
}

function oneLine(value, limit = 220) {
	return stringify(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

async function sendReport(message, text) {
	const lines = String(text).split("\n");
	const chunks = [];
	let current = "";
	for (const line of lines) {
		if (current && (current.length + line.length + 1) > CHUNK_SIZE) {
			chunks.push(current);
			current = line;
		}
		else current = current ? `${current}\n${line}` : line;
	}
	if (current) chunks.push(current);
	if (!chunks.length) chunks.push("(no output)");
	for (let i = 0; i < chunks.length; i++) {
		const header = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n` : "";
		try { await message.reply(header + chunks[i]); }
		catch (e) { /* one oversized chunk must not kill the rest */ }
	}
}

function findCommand(name) {
	const bot = global.GoatBot || {};
	const key = cleanArg(name).toLowerCase();
	const direct = bot.commands && bot.commands.get(key);
	if (direct) return { command: direct, realName: direct.config.name, via: "name" };
	const alias = bot.aliases && bot.aliases.get(key);
	if (alias) {
		const target = bot.commands && bot.commands.get(String(alias).toLowerCase());
		if (target) return { command: target, realName: target.config.name, via: `alias -> ${alias}` };
	}
	return null;
}

function suggestCommands(name) {
	const bot = global.GoatBot || {};
	const all = bot.commands ? Array.from(bot.commands.keys()) : [];
	const key = cleanArg(name).toLowerCase();
	return all.filter(n => n.includes(key) || key.includes(n)).slice(0, 12);
}

function resolveLocation(command) {
	if (command && command.location && fs.existsSync(command.location)) return command.location;
	const names = new Set();
	if (command && command.config) {
		if (command.config.name) names.add(String(command.config.name).toLowerCase());
		for (const alias of (command.config.aliases || [])) names.add(String(alias).toLowerCase());
	}
	const entries = (global.GoatBot && global.GoatBot.commandFilesPath) || [];
	for (const entry of entries) {
		if ((entry.commandName || []).some(name => names.has(String(name).toLowerCase())) && fs.existsSync(entry.filePath))
			return entry.filePath;
	}
	for (const name of names) {
		const guess = path.join(__dirname, `${name}.js`);
		if (fs.existsSync(guess)) return guess;
	}
	return null;
}

function checkSyntax(command) {
	const target = resolveLocation(command);
	if (!target || !fs.existsSync(target))
		return Promise.resolve({ ok: false, detail: `File not found: ${target || "unknown"}` });
	return new Promise(resolve => {
		execFile(process.execPath, ["--check", target], { timeout: 8000 }, (err, stdout, stderr) => {
			const msg = String(stderr || stdout || (err && err.message) || "").trim();
			resolve({ ok: !err, detail: err ? clip(msg, 700) : "node --check passed" });
		});
	});
}

function makeDataStore(kind, calls) {
	const listKey = { threads: "allThreadData", users: "allUserData" }[kind] || "";
	const idField = kind === "threads" ? "threadID" : kind === "users" ? "userID" : null;
	const readList = () => {
		try { return (global.db && global.db[listKey]) || []; }
		catch (e) { return []; }
	};
	return new Proxy({}, {
		get(_target, prop) {
			if (typeof prop === "symbol") return undefined;
			const name = String(prop);
			const note = (...args) => {
				calls.push(`${kind === "threads" ? "threadsData" : kind === "users" ? "usersData" : kind}.${name}(${args.map(a => oneLine(a)).join(", ")})`);
				return true;
			};
			if (name === "get") {
				return async (id, keyPath, defaultValue) => {
					let value = idField ? readList().find(item => String(item[idField]) === String(id)) || {} : {};
					if (keyPath) {
						for (const part of String(keyPath).split(".")) {
							if (value && value[part] !== undefined) value = value[part];
							else return defaultValue !== undefined ? defaultValue : {};
						}
					}
					return value;
				};
			}
			if (name === "getAll") return async () => readList().slice();
			if (name === "getName") return async id => String(id);
			if (name === "getPrefix") return async () => {
				try { return (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "("; }
				catch (e) { return "("; }
			};
			return async (...args) => note(...args);
		}
	});
}

function withTimeout(promise, ms, label) {
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
	});
	return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function dryRun(command, options) {
	const replies = [];
	const calls = [];
	const capture = (kind, value) => replies.push(`[${kind}] ${clip(value, 2400)}`);

	const mockMessage = {
		reply: async (form, ...rest) => { capture("reply", form); return { messageID: `dryrun-${replies.length}` }; },
		send: async (form, ...rest) => { capture("send", form); return { messageID: `dryrun-${replies.length}` }; },
		SyntaxError: async (...parts) => { capture("SyntaxError", parts.join(" ")); },
		error: async (...parts) => { capture("error", parts.join(" ")); }
	};

	const botID = (global.GoatBot && global.GoatBot.botID) || "dryrun-bot";
	const dryUser = {
		userID: botID,
		fullName: "APITest",
		name: "APITest",
		gender: 1,
		firstName: "APITest",
		vanity: "apitest",
		profileUrl: `https://www.facebook.com/${botID}`,
		isFriend: true
	};
	const dryThread = {
		threadID: "123456789012345678",
		name: "APITest Group",
		isGroup: true,
		isSubscribed: true,
		participantIDs: [botID],
		adminIDs: [botID],
		type: "GROUP"
	};
	const mockApi = new Proxy({}, {
		get(_target, prop) {
			if (typeof prop === "symbol") return undefined;
			const name = String(prop);
			if (name === "getCurrentUserID") return () => botID;
			return (...args) => {
				calls.push(`api.${name}(${args.map(a => oneLine(a)).join(", ")})`);
				if (/^(getFriendsList|getFriends|getFriendList)$/i.test(name))
					return Promise.resolve([dryUser]);
				if (/^(getThreadList|getAllThreads|getGroupList)$/i.test(name))
					return Promise.resolve([dryThread]);
				if (/^(getUserInfo|getUserInfoV2)$/i.test(name)) {
					const ids = Array.isArray(args[0]) ? args[0] : [args[0] || botID];
					const out = {};
					for (const id of ids) out[String(id)] = Object.assign({}, dryUser, { userID: String(id) });
					return Promise.resolve(out);
				}
				if (/^(getThreadInfo|getThreadInfoV2|getGroupInfo)$/i.test(name))
					return Promise.resolve(Object.assign({}, dryThread, {
						threadID: String(args[0] || dryThread.threadID),
						adminIDs: [{ id: botID }],
						participantIDs: [botID, require("../../func/bot-uids").ownerID()],
						members: []
					}));
				if (/^(getThreadHistory|getMessageList)$/i.test(name))
					return Promise.resolve([{ senderID: botID, messageID: "dryrun-msg", body: "dry run" }]);
				return Promise.resolve({ messageID: "dryrun" });
			};
		}
	});

	const mockEvent = Object.assign({}, options.event, {
		type: "message",
		body: `${options.prefix}${options.name}${options.args.length ? ` ${options.args.join(" ")}` : ""}`,
		args: options.args,
		messageID: `dryrun-${Date.now()}`
	});

	const core = (global.GoatBot && global.GoatBot.config) || {};
	const makeEntityStore = (kind) => ({
		getData: async (id, keyPath, defaultValue) => {
			const list = (global.db && global.db[kind === "Threads" ? "allThreadData" : "allUserData"]) || [];
			const idField = kind === "Threads" ? "threadID" : "userID";
			const found = list.find(item => String(item[idField]) === String(id));
			let value = found || {};
			if (keyPath) {
				for (const part of String(keyPath).split(".")) {
					if (value && value[part] !== undefined) value = value[part];
					else return defaultValue !== undefined ? defaultValue : {};
				}
			}
			return { ...value, data: value.data || {}, members: value.members || [] };
		},
		setData: async (id, value) => true,
		getAll: async () => ((global.db && global.db[kind === "Threads" ? "allThreadData" : "allUserData"]) || []).slice()
	});
	const context = {
		api: mockApi,
		event: mockEvent,
		message: mockMessage,
		args: options.args,
		commandName: options.name,
		prefix: options.prefix,
		role: 3,
		senderName: "APITest",
		usersData: makeDataStore("users", calls),
		threadsData: makeDataStore("threads", calls),
		dashBoardData: makeDataStore("dashboard", calls),
		globalData: makeDataStore("global", calls),
		Threads: makeEntityStore("Threads"),
		Users: makeEntityStore("Users"),
		userModel: {}, threadModel: {}, dashBoardModel: {}, globalModel: {},
		envCommands: {}, envEvents: {}, envGlobal: {},
		getLang: key => String(key),
		getText: key => String(key),
		getPrefix: () => core.prefix || "(",
		removeCommandNameFromBody: body => String(body || "").replace(/^\S+\s*/, "").trim()
	};

	const started = Date.now();
	return withTimeout(
		Promise.resolve().then(() => command.onStart(context)).then(result => ({ ok: true, result, replies, calls, ms: Date.now() - started })),
		Number(options.timeoutMs) || TEST_TIMEOUT,
		"Dry run"
	).catch(err => ({ ok: false, error: err, replies, calls, ms: Date.now() - started }));
}

async function testWeb(rawUrl) {
	let url = cleanArg(rawUrl);
	if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
	const started = Date.now();

	try {
		const response = await axios.get(url, {
			timeout: TEST_TIMEOUT,
			maxRedirects: 5,
			responseType: "text",
			validateStatus: () => true,
			maxContentLength: 4 * 1024 * 1024,
			headers: { "User-Agent": "Mozilla/5.0 (compatible; Aliya-APITest/4.0)" }
		});
		const ms = Date.now() - started;
		const headers = response.headers || {};
		const body = typeof response.data === "string" ? response.data : stringify(response.data);
		let json = "no";
		try {
			const parsed = JSON.parse(body);
			json = Array.isArray(parsed)
				? `yes (array, ${parsed.length} item${parsed.length === 1 ? "" : "s"})`
				: `yes (${Object.keys(parsed).length} key${Object.keys(parsed).length === 1 ? "" : "s"})`;
		}
		catch (e) { /* plain text or HTML */ }
		const ok = response.status >= 200 && response.status < 400;
		return [
			"WEB TEST RESULT",
			`URL         : ${url}`,
			`Final URL   : ${(response.request && response.request.res && response.request.res.responseUrl) || url}`,
			`Verdict     : ${ok ? "OK" : "HTTP ERROR"}`,
			`Status      : ${response.status} ${response.statusText || ""}`.trim(),
			`Time        : ${ms} ms`,
			`Type        : ${headers["content-type"] || "not reported"}`,
			`Length      : ${headers["content-length"] || (body ? `${body.length} chars received` : "0")}`,
			`Server      : ${headers.server || "not reported"}`,
			`Date        : ${headers.date || "not reported"}`,
			`JSON        : ${json}`,
			`Headers     : ${clip(headers, 1800)}`,
			`Body        : ${clip(body, 3000) || "(empty response)"}`
		].join("\n");
	}
	catch (err) {
		const ms = Date.now() - started;
		const status = err.response ? `${err.response.status} ${err.response.statusText || ""}`.trim() : "none";
		return [
			"WEB TEST RESULT",
			`URL         : ${url}`,
			"Verdict     : FAIL",
			`Error       : ${err.code || err.name || "Error"}: ${err.message}`,
			`Status      : ${status}`,
			`Time        : ${ms} ms`,
			`Response    : ${err.response ? clip(err.response.data, 1500) : "(none)"}`,
			"Hint        : Check the link, DNS, SSL certificate and outbound firewall on the host."
		].join("\n");
	}
}

function listCommands(filter) {
	const bot = global.GoatBot || {};
	if (!bot.commands) return "Command registry is not ready yet. Try again after the bot is online.";
	const key = cleanArg(filter).toLowerCase();
	const groups = new Map();
	for (const name of Array.from(bot.commands.keys()).sort()) {
		if (key && !name.includes(key)) continue;
		const command = bot.commands.get(name);
		const category = (command && command.config && command.config.category) || "other";
		if (!groups.has(category)) groups.set(category, []);
		groups.get(category).push(name);
	}
	const total = Array.from(groups.values()).reduce((sum, list) => sum + list.length, 0);
	const lines = [`COMMANDS (${total})${key ? ` matching "${key}"` : ""}`];
	for (const [category, names] of groups) {
		lines.push(`\n[${category}] ${names.length}`);
		lines.push(names.join(", "));
	}
	return lines.join("\n");
}

function apiBaseUrl() {
	try {
		return require("../../config.json").API_BASE_URL ||
			process.env.API_BASE_URL ||
			"https://0x-mr-king-api-server-i73g.vercel.app";
	}
	catch (e) {
		return process.env.API_BASE_URL || "https://0x-mr-king-api-server-i73g.vercel.app";
	}
}

async function testApiBase() {
	const base = apiBaseUrl().replace(/\/$/, "");
	const started = Date.now();
	const lines = ["API BASE TEST", `Base : ${base}`, ""];
	for (const endpoint of ["/api/health", "/api/amv?query=anime%20amv%204k"]) {
		try {
			const response = await axios.get(base + endpoint, {
				timeout: TEST_TIMEOUT,
				validateStatus: () => true,
				headers: { "User-Agent": "Mozilla/5.0 (compatible; Aliya-APITest/4.0)" }
			});
			const ok = response.status >= 200 && response.status < 400;
			lines.push(`${endpoint} : ${ok ? "OK" : "HTTP ERROR"} ${response.status} (${Date.now() - started} ms)`);
			lines.push(`  ${clip(response.data, 700)}`);
		}
		catch (e) {
			lines.push(`${endpoint} : FAIL ${e.code || e.name || "Error"}: ${e.message}`);
		}
	}
	lines.push("", `Made by ${AUTHOR}`);
	return lines.join("\n");
}

function listDuplicates() {
	const bot = global.GoatBot || {};
	const owners = new Map();
	for (const [name, command] of (bot.commands || new Map())) {
		const labels = [name, ...((command && command.config && command.config.aliases) || [])];
		for (const label of labels.map(item => String(item).toLowerCase())) {
			if (!owners.has(label)) owners.set(label, new Set());
			owners.get(label).add(name);
		}
	}
	const dups = [];
	for (const [label, names] of owners) {
		if (names.size > 1) dups.push(`${label} -> ${[...names].join(", ")}`);
	}
	const lines = [`DUPLICATE COMMAND / ALIAS CHECK`, `Loaded commands: ${bot.commands ? bot.commands.size : 0}`, ""];
	if (!dups.length) lines.push("No duplicate names or aliases found.", "", `Made by ${AUTHOR}`);
	else lines.push(dups.join("\n"), "", `Total conflicts: ${dups.length}`, `Made by ${AUTHOR}`);
	return lines.join("\n");
}

async function localHealth() {
	const port = process.env.PORT || 8080;
	const url = `http://127.0.0.1:${port}/health`;
	try {
		const response = await axios.get(url, { timeout: 5000, validateStatus: () => true });
		return [
			"LOCAL HEALTH",
			`URL    : ${url}`,
			`Status : ${response.status}`,
			`Body   : ${clip(response.data, 1800)}`,
			`Made by ${AUTHOR}`
		].join("\n");
	}
	catch (e) {
		return [
			"LOCAL HEALTH",
			`URL    : ${url}`,
			`Verdict: FAIL ${e.code || e.name || "Error"}: ${e.message}`,
			`Made by ${AUTHOR}`
		].join("\n");
	}
}

async function commandReport(found, options, syntax) {
	const config = found.command.config || {};
	const hooks = ["onStart", "onChat", "onEvent", "onAnyEvent", "onFirstChat", "onReply", "onReaction", "onLoad"]
		.filter(key => typeof found.command[key] === "function");
	const lines = [
		"COMMAND TEST RESULT",
		`Requested  : ${options.requested}`,
		`Resolved   : ${found.realName}${found.via === "name" ? "" : ` (${found.via})`}`,
		`File       : ${resolveLocation(found.command) || "unknown"}`,
		`Author     : ${config.author || "unknown"}`,
		`Version    : ${config.version || "unknown"}`,
		`Category   : ${config.category || "unknown"}`,
		`Role       : ${JSON.stringify(config.role === undefined ? 0 : config.role)}`,
		`Aliases    : ${(config.aliases || []).join(", ") || "(none)"}`,
		`Hooks      : ${hooks.join(", ") || "(none)"}`,
		`Test args  : ${options.args.length ? options.args.join(" ") : "(none)"}`,
		"",
		`SYNTAX     : ${syntax.ok ? "PASS" : "FAIL"}`,
		`             ${clip(syntax.detail, 700)}`
	];

	if (NO_DRY_RUN.has(found.realName)) {
		lines.push("", "DRY RUN    : SKIPPED", `             ${found.realName} can run code or shell commands; only metadata and syntax are checked.`);
		return lines.join("\n");
	}

	const run = await dryRun(found.command, options);
	lines.push("", `DRY RUN    : ${run.ok ? "COMPLETED" : "ERROR"} (${run.ms} ms)`);
	if (!run.ok) {
		lines.push(`Error      : ${run.error && run.error.name ? run.error.name + ": " : ""}${run.error && run.error.message ? run.error.message : String(run.error)}`);
		if (run.error && run.error.stack) lines.push(`Stack      : ${clip(run.error.stack.split("\n").slice(0, 6).join("\n"), 1200)}`);
	}
	else if (run.result !== undefined && run.result !== null)
		lines.push(`Returned   : ${clip(run.result, 800)}`);

	lines.push(`Captured output: ${run.replies.length}`);
	if (run.replies.length) run.replies.slice(0, 12).forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
	else lines.push("  (command produced no reply or message during dry run)");

	lines.push(`Mocked API calls: ${run.calls.length}`);
	if (run.calls.length) run.calls.slice(0, 12).forEach((item, i) => lines.push(`  ${i + 1}. ${clip(item, 500)}`));

	const apiMessages = run.calls.filter(item => item.startsWith("api.sendMessage(")).length;
	if (apiMessages) lines.push(`API messages: ${apiMessages} (captured, not sent)`);
	const hasOutput = run.replies.length > 0 || apiMessages > 0;
	lines.push("", `RESULT     : ${run.ok && hasOutput ? "WORKING (output produced)" : run.ok ? "NO OUTPUT (check the command logic)" : "FAILED (see error above)"}`);
	return lines.join("\n");
}

// ---- Text / font engine test (matches Hinata-bot / SakjraBot_V2 behaviour) ----
function getTextEngine() {
	return global.textEngine || require("../../textEngine.js");
}

const NORMALIZE_MODES = ["plain", "upper", "lower", "title", "nospaces"];

function textArg(tokens) {
	return tokens.map(cleanArg).join(" ").trim();
}

function textHelp(prefix) {
	const h = (s) => getTextEngine().styleHeader(s);
	const l = (a, b) => getTextEngine().styleLine(a, b);
	return [
		h('𝐓𝐞𝐱𝐭 𝐓𝐞𝐬𝐭 — 𝐅𝐨𝐧𝐭 𝐄𝐧𝐠𝐢𝐧𝐞'),
		l(`${prefix}apitest text`, 'show this guide'),
		l(`${prefix}apitest text list [page]`, 'all font styles (number ⟶ sample)'),
		l(`${prefix}apitest text all "text"`, 'convert into every style'),
		l(`${prefix}apitest text <name|number> "text"`, 'convert with one style'),
		l(`${prefix}apitest text normalize [mode] "text"`, 'plain/upper/lower/title/nospaces'),
		l(`${prefix}apitest text reverse "text"`, 'decode fancy text'),
		l(`${prefix}apitest text check "text"`, 'self-test every text function'),
		'',
		l('Made by', AUTHOR)
	].join("\n");
}

function textTest(args, prefix) {
	const engine = getTextEngine();
	const sub = cleanArg(args[0]).toLowerCase();
	const rest = args.slice(1);
	const text = textArg(rest);

	if (!sub || ["help", "-h", "?"].includes(sub))
		return textHelp(prefix);

	if (["list", "ls"].includes(sub))
		return engine.list(cleanArg(rest[0]) || 1);

	if (["all", "*"].includes(sub)) {
		if (!text) return `${engine.styleHeader('𝐔𝐬𝐚𝐠𝐞')}\n${engine.styleLine('Use', `${prefix}apitest text all "hello world"`)}`;
		const lines = [
			engine.styleHeader('𝐀𝐥𝐥 𝐅𝐨𝐧𝐭 𝐒𝐭𝐲𝐥𝐞𝐬'),
			engine.styleLine('Input', text),
			engine.styleLine('Scripts', engine.detectScripts(text).join(', ')),
			''
		];
		for (const style of engine.styles)
			lines.push(engine.styleLine(style.padEnd(15), engine.convert(text, style)));
		lines.push('', engine.styleLine('Made by', AUTHOR));
		return lines.join("\n");
	}

	if (["normalize", "norm", "plain", "strip"].includes(sub)) {
		const first = cleanArg(rest[0]).toLowerCase();
		const mode = NORMALIZE_MODES.includes(first) ? first : "plain";
		const value = NORMALIZE_MODES.includes(first) ? textArg(rest.slice(1)) : text;
		if (!value) return `${engine.styleHeader('𝐔𝐬𝐚𝐠𝐞')}\n${engine.styleLine('Use', `${prefix}apitest text normalize [${NORMALIZE_MODES.join('|')}] "text"`)}`;
		return [
			engine.styleHeader('𝐓𝐞𝐱𝐭 𝐍𝐨𝐫𝐦𝐚𝐥𝐢𝐳𝐞'),
			engine.styleLine('Input', value),
			engine.styleLine('Mode', mode),
			engine.styleLine('Output', engine.normalizeSimple(value, mode)),
			engine.styleLine('Stripped', engine.stripFormat(value)),
			engine.styleLine('Scripts', engine.detectScripts(value).join(', ')),
			'',
			engine.styleLine('Made by', AUTHOR)
		].join("\n");
	}

	if (["reverse", "rev", "decode", "unfancy"].includes(sub)) {
		if (!text) return `${engine.styleHeader('𝐔𝐬𝐚𝐠𝐞')}\n${engine.styleLine('Use', `${prefix}apitest text reverse "fancy text"`)}`;
		return [
			engine.styleHeader('𝐓𝐞𝐱𝐭 𝐑𝐞𝐯𝐞𝐫𝐬𝐞'),
			engine.styleLine('Input', text),
			engine.styleLine('Output', engine.reverseFancy(text)),
			'',
			engine.styleLine('Made by', AUTHOR)
		].join("\n");
	}

	if (["scripts", "script", "detect"].includes(sub)) {
		if (!text) return `${engine.styleHeader('𝐔𝐬𝐚𝐠𝐞')}\n${engine.styleLine('Use', `${prefix}apitest text scripts "text"`)}`;
		return [
			engine.styleHeader('𝐒𝐜𝐫𝐢𝐩𝐭 𝐃𝐞𝐭𝐞𝐜𝐭'),
			engine.styleLine('Input', text),
			engine.styleLine('Scripts', engine.detectScripts(text).join(', '))
		].join("\n");
	}

	if (["check", "selftest", "test"].includes(sub)) {
		const sample = text || "Hello123";
		const lines = [engine.styleHeader('𝐓𝐞𝐱𝐭 𝐄𝐧𝐠𝐢𝐧𝐞 𝐒𝐞𝐥𝐟-𝐓𝐞𝐬𝐭'), engine.styleLine('Sample', sample), ''];
		let pass = 0, fail = 0;
		const record = (name, ok, detail) => {
			lines.push(`${engine.styleLine(ok ? 'PASS' : 'FAIL', name)}${detail ? ` -> ${clip(detail, 160)}` : ''}`);
			if (ok) pass++; else fail++;
		};
		try {
			record("convert(bold)", engine.convert("Ab", "bold") !== "Ab", engine.convert("Ab", "bold"));
			record("convert(index 1)", engine.convert("Ab", 1) === engine.convert("Ab", "bold"), engine.convert("Ab", 1));
			record("convert(all styles)", engine.styles.every(s => typeof engine.convert(sample, s) === "string"), `${engine.styles.length} styles`);
			record("resolveStyle(alias)", engine.resolveStyle("b") === "bold" && engine.resolveStyle("ud") === "upsidedown");
			record("list()", String(engine.list(1)).includes("⟶") && engine.styles.length > 0, engine.list(1).split("\n")[0]);
			record("normalizeSimple", engine.normalizeSimple(engine.convert("Hello", "bold"), "plain") === "Hello", engine.normalizeSimple(engine.convert("Hello", "bold"), "plain"));
			record("stripFormat", engine.stripFormat("A\u0332B") === "AB", JSON.stringify(engine.stripFormat("A\u0332B")));
			record("detectScripts", engine.detectScripts("Hello বাংলা 😀").join(",").includes("Bengali"), engine.detectScripts("Hello বাংলা 😀").join(","));
			record("reverseFancy", engine.reverseFancy(engine.convert("Hello", "bold")) === "Hello", engine.reverseFancy(engine.convert("Hello", "bold")));
		}
		catch (e) { record("engine exception", false, e.message); }
		lines.push('', engine.styleLine('RESULT', `${pass} passed, ${fail} failed`), engine.styleLine('Made by', AUTHOR));
		return lines.join("\n");
	}

	const style = engine.resolveStyle(sub);
	if (!style) {
		return [
			engine.styleHeader('𝐔𝐧𝐤𝐧𝐨𝐰𝐧 𝐒𝐭𝐲𝐥𝐞'),
			engine.styleLine('Requested', sub),
			engine.styleLine('Hint', `${prefix}apitest text list`),
			engine.styleLine('Made by', AUTHOR)
		].join("\n");
	}
	if (!text) return `${engine.styleHeader('𝐔𝐬𝐚𝐠𝐞')}\n${engine.styleLine('Use', `${prefix}apitest text ${sub} "hello world"`)}`;
	return [
		engine.styleHeader(`𝐓𝐞𝐱𝐭 𝐒𝐭𝐲𝐥𝐞 — ${style}`),
		engine.styleLine('Input', text),
		engine.styleLine('Output', engine.convert(text, style)),
		engine.styleLine('Scripts', engine.detectScripts(text).join(', ')),
		'',
		engine.styleLine('Made by', AUTHOR)
	].join("\n");
}

const HELP = [
	"APITEST - command and website diagnostics",
	"",
	`${"{"}pn} cmds "command name" [args]   dry-run a command and show full result`,
	`${"{"}pn} web "website link"            test a website and show full response`,
	`${"{"}pn} api                           test the configured API base endpoints`,
	`${"{"}pn} dup                           check duplicate command names / aliases`,
	`${"{"}pn} health                        check the local /health endpoint`,
	`${"{"}pn} text [style|all|list] "text"  test the offline font/text engine`,
	`${"{"}pn} list [filter]                 list loaded commands`,
	`${"{"}pn} help                          show this guide`,
	"",
	"Command test is a dry run: API, database writes and messages are captured, never sent.",
	`Made by ${AUTHOR}`
].join("\n");

module.exports = {
	config: {
		name: "apitest",
		aliases: ["apicheck", "testapi"],
		version: "2.0.0",
		author: AUTHOR,
		countDown: 3,
		role: 0,
		category: "utility",
		shortDescription: "Test any command (safe dry run), any website, or the offline text/font engine",
		guide: { en: "{pn} cmds <command> [args] | {pn} web <url> | {pn} text [style|all|list] <text> | {pn} list [filter]" }
	},

	onStart: async function ({ message, event, args, prefix }) {
		const mode = cleanArg(args[0]).toLowerCase();

		if (!mode || ["help", "-h", "?"].includes(mode))
			return sendReport(message, HELP.replace(/\{pn\}/g, prefix));

		if (mode === "text")
			return sendReport(message, textTest(args.slice(1), prefix || ((global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "(")));

		if (["list", "ls", "all"].includes(mode))
			return sendReport(message, listCommands(args.slice(1).join(" ")));

		if (["dup", "dups", "duplicate", "duplicates"].includes(mode))
			return sendReport(message, listDuplicates());

		if (["health", "ping", "status"].includes(mode))
			return sendReport(message, await localHealth());

		if (["api", "apibase", "webapi"].includes(mode))
			return sendReport(message, await testApiBase());

		if (["web", "url", "http", "site", "website"].includes(mode)) {
			const url = cleanArg(args.slice(1).join(" "));
			if (!url) return message.reply(`Usage: ${prefix}apitest web "https://example.com"`);
			return sendReport(message, await testWeb(url));
		}

		if (["cmds", "cmd", "command", "commands"].includes(mode)) {
			const requested = cleanArg(args[1]);
			if (!requested) return message.reply(`Usage: ${prefix}apitest cmds "command name" [args...]`);
			const found = findCommand(requested);
			if (!found) {
				const suggestions = suggestCommands(requested);
				return sendReport(message, [
					"COMMAND TEST RESULT",
					`Requested : ${requested}`,
					"Verdict   : NOT FOUND",
					`Suggestions: ${suggestions.length ? suggestions.join(", ") : "(none)"}`,
					`Hint      : ${prefix}apitest list`,
					`Made by ${AUTHOR}`
				].join("\n"));
			}
			const syntax = await checkSyntax(found.command);
			const options = {
				requested,
				name: found.realName,
				args: args.slice(2).map(cleanArg),
				prefix: prefix || ((global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "("),
				event
			};
			return sendReport(message, await commandReport(found, options, syntax));
		}

		return sendReport(message, [
			`Unknown mode: ${mode}`,
			HELP.replace(/\{pn\}/g, prefix)
		].join("\n"));
	}
};

// Shared QA helpers (used by the offline full-command self-test harness).
module.exports.__test = { dryRun, findCommand, checkSyntax, NO_DRY_RUN, cleanArg };
