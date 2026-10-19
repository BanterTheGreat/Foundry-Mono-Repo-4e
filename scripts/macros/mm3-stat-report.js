/**
 * Foundry Script macro: select NPC tokens, then run to whisper MM3 differences.
 * Reports only; never rolls an item or updates an actor.
 * Baselines follow Draconas' MM3 Monster Stats Setter:
 * https://github.com/draconas1/foundry-4e-tools/blob/add52407179e985e2a0888c4e74f5c7b29a20bbf/packs/dracs-items.db
 * Custom baseline: maximum healing surges are always 0. Action points are
 * omitted when the current value is 0 (they may already have been spent).
 */
await (async () => {
    if (game.system.id !== "dnd4e") {
        ui.notifications.warn("This macro requires the DnD4e system.");
        return;
    }

    const actors = [...new Map(canvas.tokens.controlled
        .filter(token => token.actor)
        .map(token => [token.actor.uuid, token.actor])).values()];
    if (!actors.length) {
        ui.notifications.warn("Select one or more NPC tokens first.");
        return;
    }

    const roles = {
        artillery: { startingHP: 21, hpPerLevel: 6, acBase: 12 },
        brute: { startingHP: 26, hpPerLevel: 10, acBase: 12 },
        controller: { startingHP: 24, hpPerLevel: 8, acBase: 14 },
        lurker: { startingHP: 21, hpPerLevel: 6, acBase: 14 },
        skirmisher: { startingHP: 24, hpPerLevel: 8, acBase: 14 },
        soldier: { startingHP: 24, hpPerLevel: 8, acBase: 16 }
    };
    const ranks = {
        standard: { hpMultiplier: 1, actionPoints: 0, saveBonus: 0 },
        minion: { hpMultiplier: 0, actionPoints: 0, saveBonus: 0 },
        elite: { hpMultiplier: 2, actionPoints: 1, saveBonus: 2 },
        solo: { hpMultiplier: 4, actionPoints: 2, saveBonus: 5 }
    };

    /** Escape actor names and values before including them in chat HTML. */
    function escapeHtml(value) {
        const element = document.createElement("span");
        element.textContent = String(value ?? "Missing");
        return element.innerHTML;
    }

    const sections = [];
    for (const actor of actors) {
        const heading = `<h3>${escapeHtml(actor.name)}</h3>`;
        if (actor.type !== "NPC") {
            sections.push(`${heading}<p>Skipped: not an NPC.</p>`);
            continue;
        }

        const data = actor.system;
        const level = Number(data.details.level);
        const primary = data.details.role.primary;
        const secondary = data.details.role.secondary;
        const role = roles[primary];
        const rank = ranks[secondary];
        if (!role || !rank || !Number.isInteger(level) || level < 1) {
            sections.push(`${heading}<p>Skipped: unsupported role/rank or invalid level (${escapeHtml(primary)}, ${escapeHtml(secondary)}, level ${escapeHtml(level)}).</p>`);
            continue;
        }

        const hp = secondary === "minion"
            ? 1
            : (role.startingHP + level * role.hpPerLevel) * rank.hpMultiplier;
        const comparisons = [
            ["Maximum HP", data.attributes.hp.max, hp],
            ["AC (displayed total)", data.defences.ac.value, role.acBase + level],
            ["Fortitude (displayed total)", data.defences.fort.value, 12 + level],
            ["Reflex (displayed total)", data.defences.ref.value, 12 + level],
            ["Will (displayed total)", data.defences.wil.value, 12 + level],
            ["Maximum healing surges", data.details.surges.max, 0],
            ["Saving throw bonus (total)", data.details.saves.value, rank.saveBonus]
        ];
        if (data.actionpoints.value == null || Number(data.actionpoints.value) !== 0) {
            comparisons.push(["Available action points", data.actionpoints.value, rank.actionPoints]);
        }
        const rows = comparisons
            .filter(([, current, expected]) => current == null || Number(current) !== expected)
            .map(([label, current, expected]) => {
                const difference = current == null ? "—" : expected - Number(current);
                const delta = typeof difference === "number" && difference > 0 ? `+${difference}` : difference;
                return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(current)}</td><td>${expected}</td><td>${escapeHtml(delta)}</td></tr>`;
            });

        const table = rows.length
            ? `<table><thead><tr><th>Stat</th><th>Current</th><th>Expected</th><th>Change</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
            : "<p>All checked statistics match the baseline.</p>";
        const notes = [];
        if (data.advancedCals) {
            notes.push("Advanced calculations are enabled; the original setter would disable them. Defense totals here include their current effects.");
        }
        if (Number(data.attributes.hp.value) !== hp) {
            notes.push(`Current HP is ${escapeHtml(data.attributes.hp.value)}. The original setter would also reset it to ${hp}; this report compares maximum HP so damage is not flagged as a stat error.`);
        }
        sections.push(`${heading}<p>Level ${level} ${escapeHtml(secondary)} ${escapeHtml(primary)}</p>${table}${notes.map(note => `<p><small>${note}</small></p>`).join("")}`);
    }

    await ChatMessage.create({
        user: game.user.id,
        speaker: { alias: "MM3 Stat Report" },
        whisper: [game.user.id],
        content: `<h2>MM3 Stat Report</h2><p>Only differences are listed. Expected values are monster-building baselines; individual monsters and active effects can legitimately differ. No actor data was changed.</p>${sections.join("<hr>")}<p><small>Attack and damage are not checked. Action points may already have been spent.</small></p>`
    });
})();
