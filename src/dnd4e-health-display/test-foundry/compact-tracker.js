import { TargetAutomationFixture, waitForFact } from "./target-automation-fixture.js";

const MODULE = "dnd4e-health-display";
const HARNESS = "foundry-test-harness";
const SETTING = "compactTracker";
const ROOT = "dnd4e-compact-tracker";
const round6 = number => Math.round(number * 1e6) / 1e6;

/**
 * Initiatives shaped like DnD4e's: decimals with a random tiebreaker (so the stock tracker shows plain
 * text, not an input), and three combatants that rolled the same number.
 */
const ROSTER = [
  { key: "caster", initiative: 20.1234 },
  { key: "enemy", initiative: 18.0412 },
  { key: "far", initiative: 12.0071 },
  { key: "large", initiative: 12.0071 },
  { key: "slowed", initiative: 12.0071 },
  { key: "ally", initiative: 9.0345 },
  { key: "second", initiative: 5.0101 },
];

/** Synthetic drag events carrying a real DataTransfer, aimed at the production listeners. */
function dragEvent(type, init = {}) {
  return new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), ...init });
}

/** Real combat, scene, actors and tokens, built on the Target Automation sandbox. */
class CompactTrackerFixture {
  ta = new TargetAutomationFixture();
  combat = null;

  /** Build the sandbox scene, add a second player character, and remember the client state to restore. */
  async setup() {
    this.previousSetting = game.settings.get(MODULE, SETTING);
    this.previousExpanded = ui.sidebar.expanded;
    this.previousTab = ui.sidebar.tabGroups?.primary;
    await this.ta.setup();
    this.documents = this.ta.documents;
    const second = await this.documents.createActor({ type: "Player Character" });
    this.ta.actors.second = second;
    const source = await second.getTokenDocument({ name: "second", x: 1500, y: 1500, disposition: 1, actorLink: true,
      flags: { [HARNESS]: { runId: this.documents.runId } } });
    const [token] = await this.ta.scene.createEmbeddedDocuments("Token", [source.toObject()]);
    this.documents.documents.push(token);
    this.ta.tokens.second = token.object;
    // Role mix: elite leader, minion, solo; the others have no special role.
    await this.ta.actors.enemy.update({ "system.details.role": { secondary: "elite", leader: true } });
    await this.ta.actors.far.update({ "system.details.role": { secondary: "minion" } });
    await this.ta.actors.large.update({ "system.details.role": { secondary: "solo" } });
    return this;
  }

  /** A fresh, unstarted encounter with every roster member, viewed in the open sidebar. */
  async newCombat({ title = "Quench Ambush", omit = [] } = {}) {
    await this.deleteCombat();
    for (const actor of Object.values(this.ta.actors)) {
      if (actor.system.attributes.hp.value !== 40 || actor.system.attributes.hp.max !== 40) {
        await actor.update({ "system.attributes.hp.value": 40, "system.attributes.hp.max": 40 });
      }
    }
    this.combat = await Combat.create({ scene: this.ta.scene.id, flags: { [HARNESS]: { runId: this.documents.runId },
      ...(title ? { [MODULE]: { presentation: { title } } } : {}) } });
    this.documents.documents.push(this.combat);
    await this.combat.createEmbeddedDocuments("Combatant", ROSTER.filter(entry => !omit.includes(entry.key)).map(entry => {
      const token = this.ta.tokens[entry.key].document;
      return { tokenId: token.id, sceneId: this.ta.scene.id, actorId: token.actorId, initiative: entry.initiative };
    }));
    await this.show();
    return this.combat;
  }

  /** Show the sidebar's Combat tab so layout and hit-testing are real. */
  async show() {
    await ui.combat.render({ combat: this.combat, force: true });
    await waitForFact(() => ui.combat.viewed?.id === this.combat.id && this.rows().length === this.combat.turns.length, "tracker rows");
    await this.ensureVisible();
  }

  /**
   * Foundry switches the sidebar to Chat when combat starts, which collapses every row to zero size.
   * Bring the Combat tab back before anything measures or aims at a row.
   */
  async ensureVisible() {
    if (!ui.sidebar.expanded) {
      ui.sidebar.expand();
    }
    if (ui.sidebar.tabGroups.primary !== "combat") {
      ui.sidebar.changeTab("combat", "primary");
    }
    await waitForFact(() => this.rows()[0]?.getBoundingClientRect().height > 0, "visible Combat tab");
  }

  async deleteCombat() {
    if (this.combat && game.combats.has(this.combat.id)) {
      await this.combat.delete();
    }
    this.documents.documents = this.documents.documents.filter(document => document !== this.combat);
    this.combat = null;
  }

  get element() {
    return ui.combat.element;
  }

  /** Every rendered combatant row, in display order. */
  rows() {
    return [...(this.element?.querySelectorAll("li.combatant") ?? [])];
  }

  /** The row for a roster key. */
  row(key) {
    const id = this.combatantId(key);
    return this.rows().find(row => row.dataset.combatantId === id);
  }

