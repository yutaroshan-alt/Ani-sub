// Dependency checker: lists npm packages required by the project files that are
// not declared in package.json, and declared packages that are never required.
//
//   node scripts/check-dependencies.js
//
// This script is read-only. It never changes package.json.

const fs = require("fs");
const path = require("path");
const { builtinModules } = require("module");

const ROOT = path.join(__dirname, "..");
const PKG_FILE = path.join(ROOT, "package.json");
const SKIP_DIRS = new Set(["node_modules", ".git", "data", "cache", "tmp", "temp", "coverage"]);

function walk(dir, files) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
	catch (e) { return files; }

	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) walk(full, files);
		}
		else if (entry.name.endsWith(".js")) files.push(full);
	}
	return files;
}

function packageOf(spec) {
	if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:"))
		return null;
	const name = spec.startsWith("@")
		? spec.split("/").slice(0, 2).join("/")
		: spec.split("/")[0];
	return builtinModules.includes(name) ? null : name;
}

const files = walk(ROOT, []);
const required = new Map();

const requirePattern = /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
for (const file of files) {
	if (file === __filename) continue;
	let source;
	try { source = fs.readFileSync(file, "utf8"); }
	catch (e) { continue; }

	let match;
	while ((match = requirePattern.exec(source)) !== null) {
		const name = packageOf(match[2]);
		if (!name) continue;
		if (!required.has(name)) required.set(name, new Set());
		required.get(name).add(path.relative(ROOT, file));
	}
}

let pkg;
try { pkg = JSON.parse(fs.readFileSync(PKG_FILE, "utf8")); }
catch (e) {
	console.error("Cannot read package.json:", e.message);
	process.exit(1);
}

const declared = new Set([
	...Object.keys(pkg.dependencies || {}),
	...Object.keys(pkg.devDependencies || {})
]);

const missing = [...required.keys()].filter(name => !declared.has(name)).sort();
const unused = [...declared].filter(name => !required.has(name)).sort();

console.log("Scanned", files.length, "JavaScript files.");
console.log("Declared packages:", declared.size);
console.log("Required packages:", required.size);

if (missing.length) {
	console.log("\nMISSING from package.json (add these):");
	for (const name of missing)
		console.log("  " + name + "  used by: " + [...required.get(name)].slice(0, 3).join(", "));
}
else console.log("\nNo missing packages.");

if (unused.length) {
	console.log("\nDeclared but not required directly (do not remove blindly):");
	for (const name of unused) console.log("  " + name);
}
