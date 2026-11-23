'use strict';

/**
 * Offline Unicode text engine.
 * Converts Latin text into styled Unicode while leaving Bengali, Arabic,
 * Devanagari, CJK and emoji untouched.
 */

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const COMBINING = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

function mapRange(upperBase, lowerBase, digitBase, specials = {}) {
	const map = {};
	for (let i = 0; i < 26; i++) {
		map[String.fromCharCode(65 + i)] = String.fromCodePoint(upperBase + i);
		map[String.fromCharCode(97 + i)] = String.fromCodePoint(lowerBase + i);
	}
	if (digitBase !== null)
		for (let i = 0; i < 10; i++) map[String(i)] = String.fromCodePoint(digitBase + i);
	return Object.assign(map, specials);
}

const UNICODE_STYLES = {
	bold: mapRange(0x1D400, 0x1D41A, 0x1D7CE),
	italic: mapRange(0x1D434, 0x1D44E, null, { h: '\u210E' }),
	bolditalic: mapRange(0x1D468, 0x1D482, null),
	script: mapRange(0x1D49C, 0x1D4B2, null, {
		B: '\u212C', E: '\u2130', F: '\u2131', H: '\u210B', I: '\u2110', L: '\u2112', M: '\u2133', R: '\u211B', e: '\u212F', g: '\u210A', o: '\u2134'
	}),
	boldscript: mapRange(0x1D4D0, 0x1D4E6, null),
	fraktur: mapRange(0x1D504, 0x1D51E, null, {
		C: '\u212D', H: '\u210C', I: '\u2111', R: '\u211C', Z: '\u2128'
	}),
	boldfraktur: mapRange(0x1D56C, 0x1D586, null),
	double: mapRange(0x1D538, 0x1D552, 0x1D7D8, {
		C: '\u2102', H: '\u210D', N: '\u2115', P: '\u2119', Q: '\u211A', R: '\u211D', Z: '\u2124'
	}),
	sans: mapRange(0x1D5A0, 0x1D5BA, 0x1D7E2),
	sansbold: mapRange(0x1D5D4, 0x1D5EE, 0x1D7EC),
	sansitalic: mapRange(0x1D608, 0x1D622, null),
	sansbolditalic: mapRange(0x1D63C, 0x1D656, null),
	mono: mapRange(0x1D670, 0x1D68A, 0x1D7F6),
	fullwidth: mapRange(0xFF21, 0xFF41, 0xFF10),
	circled: Object.assign(
		Object.fromEntries([...Array(26)].map((_, i) => [String.fromCharCode(65 + i), String.fromCodePoint(0x24B6 + i)])),
		Object.fromEntries([...Array(26)].map((_, i) => [String.fromCharCode(97 + i), String.fromCodePoint(0x24D0 + i)])),
		Object.fromEntries([...Array(10)].map((_, i) => [String(i), String.fromCodePoint(0x2460 + i)]))
	),
	squared: {
		A: '🅰', B: '🅱', C: '🅲', D: '🅳', E: '🅴', F: '🅵', G: '🅶', H: '🅷', I: '🅸', J: '🅹',
		K: '🅺', L: '🅻', M: '🅼', N: '🅽', O: '🆾', P: '🅿', Q: '🆀', R: '🆁', S: '🆂', T: '🆃',
		U: '🆄', V: '🆅', W: '🆆', X: '🆇', Y: '🆈', Z: '🆉',
		a: '🅰', b: '🅱', c: '🅲', d: '🅳', e: '🅴', f: '🅵', g: '🅶', h: '🅷', i: '🅸', j: '🅹',
		k: '🅺', l: '🅻', m: '🅼', n: '🅽', o: '🆾', p: '🅿', q: '🆀', r: '🆁', s: '🆂', t: '🆃',
		u: '🆄', v: '🆅', w: '🆆', x: '🆇', y: '🆈', z: '🆉'
	},
	smallcaps: {
		a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
		n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: ' x'.trim(), y: 'ʏ', z: 'ᴢ'
	}
};

