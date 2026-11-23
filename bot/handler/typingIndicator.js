"use strict";

// Universal "bot is typing" controller.
// Works with the bundled fb-chat-api and with ws3-fca style APIs.
// It never throws: a typing indicator must never break a command.

const active = new Map();

function options() {
	const cfg = (global.GoatBot && global.GoatBot.config && global.GoatBot.config.typingIndicator) || {};
	return {
		enabled: cfg.enable !== false && cfg.enabled !== false,
		refreshMs: Math.max(1000, Number(cfg.refreshMs) || 5000),
		maxMs: Math.max(10000, Number(cfg.maxMs) || 60000),
		onReply: cfg.onReply !== false,
		onReaction: cfg.onReaction !== false
	};
}

function firstParamName(fn) {
	try {
		const src = Function.prototype.toString.call(fn);
		const m = src.match(/^[^(]*\(\s*([^,)\s=]+)/);
		return m ? m[1] : "";
	}
	catch (e) { return ""; }
}

function detect(api) {
	const fn = api && (api.sendTypingIndicator || api.sendTyping || api.typing);
	if (typeof fn !== "function") return null;

	const param = firstParamName(fn);
	if (/thread|tid|room|conversation|chat/i.test(param))
		return { fn, style: "thread-first", canStop: fn.length >= 2 };

	// Most FCA forks use sendTypingIndicator(isTyping, threadID).
	if (/typ|bool|state|status|flag|enabled?|^on$/i.test(param) || fn.length >= 3 || (api.ctx && api.ctx.mqttClient))
		return { fn, style: "typing-first", canStop: true };

	// Older forks: sendTypingIndicator(threadID, callback). They show typing for
	// a few seconds and have no clean stop call.
	return { fn, style: "thread-only", canStop: false };
}

function fire(detected, api, threadID, on) {
	if (!detected) return;
	const tid = String(threadID);
	const cb = () => { };
	let result;
	try {
		if (detected.style === "thread-first")
			result = detected.fn(tid, on, cb);
		else if (detected.style === "thread-only") {
			if (!on) return;
			result = detected.fn(tid, cb);
		}
		else
			result = detected.fn(on, tid, cb);
	}
	catch (e) { return; }
	try {
		if (result && typeof result.catch === "function") result.catch(() => { });
	}
	catch (e) { /* ignore */ }
}

function release(key) {
	const rec = active.get(key);
	if (!rec) return;
	rec.refs--;
	if (rec.refs > 0) return;
	clearInterval(rec.timer);
	clearTimeout(rec.safety);
	active.delete(key);
	if (rec.detected && rec.detected.canStop) fire(rec.detected, rec.api, key, false);
}

function start(api, threadID, kind) {
	const cfg = options();
	if (!cfg.enabled) return { stop() { } };
	if (kind === "reply" && !cfg.onReply) return { stop() { } };
	if (kind === "reaction" && !cfg.onReaction) return { stop() { } };
	if (!api || !threadID) return { stop() { } };

	const detected = detect(api);
	if (!detected) return { stop() { } };

	const key = String(threadID);
	const existing = active.get(key);
	if (existing) {
		existing.refs++;
		return { stop: () => release(key) };
	}

	const rec = { api, detected, refs: 1, timer: null, safety: null };
	active.set(key, rec);
	fire(detected, api, key, true);
	rec.timer = setInterval(() => fire(detected, api, key, true), cfg.refreshMs);
	if (rec.timer && typeof rec.timer.unref === "function") rec.timer.unref();
	rec.safety = setTimeout(() => {
		const current = active.get(key);
		if (current) current.refs = 1;
		release(key);
	}, cfg.maxMs);
	if (rec.safety && typeof rec.safety.unref === "function") rec.safety.unref();
	return { stop: () => release(key) };
}

async function runWith(api, threadID, kind, fn) {
	const handle = start(api, threadID, kind);
	try { return await fn(); }
	finally { handle.stop(); }
}

function stopAll() {
	for (const key of Array.from(active.keys())) {
		const rec = active.get(key);
		if (rec) rec.refs = 1;
		release(key);
	}
}

process.once("exit", stopAll);

module.exports = { start, runWith, stopAll, detect };
