const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "cmds");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") && !f.endsWith("eg.js") && !f.endsWith(".dev.js"));
const names = new Map(), aliases = new Map(), errors = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const idx = Math.min(...[src.indexOf("config:"), src.indexOf("exports.config")].filter(i => i >= 0).concat([Infinity]));
  const block = idx === Infinity ? "" : src.slice(idx, idx + 1600);
  const nm = block.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
  const name = nm ? nm[1] : f.replace(/\.js$/, "");
  if (names.has(name)) errors.push("duplicate command name: " + name + " (" + names.get(name) + ", " + f + ")");
  else names.set(name, f);
  const am = block.match(/\baliases\s*:\s*\[([^\]]*)\]/);
  if (am) for (const a of [...am[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map(x => x[1])) {
    if (aliases.has(a)) errors.push("duplicate alias: " + a + " (" + aliases.get(a) + ", " + f + ")");
    else aliases.set(a, f);
  }
}
console.log(JSON.stringify({ commands: files.length, uniqueNames: names.size, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