const UPSIDE_DOWN = {
	a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ',
	n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
	A: '∀', B: 'ᙠ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'ᖷ', G: 'Ә', H: 'H', I: 'I', J: 'ſ', K: '⋊', L: '˥', M: 'W',
	N: 'N', O: 'O', P: 'Ԁ', Q: 'Ό', R: 'ᴚ', S: 'S', T: '⊥', U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
	'0': '0', '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄣ', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6',
	'.': '˙', ',': "'", '?': '¿', '!': '¡', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '_': '¯', '\'': ',', '"': '„'
};

const COMBINING_STYLES = {
	underline: '\u0332',
	strike: '\u0336',
	overline: '\u0305',
	doubleunderline: '\u0333'
};

const STYLE_LIST = [
	['bold', 'Bold', 'bold'], ['italic', 'Italic', 'italic'], ['bolditalic', 'Bold italic', 'bolditalic'],
	['script', 'Script', 'script'], ['boldscript', 'Bold script', 'boldscript'],
	['fraktur', 'Fraktur', 'fraktur'], ['boldfraktur', 'Bold fraktur', 'boldfraktur'],
	['double', 'Double-struck', 'double'], ['sans', 'Sans', 'sans'], ['sansbold', 'Sans bold', 'sansbold'],
	['sansitalic', 'Sans italic', 'sansitalic'], ['sansbolditalic', 'Sans bold italic', 'sansbolditalic'],
	['mono', 'Monospace', 'mono'], ['fullwidth', 'Fullwidth', 'fullwidth'], ['smallcaps', 'Small caps', 'smallcaps'],
	['circled', 'Circled', 'circled'], ['squared', 'Squared', 'squared'], ['bracket', 'Bracketed', 'bracket'],
	['upsidedown', 'Upside down', 'upsidedown'], ['underline', 'Underline', 'underline'],
	['strike', 'Strikethrough', 'strike'], ['overline', 'Overline', 'overline'],
	['doubleunderline', 'Double underline', 'doubleunderline'], ['plain', 'Plain', 'plain']
];

const ALIASES = {
	b: 'bold', strong: 'bold', serifbold: 'bold',
	i: 'italic', em: 'italic',
	bi: 'bolditalic', bolditalics: 'bolditalic',
	sc: 'script', calligraphy: 'script',
	bs: 'boldscript',
	f: 'fraktur', gothic: 'fraktur',
	bf: 'boldfraktur',
	d: 'double', blackboard: 'double', doublestruck: 'double',
	sf: 'sans', sansserif: 'sans',
	sb: 'sansbold', sansserifbold: 'sansbold',
	si: 'sansitalic',
	sbi: 'sansbolditalic',
	m: 'mono', monospace: 'mono', code: 'mono',
	fw: 'fullwidth', wide: 'fullwidth',
	sm: 'smallcaps', small: 'smallcaps',
	c: 'circled', circle: 'circled',
	sq: 'squared', square: 'squared',
	br: 'bracket', brackets: 'bracket',
	ud: 'upsidedown', flip: 'upsidedown', reverse: 'upsidedown',
	u: 'underline', under: 'underline',
	s: 'strike', strikethrough: 'strike', crossed: 'strike',
	o: 'overline', over: 'overline',
	du: 'doubleunderline', normal: 'plain', clean: 'plain', none: 'plain'
};

function resolveStyle(input) {
	if (input === null || input === undefined) return null;
	const raw = String(input).trim().toLowerCase();
	if (!raw) return null;
	if (/^\d+$/.test(raw)) {
		const idx = Number(raw) - 1;
		return STYLE_LIST[idx] ? STYLE_LIST[idx][0] : null;
	}
	if (ALIASES[raw]) return ALIASES[raw];
	return STYLE_LIST.some(s => s[0] === raw) ? raw : null;
}

function convert(text, style) {
	if (text === null || text === undefined) return '';
	const str = String(text);
	const key = resolveStyle(style) || 'bold';
	if (key === 'plain') return str;
	if (key === 'bracket') return [...str].map(ch => /\s/.test(ch) ? ch : `[${ch}]`).join('');
	if (key === 'upsidedown') return [...str].reverse().map(ch => UPSIDE_DOWN[ch] || ch).join('');
	if (COMBINING_STYLES[key]) {
		const mark = COMBINING_STYLES[key];
		return [...str].map(ch => /\s/.test(ch) ? ch : ch + mark).join('');
	}
	const map = UNICODE_STYLES[key];
	if (!map) return str;
	return [...str].map(ch => map[ch] || ch).join('');
}

