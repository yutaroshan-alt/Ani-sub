const AUTHOR = "0xMr_King x ┃ Tanin Islam";

module.exports = {
	config: {
		name: "rules",
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 0,
		category: "group",
		shortDescription: "Create and manage group rules",
		guide: {
			en: "{pn}                 view rules\n" +
				"{pn} add <rule>       add a rule\n" +
				"{pn} edit <n> <text>  edit rule number n\n" +
				"{pn} move <a> <b>     swap two rules\n" +
				"{pn} delete <n>       delete rule number n\n" +
				"{pn} remove           delete all rules"
		}
	},

	onStart: async function ({ message, event, args, threadsData, prefix, role }) {
		const threadID = event.threadID;
		const rules = await threadsData.get(threadID, "data.rules", []);
		if (!Array.isArray(rules)) rules.length = 0;
		const save = () => threadsData.set(threadID, rules, "data.rules");
		const mode = String(args[0] || "").toLowerCase();
		const needAdmin = () => Number(role || 0) >= 1;

		if (!mode || mode === "list" || mode === "view") {
			if (!rules.length)
				return message.reply(`No group rules yet. Add one with ${prefix}rules add <rule>.`);
			return message.reply(`Group rules:\n${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}`);
		}

		if (mode === "add" || mode === "-a") {
			if (!needAdmin()) return message.reply("Only group admins can add rules.");
			const text = args.slice(1).join(" ").trim();
			if (!text) return message.reply("Please provide the rule text.");
			rules.push(text);
			await save();
			return message.reply(`Added rule ${rules.length}.`);
		}

		if (mode === "edit" || mode === "-e") {
			if (!needAdmin()) return message.reply("Only group admins can edit rules.");
			const index = Number(args[1]) - 1;
			const text = args.slice(2).join(" ").trim();
			if (!Number.isInteger(index) || index < 0 || !rules[index])
				return message.reply(`Rule ${args[1]} does not exist.`);
			if (!text) return message.reply("Please provide the new rule text.");
			rules[index] = text;
			await save();
			return message.reply(`Edited rule ${index + 1}.`);
		}

		if (mode === "move" || mode === "-m") {
			if (!needAdmin()) return message.reply("Only group admins can reorder rules.");
			const a = Number(args[1]) - 1;
			const b = Number(args[2]) - 1;
			if (!Number.isInteger(a) || !Number.isInteger(b) || !rules[a] || !rules[b])
				return message.reply("Please give two existing rule numbers.");
			if (a === b) return message.reply("Both numbers are the same.");
			[rules[a], rules[b]] = [rules[b], rules[a]];
			await save();
			return message.reply(`Swapped rules ${a + 1} and ${b + 1}.`);
		}

		if (["delete", "del", "-d"].includes(mode)) {
			if (!needAdmin()) return message.reply("Only group admins can delete rules.");
			const index = Number(args[1]) - 1;
			if (!Number.isInteger(index) || index < 0 || !rules[index])
				return message.reply(`Rule ${args[1]} does not exist.`);
			const removed = rules.splice(index, 1)[0];
			await save();
			return message.reply(`Deleted rule ${index + 1}: ${removed}`);
		}

		if (["remove", "reset", "-r"].includes(mode)) {
			if (!needAdmin()) return message.reply("Only group admins can remove all rules.");
			await threadsData.set(threadID, [], "data.rules");
			return message.reply("All group rules have been removed.");
		}

		if (!isNaN(mode)) {
			const index = Number(mode) - 1;
			return rules[index]
				? message.reply(`${index + 1}. ${rules[index]}`)
				: message.reply(`Rule ${mode} does not exist.`);
		}

		return message.reply(`Unknown option "${mode}". Use ${prefix}rules for the command list.`);
	}
};