  combatantId(key) {
    return this.combat.combatants.find(combatant => combatant.tokenId === this.ta.tokens[key].document.id).id;
  }

  combatant(key) {
    return this.combat.combatants.get(this.combatantId(key));
  }

  /** Roster keys in the order the tracker currently lists them. */
  order() {
    return this.rows().map(row => this.keyOf(row.dataset.combatantId));
  }

  keyOf(combatantId) {
    const tokenId = this.combat.combatants.get(combatantId).tokenId;
    return Object.keys(this.ta.tokens).find(key => this.ta.tokens[key].document.id === tokenId);
  }

  /** Begin combat and make a specific combatant the acting one. */
  async start(actingKey = "caster") {
    await this.combat.startCombat();
    const index = this.combat.turns.findIndex(combatant => combatant.id === this.combatantId(actingKey));
    if (this.combat.turn !== index) {
      await this.combat.update({ turn: index });
    }
    await waitForFact(() => this.element.classList.contains("is-started") && this.combat.combatant?.id === this.combatantId(actingKey),
      "started tracker");
    await this.ensureVisible();
  }

  /** The pointer height that lands between two rows (null = beyond that end of the list). */
  yBetween(aboveKey, belowKey) {
    const list = this.element.querySelector("ol.combat-tracker").getBoundingClientRect();
    const middle = key => {
      const box = this.row(key).getBoundingClientRect();
      return box.top + box.height / 2;
    };
    if (!aboveKey) {
      return list.top - 100;
    }
    if (!belowKey) {
      return list.bottom + 100;
    }
    return (middle(aboveKey) + middle(belowKey)) / 2;
  }

  /**
   * Drag a row to a pointer height and drop it, through the same events a mouse produces.
   * `y` may be a function, so it is measured only after the tracker is visible.
   */
  async drag(key, y, { dropOn = this.element, drop = true } = {}) {
    await this.ensureVisible();
    const clientY = typeof y === "function" ? y() : y;
    const dataTransfer = new DataTransfer();
    const row = this.row(key);
    row.dispatchEvent(dragEvent("dragstart", { dataTransfer }));
    dropOn.dispatchEvent(dragEvent("dragover", { dataTransfer, clientY }));
    if (drop) {
      dropOn.dispatchEvent(dragEvent("drop", { dataTransfer, clientY }));
      row.dispatchEvent(dragEvent("dragend", { dataTransfer }));
    }
    return { row, dataTransfer };
  }

  /** Restore the client and delete everything the batch made. */
  async cleanup() {
    const failures = [];
    for (const step of [
      // Other modules react to targeting on the next animation frame; let that happen before tokens are deleted.
      async () => {
        for (const token of [...game.user.targets]) {
          token.setTarget(false, { releaseOthers: false });
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100))));
      },
      () => this.deleteCombat(),
      () => game.settings.set(MODULE, SETTING, this.previousSetting),
      () => this.ta.cleanup(),
    ]) {
      try {
        await step();
      } catch (error) {
        failures.push(error);
      }
    }
    if (this.previousTab) {
      ui.sidebar.changeTab(this.previousTab, "primary");
    }
    if (!this.previousExpanded) {
      ui.sidebar.collapse();
    }
    if (failures.length) {
      throw new AggregateError(failures, failures.map(error => error.message).join("; "));
    }
  }
}