function reverseFancy(text) {
	const reverse = new Map();
	for (const map of Object.values(UNICODE_STYLES))
		for (const [plain, fancy] of Object.entries(map))
			if (!reverse.has(fancy)) reverse.set(fancy, plain);
	// Only non-ASCII upside-down glyphs are safe to decode. Several of them
	// are ordinary ASCII letters (q, b, d, p ...) which would otherwise get
	// flipped in normal English text (e.g. "baby" -> "qaqy").
	for (const [plain, fancy] of Object.entries(UPSIDE_DOWN))
		if (fancy.codePointAt(0) > 127 && !reverse.has(fancy)) reverse.set(fancy, plain);
	return [...String(text)].map(ch => reverse.get(ch) || ch).join('');
}

function normalizeSimple(text, mode = 'plain') {
	let out = reverseFancy(String(text || '').replace(ZERO_WIDTH, '').replace(COMBINING, ''));
	if (mode === 'upper') out = out.toUpperCase();
	else if (mode === 'lower') out = out.toLowerCase();
	else if (mode === 'title') out = out.replace(/\b[a-z]/g, c => c.toUpperCase());
	else if (mode === 'nospaces') out = out.replace(/\s+/g, '');
	return out;
}

function stripFormat(text) {
	return String(text || '').replace(ZERO_WIDTH, '').replace(COMBINING, '');
}

function detectScripts(text) {
	const str = String(text || '');
	const found = [];
	const tests = [
		['Latin', /[A-Za-zÀ-ÿ]/], ['Bengali', /[\u0980-\u09FF]/], ['Arabic', /[\u0600-\u06FF]/],
		['Devanagari', /[\u0900-\u097F]/], ['CJK', /[\u4E00-\u9FFF\u3040-\u30FF]/],
		['Greek', /[\u0370-\u03FF]/], ['Cyrillic', /[\u0400-\u04FF]/],
		['Emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u]
	];
	for (const [name, re] of tests) if (re.test(str)) found.push(name);
	return found.length ? found : ['Unknown'];
}

// Decorative output style used across the text commands.
const DECOR_LEFT = '𓍢ִ໋🌸✧';
const DECOR_RIGHT = '✧🌸𓍢ִ໋🌷͙֒';
const BULLET = 'ᥫ᭡';

function styleHeader(title) {
	return `${DECOR_LEFT} ── ͟͟͞͞${title} ── ${DECOR_RIGHT}`;
}

function styleLine(label, value) {
	return value === undefined || value === null || value === ''
		? `${BULLET} ${label}`
		: `${BULLET} ${label} : ${value}`;
}

function currentPrefix() {
	try {
		return (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || '(';
	}
	catch (_e) { return '('; }
}

function list(page = 1) {
	const perPage = 8;
	const total = Math.ceil(STYLE_LIST.length / perPage);
	let p = Number(page);
	if (!Number.isFinite(p) || p < 1) p = 1;
	if (p > total) p = total;
	const rows = STYLE_LIST.slice((p - 1) * perPage, p * perPage)
		.map((s, i) => styleLine(`${String((p - 1) * perPage + i + 1).padStart(2)} ⟶ ${convert('Saim', s[0])}`, `${s[1]}`));
	return [
		styleHeader(`𝐅𝐨𝐧𝐭 𝐒𝐭𝐲𝐥𝐞𝐬 (${p}/${total})`),
		...rows,
		'',
		styleLine('Use', `${currentPrefix()}font <number|name> <text>`)
	].join('\n');
}

module.exports = {
	convert, resolveStyle, list, normalizeSimple, stripFormat, detectScripts,
	styles: STYLE_LIST.map(s => s[0]),
	reverseFancy, styleHeader, styleLine, currentPrefix
};