/** Exercise the compact tracker against Foundry's real CombatTracker, documents, hooks and layout. */
export function registerCompactTrackerTests(quench) {
  const key = `${MODULE}.compact-tracker`;
  quench.registerBatch(key, ({ describe, it, assert, before, after, beforeEach, afterEach }) => {
    describe("Compact combat tracker", function () {
      this.timeout(60000);
      let fixture;
      let realNow;

      before(async function () {
        fixture = await new CompactTrackerFixture().setup();
        await game.settings.set(MODULE, SETTING, true);
      });

      after(async function () {
        await fixture?.cleanup();
      });

      beforeEach(async function () {
        await game.settings.set(MODULE, SETTING, true);
        await fixture.newCombat();
      });

      afterEach(async function () {
        fixture.element?.dispatchEvent(dragEvent("dragend"));
        if (realNow) {
          Date.now = realNow;
          realNow = null;
        }
        delete game.user.isGM;
        await fixture.ta.cancel();
      });

      /** Read the timer line's visible text. */
      const timer = () => fixture.element.querySelector("[data-compact-timer]");
      const hpText = key => fixture.row(key)?.querySelector("[data-compact-hp]")?.textContent;

      describe("setting", function () {
        it("is a world-scoped boolean, off by default", function () {
          const setting = game.settings.settings.get(`${MODULE}.${SETTING}`);
          assert.equal(setting.scope, "world");
          assert.equal(setting.type, Boolean);
          assert.isFalse(setting.default);
          assert.isTrue(setting.config);
        });

        it("leaves Foundry's own tracker untouched while off", async function () {
          await game.settings.set(MODULE, SETTING, false);
          await waitForFact(() => !fixture.element.classList.contains(ROOT), "stock tracker");
          assert.isNull(fixture.element.querySelector("[data-compact-role]"));
          assert.isNull(fixture.element.querySelector("[data-compact-hp]"));
          assert.isNull(fixture.element.querySelector("[data-compact-title]"));
          assert.isNull(fixture.element.querySelector("[data-compact-info]"));
          assert.notEqual(getComputedStyle(fixture.rows()[0].querySelector(".token-image")).display, "none");
        });

        it("applies and removes the layout immediately, without a reload", async function () {
          await game.settings.set(MODULE, SETTING, false);
          await waitForFact(() => !fixture.element.classList.contains(ROOT), "layout removed");
          await game.settings.set(MODULE, SETTING, true);
          await waitForFact(() => fixture.element.classList.contains(ROOT) && fixture.element.querySelector("[data-compact-role]"), "layout applied");
        });

        it("is applied to the pop-out tracker as well", async function () {
          await ui.combat.renderPopout();
          try {
            const popout = await waitForFact(() => ui.combat.popout?.rendered && ui.combat.popout, "pop-out tracker");
            await waitForFact(() => popout.element.classList.contains(ROOT) && popout.element.querySelector("[data-compact-role]"), "compact pop-out");
          } finally {
            await ui.combat.popout?.close();
          }
        });
      });

      describe("rows", function () {
        it("drops portraits, effect icons and the native resource text", function () {
          const row = fixture.row("caster");
          for (const selector of [".token-image", ".token-effects", ".token-resource"]) {
            const node = row.querySelector(selector);
            assert.isTrue(!node || getComputedStyle(node).display === "none", `${selector} is hidden`);
          }
        });

        it("puts everything on one line: role, name, HP, then the eye button", function () {
          const row = fixture.row("enemy");
          const box = node => node.getBoundingClientRect();
          const role = row.querySelector("[data-compact-role]");
          const name = row.querySelector(".name");
          const hp = row.querySelector("[data-compact-hp]");
          const eye = row.querySelector("[data-action='toggleHidden']");
          assert.isBelow(box(row).height, 44, "a compact row is a single line tall");
          const centre = node => box(node).top + box(node).height / 2;
          for (const node of [role, hp, eye]) {
            assert.isBelow(Math.abs(centre(node) - centre(name)), 8, "on the same line as the name");
          }
          assert.isBelow(box(role).left, box(name).left, "role icon before the name");
          assert.isBelow(box(name).left, box(hp).left, "name before HP");
          assert.isBelow(box(hp).left, box(eye).left, "HP before the eye");
          assert.equal(getComputedStyle(name).textAlign, "left");
        });

        it("keeps Hide Token working", async function () {
          const combatant = fixture.combatant("ally");
          const eye = fixture.row("ally").querySelector("[data-action='toggleHidden']");
          assert.isNotNull(eye);
          eye.click();
          await waitForFact(() => combatant.hidden === true, "token hidden");
          await waitForFact(() => fixture.row("ally")?.classList.contains("hide"), "hidden row styling");
          fixture.row("ally").querySelector("[data-action='toggleHidden']").click();
          await waitForFact(() => combatant.hidden === false, "token shown again");
        });

        it("shows one role icon per creature, in the health display's priority and colours", function () {
          const roleOf = key => fixture.row(key).querySelector("[data-compact-role]");
          assert.include(roleOf("enemy").className, "is-leader", "an elite leader shows the leader star");
          assert.isNotNull(roleOf("enemy").querySelector("i.fa-star"));
          assert.isNotNull(roleOf("far").querySelector("i.fa-chess-pawn"));
          assert.include(roleOf("far").className, "is-minion");
          assert.isNotNull(roleOf("large").querySelector("i.fa-skull"));
          assert.include(roleOf("large").className, "is-solo");
          for (const key of ["caster", "ally", "slowed", "second"]) {
            assert.isNull(roleOf(key).querySelector("i"), `${key} has no role icon`);
            assert.equal(roleOf(key).getAttribute("aria-hidden"), "true");
          }
          assert.equal(roleOf("enemy").getAttribute("aria-label"), "Leader");
          assert.equal(getComputedStyle(roleOf("enemy")).color, "rgb(241, 206, 112)");
        });

        it("keeps names aligned whether or not a row has a role icon", function () {
          const lefts = ["caster", "enemy", "far", "large"].map(key => fixture.row(key).querySelector(".name").getBoundingClientRect().left);
          assert.lengthOf([...new Set(lefts.map(Math.round))], 1);
        });

        it("shows current/max HP in green, yellow, orange and red, switching exactly at 75, 50 and 25 percent", async function () {
          const colours = { "is-green": "rgb(143, 209, 138)", "is-yellow": "rgb(232, 211, 106)", "is-orange": "rgb(240, 149, 63)", "is-red": "rgb(238, 106, 95)" };
          // Out of 40: values on each side of every boundary.
          const steps = [[40, "is-green"], [38, "is-green"], [31, "is-green"], [30, "is-yellow"], [21, "is-yellow"], [20, "is-orange"],
            [11, "is-orange"], [10, "is-red"], [1, "is-red"], [0, "is-red"]];
          for (const [hp, className] of steps) {
            await fixture.ta.actors.far.update({ "system.attributes.hp.value": hp });
            await waitForFact(() => hpText("far") === `${hp}/40`, `far HP text ${hp}/40`);
            const element = fixture.row("far").querySelector("[data-compact-hp]");
            assert.include(element.className, className, `${hp}/40`);
            for (const other of Object.keys(colours).filter(name => name !== className)) {
              assert.notInclude(element.className, other, `${hp}/40 is only ${className}`);
            }
            assert.equal(getComputedStyle(element.querySelector("b")).color, colours[className], `${hp}/40 colour`);
          }
        });

        it("refreshes HP live when an actor changes", async function () {
          assert.equal(hpText("ally"), "40/40");
          await fixture.ta.actors.ally.update({ "system.attributes.hp.value": 3 });
          await waitForFact(() => hpText("ally") === "3/40", "live HP update");
          assert.include(fixture.row("ally").querySelector("[data-compact-hp]").className, "is-red");
        });

        it("marks each row's team: players, friendly, and hostile", function () {
          assert.equal(fixture.row("caster").dataset.team, "pc");
          assert.equal(fixture.row("second").dataset.team, "pc");
          assert.equal(fixture.row("ally").dataset.team, "friendly");
          assert.equal(fixture.row("enemy").dataset.team, "enemy");
        });

        it("keeps the Ledger, Momentum and Battle Briefing buttons in the header", function () {
          const header = fixture.element.querySelector(".combat-tracker-header");
          assert.isNotNull(header.querySelector("[data-dnd4e-combat-start]"), "Battle Briefing button");
          if (game.settings.get(MODULE, "combatLedgerEnabled")) {
            assert.isNotNull(header.querySelector("[data-combat-ledger]"), "Combat Ledger button");
            if (game.settings.get(MODULE, "battleMomentumEnabled")) {
              assert.isNotNull(header.querySelector("[data-battle-momentum]"), "Battle Momentum button");
            }
          }
        });
      });

      describe("header and footer", function () {
        it("shows the Battle Briefing title above the round tracker, and hides the stock encounter name", function () {
          const title = fixture.element.querySelector(".dnd4e-compact-tracker__title");
          assert.equal(title.textContent, "Quench Ambush");
          const nativeName = fixture.element.querySelector(".encounter-name");
          assert.isTrue(!nativeName || getComputedStyle(nativeName).display === "none");
          const controls = fixture.element.querySelector(".encounter-controls");
          assert.equal(title.nextElementSibling, controls, "the title sits directly above the round line");
        });

        it("has no title without a Battle Briefing, and picks one up when it is added", async function () {
          await fixture.newCombat({ title: null });
          assert.isNull(fixture.element.querySelector("[data-compact-title]"));
          await fixture.combat.setFlag(MODULE, "presentation", { title: "Added Later" });
          await waitForFact(() => fixture.element.querySelector("[data-compact-title]")?.textContent === "Added Later", "added title");
        });

        it("titles are escaped, not interpreted as HTML", async function () {
          await fixture.combat.setFlag(MODULE, "presentation", { title: "<img src=x onerror=window.__quenchXss=1> Ford" });
          await waitForFact(() => fixture.element.querySelector("[data-compact-title]")?.textContent.includes("Ford"), "escaped title");
          assert.isNull(fixture.element.querySelector("[data-compact-title] img"));
          assert.isUndefined(window.__quenchXss);
        });

        it("shows the round and turn as the subtitle", async function () {
          const status = () => fixture.element.querySelector(".encounter-title").textContent.trim();
          assert.equal(status(), game.i18n.localize("COMBAT.NotStarted"));
          await fixture.start("caster");
          await waitForFact(() => status() === "Round 1 · Turn 1 of 7", "first turn subtitle");
          await fixture.combat.nextTurn();
          await waitForFact(() => status() === "Round 1 · Turn 2 of 7", "second turn subtitle");
          await fixture.combat.update({ turn: 6 });
          await waitForFact(() => status() === "Round 1 · Turn 7 of 7", "last turn subtitle");
          await fixture.combat.nextTurn();
          await waitForFact(() => status() === "Round 2 · Turn 1 of 7", "next round subtitle");
        });

        it("names the first player before combat starts", function () {
          const next = fixture.element.querySelector("[data-compact-next]");
          assert.include(next.textContent, "First player: caster");
          assert.include(next.textContent, "turn 1");
        });

        it("counts the turns until the next player once combat is running, wrapping into the next round", async function () {
          const next = () => fixture.element.querySelector("[data-compact-next]")?.textContent.replace(/\s+/g, " ").trim();
          await fixture.start("enemy");
          await waitForFact(() => /^Next player: second\s*in 5 turns$/.test(next()), "enemy acting");
          await fixture.combat.update({ turn: fixture.combat.turns.findIndex(c => c.id === fixture.combatantId("caster")) });
          await waitForFact(() => /^Next player: second\s*in 6 turns$/.test(next()), "caster acting");
          await fixture.combat.update({ turn: fixture.combat.turns.findIndex(c => c.id === fixture.combatantId("second")) });
          await waitForFact(() => /^Next player: caster\s*next$/.test(next()), "wraps to the next round");
        });
      });

      describe("initiative", function () {
        it("shows an editable number before combat, and GMs can correct it", async function () {
          const input = fixture.row("ally").querySelector(".token-initiative input.initiative-input");
          assert.isNotNull(input, "decimal initiatives are editable for the GM");
          assert.isTrue(input.hasAttribute("data-compact-initiative"));
          assert.isBelow(Math.abs(Number(input.value) - fixture.combatant("ally").initiative), 1, "shows the combatant's initiative, as the stock tracker rounds it");
          input.value = "30";
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await waitForFact(() => fixture.combatant("ally").initiative === 30, "initiative saved");
          await waitForFact(() => fixture.order()[0] === "ally", "tracker re-sorted");
        });

        it("keeps rows undraggable and ungripped until combat starts", function () {
          for (const row of fixture.rows()) {
            assert.isFalse(row.draggable);
            assert.isNull(row.querySelector("[data-compact-grip]"));
          }
          assert.isFalse(fixture.element.classList.contains("is-draggable"));
        });

        it("hides the number once combat starts, but keeps Roll Initiative for someone who joins unrolled", async function () {
          await fixture.start("caster");
          await fixture.combat.createEmbeddedDocuments("Combatant", [{ tokenId: fixture.ta.tokens.neutral.document.id,
            sceneId: fixture.ta.scene.id, actorId: fixture.ta.tokens.neutral.document.actorId }]);
          await waitForFact(() => fixture.row("neutral"), "unrolled row");
          await fixture.ensureVisible();
          const numberOf = key => fixture.row(key).querySelector(".token-initiative > :is(input, span)");
          assert.equal(getComputedStyle(numberOf("ally")).display, "none");
          const roll = fixture.row("neutral").querySelector(".token-initiative button.roll");
          assert.isNotNull(roll);
          assert.notEqual(getComputedStyle(roll).display, "none");
          assert.isAbove(roll.getBoundingClientRect().width, 0);
        });
      });

      describe("drag to reorder", function () {
        beforeEach(async function () {
          await fixture.start("caster");
        });

        it("makes every row draggable, with a grip", function () {
          assert.isTrue(fixture.element.classList.contains("is-draggable"));
          for (const row of fixture.rows()) {
            assert.isTrue(row.draggable);
            assert.isNotNull(row.querySelector("[data-compact-grip]"));
          }
        });

        it("slots a row between two others at the midpoint of their initiatives", async function () {
          const above = fixture.combatant("caster").initiative;
          const below = fixture.combatant("enemy").initiative;
          await fixture.drag("second", () => fixture.yBetween("caster", "enemy"));
          await waitForFact(() => fixture.combatant("second").initiative === round6((above + below) / 2), "midpoint initiative");
          await waitForFact(() => fixture.order().slice(0, 3).join() === "caster,second,enemy", "reordered tracker");
          assert.equal(fixture.combatant("caster").initiative, above, "neighbours are untouched");
          assert.equal(fixture.combatant("enemy").initiative, below);
        });

        it("shows a drop marker where the row will land and dims the dragged row, then clears both", async function () {
          const { row } = await fixture.drag("second", () => fixture.yBetween("caster", "enemy"), { drop: false });
          assert.isTrue(fixture.row("enemy").classList.contains("drop-before"));
          await waitForFact(() => row.classList.contains("is-dragging"), "dragged row dimmed");
          const list = fixture.element.querySelector("ol.combat-tracker").getBoundingClientRect();
          fixture.element.dispatchEvent(dragEvent("dragover", { clientY: list.bottom + 100 }));
          assert.lengthOf(fixture.element.querySelectorAll(".drop-before, .drop-after"), 1, "only one marker at a time");
          assert.isTrue(fixture.rows().filter(candidate => candidate !== row).at(-1).classList.contains("drop-after"), "after the last row");
          row.dispatchEvent(dragEvent("dragend"));
          assert.isNull(fixture.element.querySelector(".drop-before, .drop-after"));
          assert.isNull(fixture.element.querySelector(".is-dragging"));
        });

        it("lets the acting combatant be moved without passing, repeating or announcing a turn", async function () {
          let turnChanges = 0;
          const hook = Hooks.on("combatTurnChange", () => { turnChanges++; });
          try {
            const actingId = fixture.combat.combatant.id;
            const round = fixture.combat.round;
            await fixture.drag("caster", () => fixture.yBetween("ally", "second"));
            await waitForFact(() => fixture.order().indexOf("caster") === 5, "caster moved down");
            assert.equal(fixture.combat.combatant.id, actingId, "the same combatant is still acting");
            assert.equal(fixture.combat.turn, 5, "the turn index followed them");
            assert.equal(fixture.combat.round, round);
            await new Promise(resolve => setTimeout(resolve, 300));
            assert.equal(turnChanges, 0, "no turn change was announced");
          } finally {
            Hooks.off("combatTurnChange", hook);
          }
        });

        it("keeps the turn on the acting combatant when someone else moves past them", async function () {
          await fixture.combat.update({ turn: fixture.combat.turns.findIndex(c => c.id === fixture.combatantId("enemy")) });
          const actingId = fixture.combat.combatant.id;
          await fixture.drag("second", () => fixture.yBetween(null, "caster"));
          await waitForFact(() => fixture.order()[0] === "second", "second moved to the top");
          assert.equal(fixture.combat.combatant.id, actingId);
          assert.equal(fixture.combat.turn, 2, "the acting combatant is now third");
        });

        it("splits tied combatants exactly where the row is dropped", async function () {
          const tied = fixture.order().filter(name => ["far", "large", "slowed"].includes(name));
          assert.lengthOf(tied, 3);
          await fixture.drag("second", () => fixture.yBetween(tied[1], tied[2]));
          await waitForFact(() => fixture.order().includes("second") && fixture.order().indexOf("second") === fixture.order().indexOf(tied[1]) + 1,
            "dropped between the second and third tied rows");
          assert.deepEqual(fixture.order().slice(2, 6), [tied[0], tied[1], "second", tied[2]]);
          const values = fixture.combat.turns.map(combatant => combatant.initiative);
          assert.deepEqual([...values].sort((a, b) => b - a), values, "turn order matches the numbers");
          assert.equal(new Set(values).size, values.length, "no ties remain");
          assert.equal(fixture.combatant("caster").initiative, 20.1234, "unrelated combatants are untouched");
          assert.equal(fixture.combatant("enemy").initiative, 18.0412);
        });

        it("keeps splitting the same tie on later drops, even when the gaps are tiny", async function () {
          const tied = fixture.order().filter(name => ["far", "large", "slowed"].includes(name));
          await fixture.drag("second", () => fixture.yBetween(tied[0], tied[1]));
          await waitForFact(() => fixture.order().indexOf("second") === 3, "first drop inside the tie");
          await fixture.drag("ally", () => fixture.yBetween(tied[1], tied[2]));
          await waitForFact(() => fixture.order().indexOf("ally") === 5, "second drop inside the tie");
          assert.deepEqual(fixture.order(), ["caster", "enemy", tied[0], "second", tied[1], "ally", tied[2]]);
          const values = fixture.combat.turns.map(combatant => combatant.initiative);
          assert.equal(new Set(values).size, values.length, "still no ties");
        });

        it("moves a tied row within its own tie without disturbing the others", async function () {
          const tied = fixture.order().filter(name => ["far", "large", "slowed"].includes(name));
          await fixture.drag(tied[2], () => fixture.yBetween(tied[0], tied[1]));
          await waitForFact(() => fixture.order().indexOf(tied[2]) === fixture.order().indexOf(tied[0]) + 1, "moved inside the tie");
          assert.deepEqual(fixture.order().slice(2, 5), [tied[0], tied[2], tied[1]]);
        });

        it("lets go anywhere over the tracker: above the list is first, below is last", async function () {
          const top = fixture.combatant("caster").initiative;
          const header = fixture.element.querySelector(".combat-tracker-header");
          await fixture.drag("ally", () => fixture.yBetween(null, "caster"), { dropOn: header });
          await waitForFact(() => fixture.combatant("ally").initiative === round6(top + 1), "one above the top");
          await waitForFact(() => fixture.order()[0] === "ally", "ally first");
          const bottom = fixture.combatant("second").initiative;
          const footer = fixture.element.querySelector(".combat-controls") ?? fixture.element;
          await fixture.drag("enemy", () => fixture.yBetween("second", null), { dropOn: footer });
          await waitForFact(() => fixture.combatant("enemy").initiative === round6(bottom - 1), "one below the bottom");
          await waitForFact(() => fixture.order().at(-1) === "enemy", "enemy last");
        });

        it("scrolls the list while the pointer is near its edge", async function () {
          const list = fixture.element.querySelector("ol.combat-tracker");
          const saved = [list.style.flex, list.style.height];
          list.style.flex = "none";
          list.style.height = "90px";
          try {
            assert.isAbove(list.scrollHeight, list.clientHeight, "the list needs to scroll for this test");
            const box = list.getBoundingClientRect();
            list.scrollTop = 0;
            await fixture.drag("caster", box.bottom - 5, { drop: false });
            assert.isAbove(list.scrollTop, 0, "bottom edge scrolls down");
            const scrolled = list.scrollTop;
            fixture.element.dispatchEvent(dragEvent("dragover", { clientY: box.top + 5 }));
            assert.isBelow(list.scrollTop, scrolled, "top edge scrolls back up");
            const middle = list.scrollTop;
            fixture.element.dispatchEvent(dragEvent("dragover", { clientY: box.top + box.height / 2 }));
            assert.equal(list.scrollTop, middle, "the middle does not scroll");
            fixture.element.dispatchEvent(dragEvent("dragend"));
          } finally {
            [list.style.flex, list.style.height] = saved;
          }
        });

        it("reaches rows that were scrolled out of view", async function () {
          const list = fixture.element.querySelector("ol.combat-tracker");
          const saved = [list.style.flex, list.style.height];
          list.style.flex = "none";
          list.style.height = "90px";
          try {
            list.scrollTop = list.scrollHeight;
            const tail = fixture.order().at(-1);
            const lastRow = fixture.row(tail);
            await fixture.drag("caster", lastRow.getBoundingClientRect().top - 2);
            await waitForFact(() => fixture.order().indexOf("caster") === fixture.order().length - 2, "dropped just above the last row");
            assert.equal(fixture.order().at(-1), tail, "the last row is still last");
          } finally {
            [list.style.flex, list.style.height] = saved;
          }
        });

        it("survives Foundry re-rendering the tracker mid-drag, and still drops where the pointer is", async function () {
          const y = () => fixture.yBetween("caster", "enemy");
          await fixture.drag("second", y, { drop: false });
          const before = fixture.row("second");
          await fixture.ta.actors.ally.update({ "system.attributes.hp.value": 7 });
          await new Promise(resolve => setTimeout(resolve, 500));
          await fixture.ensureVisible();
          assert.isTrue(fixture.row("second").classList.contains("is-dragging"), "the dragged row is still dimmed after any re-render");
          fixture.element.dispatchEvent(dragEvent("drop", { clientY: y() }));
          fixture.element.dispatchEvent(dragEvent("dragend"));
          await waitForFact(() => fixture.order().slice(0, 3).join() === "caster,second,enemy", "dropped after the re-render");
          await waitForFact(() => hpText("ally") === "7/40", "HP caught up");
          assert.isNotNull(before);
        });

        it("ignores drags that did not start in the tracker", async function () {
          const before = fixture.combat.turns.map(combatant => combatant.initiative);
          const y = fixture.yBetween("caster", "enemy");
          fixture.element.dispatchEvent(dragEvent("dragover", { clientY: y }));
          assert.isNull(fixture.element.querySelector(".drop-before, .drop-after"), "no drop marker for a foreign drag");
          fixture.element.dispatchEvent(dragEvent("drop", { clientY: y }));
          await new Promise(resolve => setTimeout(resolve, 400));
          assert.deepEqual(fixture.combat.turns.map(combatant => combatant.initiative), before, "dropping an actor or item changes nothing");
        });

        it("does nothing when a row is dropped back where it was", async function () {
          const before = fixture.combat.turns.map(combatant => combatant.initiative);
          await fixture.drag("enemy", () => fixture.yBetween("caster", "far"));
          await new Promise(resolve => setTimeout(resolve, 400));
          assert.deepEqual(fixture.combat.turns.map(combatant => combatant.initiative), before);
        });
      });

      describe("turn timer", function () {
        beforeEach(async function () {
          await fixture.start("caster");
        });

        it("appears for the GM once combat starts, and not before", async function () {
          assert.isNotNull(timer());
          await fixture.newCombat();
          assert.isNull(timer(), "no timer before combat starts");
        });

        it("counts up and restarts on the next turn", async function () {
          const seconds = () => {
            const [, minutes, rest] = timer().querySelector(".time").textContent.match(/(\d+):(\d\d)/);
            return Number(minutes) * 60 + Number(rest);
          };
          await waitForFact(() => seconds() >= 2, "two seconds counted", 6000);
          await fixture.combat.nextTurn();
          await waitForFact(() => seconds() <= 1, "restart on the next turn");
          assert.notInclude(timer().className, "is-yellow");
        });

        it("turns yellow at 1:00 and orange at 2:00", async function () {
          realNow = Date.now;
          let offset = 0;
          Date.now = () => realNow() + offset;
          assert.include(timer().className, "is-none");
          offset += 61000;
          await waitForFact(() => timer().classList.contains("is-yellow"), "yellow at 1:00");
          assert.match(timer().querySelector(".time").textContent, /^1:0\d$/);
          offset += 60000;
          await waitForFact(() => timer().classList.contains("is-orange"), "orange at 2:00");
          assert.match(timer().querySelector(".time").textContent, /^2:0\d$/);
        });

        it("freezes while the acting player is in Target Automation, and resumes after", async function () {
          const frozen = () => timer().querySelector(".time").textContent;
          await fixture.ta.open({ targets: ["enemy"] });
          await waitForFact(() => /Paused · Target Automation/.test(timer().textContent), "paused for Target Automation");
          assert.include(timer().className, "is-paused");
          const at = frozen();
          await new Promise(resolve => setTimeout(resolve, 2200));
          assert.equal(frozen(), at, "the time did not move while paused");
          await fixture.ta.cancel();
          await waitForFact(() => !/Paused/.test(timer().textContent), "resumed");
          await waitForFact(() => frozen() !== at, "counting again");
        });

        it("ignores a Target Automation session that belongs to someone else's turn", async function () {
          await fixture.combat.update({ turn: fixture.combat.turns.findIndex(c => c.id === fixture.combatantId("enemy")) });
          await waitForFact(() => fixture.combat.combatant.id === fixture.combatantId("enemy"), "enemy acting");
          await fixture.ta.open({ targets: ["ally"] });
          await new Promise(resolve => setTimeout(resolve, 1500));
          assert.notMatch(timer().textContent, /Paused/);
        });

        it("freezes while Dice So Nice animates, and Target Automation takes precedence", async function () {
          Hooks.callAll("diceSoNiceRollStart", "quench-roll", {});
          await waitForFact(() => /Paused · Dice So Nice/.test(timer().textContent), "paused for Dice So Nice");
          await fixture.ta.open({ targets: ["enemy"] });
          await waitForFact(() => /Paused · Target Automation/.test(timer().textContent), "Target Automation outranks the dice");
          assert.notInclude(timer().textContent, "Dice So Nice");
          await fixture.ta.cancel();
          await waitForFact(() => /Paused · Dice So Nice/.test(timer().textContent), "back to the dice reason");
          Hooks.callAll("diceSoNiceRollComplete", "quench-roll");
          await waitForFact(() => !/Paused/.test(timer().textContent), "dice finished");
        });
      });

      describe("player view", function () {
        /**
         * Render the tracker as a non-GM user would see it, using this client's own documents.
         * Other modules (Aura Effects) keep working asynchronously after a combat is deleted and read
         * `game.users.activeGM`, which is null while isGM is stubbed. Let that finish first, so the stub never
         * overlaps it and surfaces as an uncaught error in an unrelated module.
         */
        async function asPlayer() {
          await new Promise(resolve => setTimeout(resolve, 2500));
          Object.defineProperty(game.user, "isGM", { configurable: true, get: () => false });
          await ui.combat.render({ force: true });
          await waitForFact(() => fixture.rows().length > 0, "player tracker");
        }

        it("gets the layout and next player but no timer, grips, or initiative editing", async function () {
          await fixture.start("caster");
          await asPlayer();
          assert.isTrue(fixture.element.classList.contains(ROOT));
          assert.isNull(timer(), "players never see the turn timer");
          assert.isNotNull(fixture.element.querySelector("[data-compact-next]"));
          assert.include(fixture.element.querySelector(".dnd4e-compact-tracker__title").textContent, "Quench Ambush");
          assert.isFalse(fixture.element.classList.contains("is-draggable"));
          for (const row of fixture.rows()) {
            assert.isFalse(row.draggable);
            assert.isNull(row.querySelector("[data-compact-grip]"));
          }
        });

        it("refuses a drag even if the events are forced", async function () {
          await fixture.start("caster");
          await asPlayer();
          const before = fixture.combat.turns.map(combatant => combatant.initiative);
          const event = dragEvent("dragstart");
          fixture.row("second").dispatchEvent(event);
          assert.isTrue(event.defaultPrevented, "the drag is cancelled for players");
          fixture.element.dispatchEvent(dragEvent("dragover", { clientY: fixture.yBetween("caster", "enemy") }));
          fixture.element.dispatchEvent(dragEvent("drop", { clientY: fixture.yBetween("caster", "enemy") }));
          await new Promise(resolve => setTimeout(resolve, 300));
          assert.deepEqual(fixture.combat.turns.map(combatant => combatant.initiative), before);
        });

        it("cannot edit initiative before combat", async function () {
          await asPlayer();
          assert.isNull(fixture.element.querySelector(".token-initiative input.initiative-input"));
        });

        it("sees HP only for combatants they can observe", async function () {
          const levels = { second: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER, caster: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
          const overridden = [];
          try {
            // The GM stub does not change Foundry's permission lookup, so state each combatant's level directly.
            for (const entry of fixture.combat.combatants) {
              const level = levels[fixture.keyOf(entry.id)] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
              Object.defineProperty(entry, "permission", { configurable: true, get: () => level });
              overridden.push(entry);
            }
            await asPlayer();
            await waitForFact(() => hpText("second") === "40/40" && hpText("caster") === "40/40", "observed and owned HP");
            assert.isUndefined(hpText("enemy"), "hostile HP stays hidden");
            assert.isUndefined(hpText("ally"));
            assert.isUndefined(hpText("far"));
          } finally {
            for (const entry of overridden) {
              delete entry.permission;
            }
          }
        });
      });
    });
  }, { displayName: "INFO DISPLAYS: Compact combat tracker", preSelected: false });
  return key;
}
