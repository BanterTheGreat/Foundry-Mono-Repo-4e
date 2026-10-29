import { TargetAutomationFixture, waitForFact } from "./target-automation-fixture.js";
import { resolveRange, automationSheetState } from "../scripts/power-activation/system-adapter.js";
import { supportsTargetAutomation, targetCountProblems, targetFilterProblems, selectionProblems, powerOriginRules } from "../scripts/power-activation/rules.js";

/** Register live native-schema, canvas-controller and commitment matrices. */
export function registerTargetAutomationTests(quench) {
  const key = "dnd4e-health-display.target-automation";
  quench.registerBatch(key, ({ describe, it, assert, before, after, beforeEach, afterEach }) => {
    describe("Target Automation in the real Foundry runtime", function () {
      this.timeout(45000);
      let fixture;
      before(async function () {
        fixture = await new TargetAutomationFixture().setup();
      });
      after(async function () {
        await fixture?.cleanup();
      });
      beforeEach(async function () {
        await fixture.cancel();
      });
      afterEach(async function () {
        await fixture.cancel();
      });

      describe("Native range and weapon resolver", function () {
        for (const [name, system, expected] of [
          ["touch ignores an empty range", { rangeType: "touch", rangePower: "" }, [1, 1, "melee"]],
          ["touch ignores a large range", { rangeType: "touch", rangePower: "99" }, [1, 1, "melee"]],
          ["melee evaluates arithmetic", { rangeType: "melee", rangePower: "1 + 1" }, [2, 2, "melee"]],
          ["reach evaluates actor formulas", { rangeType: "reach", rangePower: "@lv + 1" }, [2, 2, "melee"]],
          ["nested actor variables resolve through native roll data", { rangeType: "melee", rangePower: "@details.level + 2" }, [3, 3, "melee"]],
          ["ranged evaluates normal and long range", { rangeType: "range", rangePower: "5", range: { long: "10" } }, [5, 10, "ranged"]],
          ["short long-range values do not reduce normal range", { rangeType: "range", rangePower: "5", range: { long: "2" } }, [5, 5, "ranged"]],
        ]) {
          it(name, async function () {
            const range = await resolveRange(fixture.power(system));
            assert.deepEqual([range.normal, range.maximum, range.mode], expected);
          });
        }
        for (const shape of ["closeBurst", "closeBlast", "rangeBurst", "rangeBlast", "wall"]) {
          it(`${shape} resolves native Area and placement range`, async function () {
            const range = await resolveRange(fixture.power({ rangeType: shape, area: "1 + 1", rangePower: "5" }));
            assert.equal(range.shape, shape);
            assert.equal(range.area, 2);
            assert.equal(range.maximum, shape.startsWith("close") ? 2 : 5);
            assert.isTrue(automationSheetState(fixture.power({ rangeType: shape })).area);
          });
        }
        for (const rangeType of ["range", "reach", "rangeBurst"]) {
          for (const value of ["0", "-1", "1.5"]) {
            it(`${rangeType} rejects invalid range ${value}`, async function () {
              await assert.isRejected(resolveRange(fixture.power({ rangeType, rangePower: value, area: "1" })));
            });
          }
        }
        for (const area of ["0", "-1", "1.5"]) {
          it(`area targeting rejects Area ${area}`, async function () {
            await assert.isRejected(resolveRange(fixture.power({ rangeType: "closeBurst", area })));
          });
        }
        for (const [mode, formula, normal, maximum] of [["melee", "", 2, 2], ["melee", "3", 3, 3],
          ["melee", "@lv + 2", 3, 3], ["ranged", "", 5, 10]]) {
          it(`selected spear in ${mode} mode with range '${formula}'`, async function () {
            const range = await resolveRange(fixture.power({ rangeType: "weapon", weaponUse: fixture.weapon.id,
              weaponType: mode, rangePower: formula }));
            assert.equal(range.weaponId, fixture.weapon.id);
            assert.equal(range.normal, normal);
            assert.equal(range.maximum, maximum);
          });
        }
        it("weapon targeting rejects a missing selected weapon", async function () {
          await assert.isRejected(resolveRange(fixture.power({ rangeType: "weapon", weaponUse: "none" })), /equipped weapon/);
        });
        for (const value of ["0", "3"]) {
          it(`summon placement accepts nonnegative range ${value}`, async function () {
            const range = await resolveRange(fixture.power({ rangeType: "personal", rangePower: value },
              { placementMode: "summon", summonActor: fixture.actors.companion.uuid }));
            assert.equal(range.shape, "summon");
            assert.equal(range.maximum, Number(value));
          });
        }
        it("area size and placement range both use native actor variables", async function () {
          const range = await resolveRange(fixture.power({ rangeType: "rangeBurst", area: "@lv + 1", rangePower: "@lv + 4" }));
          assert.equal(range.area, 2);
          assert.equal(range.maximum, 5);
        });
        it("summon range uses native actor variables", async function () {
          const range = await resolveRange(fixture.power({ rangeType: "personal", rangePower: "@lv + 2" },
            { placementMode: "summon", summonActor: fixture.actors.companion.uuid }));
          assert.equal(range.maximum, 3);
        });
      });

      describe("Configuration and target validation", function () {
        for (const [mode, selected, required, valid] of [
          ["exact", 0, 1, false], ["exact", 1, 1, true], ["exact", 2, 1, false],
          ["exact", 2, 2, true], ["upTo", 0, 3, false], ["upTo", 1, 3, true],
          ["upTo", 3, 3, true], ["upTo", 4, 3, false],
        ]) {
          it(`${mode} count: ${selected} selected for ${required}`, function () {
            assert.equal(targetCountProblems(selected, required, mode).length === 0, valid);
          });
        }
        for (const count of [0, -1, 1.5]) {
          it(`direct power rejects target count ${count}`, function () {
            assert.isFalse(supportsTargetAutomation(fixture.power({}, { targetCount: count })));
          });
        }
        it("area-all ignores saved count while counted-area requires it", function () {
          assert.isTrue(supportsTargetAutomation(fixture.power({ rangeType: "closeBurst" }, { targetCount: 0 })));
          assert.isFalse(supportsTargetAutomation(fixture.power({ rangeType: "closeBurst" }, { targetCount: 0, targetMode: "exact" })));
        });
        it("native actor statuses satisfy condition requirements", function () {
          const config = { targetCondition: "slowed" };
          assert.lengthOf(targetFilterProblems(fixture.tokens.slowed, config, Object.values(fixture.tokens), 100), 0);
          assert.lengthOf(targetFilterProblems(fixture.tokens.enemy, config, Object.values(fixture.tokens), 100), 1);
        });
        for (const [target, adjacency, valid] of [["enemy", "allies", true], ["enemy", "enemies", true],
          ["far", "allies", false], ["neutral", "allies", false], ["elevated", "enemies", false]]) {
          it(`${target} adjacency to ${adjacency} is ${valid ? "valid" : "invalid"}`, function () {
            assert.equal(targetFilterProblems(fixture.tokens[target], { targetAdjacent: adjacency }, Object.values(fixture.tokens), 100).length === 0, valid);
          });
        }
        it("footprint range includes large targets at the boundary", function () {
          assert.lengthOf(selectionProblems(fixture.tokens.caster, [fixture.tokens.large], { maximum: 3 }, 1, 100), 0);
          assert.isAbove(selectionProblems(fixture.tokens.caster, [fixture.tokens.large], { maximum: 2 }, 1, 100).length, 0);
        });
        it("different elevations remain advisory", function () {
          assert.include(selectionProblems(fixture.tokens.caster, [fixture.tokens.elevated], { maximum: 5 }, 1, 100).join(" "), "different elevation");
        });
        it("custom origins replace character origins instead of merging them", async function () {
          await fixture.actors.caster.setFlag("dnd4e-health-display", "targetAutomation.originActors", [fixture.actors.ally.uuid]);
          try {
            assert.deepEqual(powerOriginRules(fixture.power()).originActors, [fixture.actors.ally.uuid]);
            const custom = fixture.power({}, { originMode: "custom", originActors: [fixture.actors.companion.uuid], allowCaster: false });
            assert.deepEqual(powerOriginRules(custom), { originActors: [fixture.actors.companion.uuid], allowCaster: false });
          } finally {
            await fixture.actors.caster.unsetFlag("dnd4e-health-display", "targetAutomation");
          }
        });
      });

      describe("Live canvas sessions", function () {
        for (const [name, config, expected] of [
          ["all creatures except origin", {}, ["enemy", "ally", "neutral", "elevated", "slowed"]],
          ["includes the origin on request", { includeCaster: true }, ["caster", "enemy", "ally", "neutral", "elevated", "slowed"]],
          ["enemy filter", { targetDisposition: "enemies" }, ["enemy", "elevated", "slowed"]],
          ["ally filter", { targetDisposition: "allies" }, ["ally"]],
          ["condition filter", { targetCondition: "slowed" }, ["slowed"]],
          ["condition plus adjacency", { targetCondition: "slowed", targetAdjacent: "allies" }, ["slowed"]],
        ]) {
          it(`close burst ${name}`, async function () {
            const session = await fixture.open({ system: { rangeType: "closeBurst", area: "1" }, config });
            assert.deepEqual(session.targets.map(token => token.name).sort(), [...expected].sort());
            assert.isTrue(session.placementLocked);
            assert.equal(session.state, "targeting");
          });
        }
        for (const [shape, origin, expected] of [
          ["closeBlast", { x: 1100, y: 1000 }, ["enemy", "slowed"]],
          ["rangeBurst", { x: 1200, y: 1000 }, ["enemy", "large", "slowed"]],
          ["rangeBlast", { x: 1200, y: 1000 }, ["large"]],
        ]) {
          it(`${shape} selects footprint intersections from its locked placement`, async function () {
            const session = await fixture.open({ system: { rangeType: shape, area: shape === "rangeBurst" ? "1" : "2" } });
            assert.isFalse(session.placementLocked);
            session.origin = origin;
            session.placementLocked = true;
            session.selectAreaTargets();
            assert.deepEqual(session.targets.map(token => token.name).sort(), [...expected].sort());
            assert.lengthOf(session.areaProblems(), 0);
          });
        }
        it("counted area retains manual selection rather than selecting every creature", async function () {
          const session = await fixture.open({ system: { rangeType: "closeBurst", area: "1" },
            config: { targetMode: "exact", targetCount: 1 }, targets: ["enemy"] });
          session.selectAreaTargets();
          assert.deepEqual(session.targets.map(token => token.id), [fixture.tokens.enemy.id]);
        });
        it("manual exclusions survive refresh and reset on explicit reselection", async function () {
          const session = await fixture.open({ system: { rangeType: "closeBurst", area: "1" } });
          session.excludeAreaTarget(fixture.tokens.enemy);
          session.targets = session.targets.filter(token => token !== fixture.tokens.enemy);
          session.refreshAreaTargets();
          assert.notInclude(session.targets, fixture.tokens.enemy);
          session.selectAreaTargets();
          assert.include(session.targets, fixture.tokens.enemy);
        });
        it("creatures leaving and reentering an area update through real token hooks", async function () {
          const session = await fixture.open({ system: { rangeType: "closeBurst", area: "1" } });
          try {
            await fixture.tokens.enemy.document.update({ x: 1800 });
            await waitForFact(() => !session.targets.includes(fixture.tokens.enemy), "target leaving burst");
            await fixture.tokens.enemy.document.update({ x: 1100 });
            await waitForFact(() => session.targets.includes(fixture.tokens.enemy), "target reentering burst");
          } finally {
            await fixture.tokens.enemy.document.update({ x: 1100 });
          }
        });
        it("long-range targets are retained and cancellation restores prior selection", async function () {
          const session = await fixture.open({ system: { rangePower: "3", range: { long: "8" } }, targets: ["far"] });
          assert.include(session.targets, fixture.tokens.far);
          const preview = session.message.id;
          await session.cancel();
          assert.isFalse(game.messages.has(preview));
          assert.include([...game.user.targets], fixture.tokens.far);
          assert.equal(fixture.item.system.uses.value, 2);
        });
        it("mandatory condition requirements cannot be overridden", async function () {
          const session = await fixture.open({ config: { targetCondition: "slowed" }, targets: ["enemy"] });
          assert.isFalse(await session.confirmProblems());
          assert.equal(fixture.item.system.uses.value, 2);
          assert.equal(session.state, "targeting");
        });
        it("alternate origin resets placement and can exclude the real caster", async function () {
          const session = await fixture.open({ system: { rangeType: "closeBurst", area: "1" },
            config: { originMode: "custom", originActors: [fixture.actors.companion.uuid], allowCaster: false, includeCaster: true } });
          assert.equal(session.source, fixture.tokens.companion);
          assert.equal(session.caster, fixture.tokens.caster);
          assert.include(session.targets, fixture.tokens.companion);
          assert.notInclude(session.targets, fixture.tokens.caster);
          assert.lengthOf(session.originChoices(), 1);
        });
        it("actor and item updates refresh native range during targeting", async function () {
          const session = await fixture.open();
          await fixture.item.update({ "system.rangePower": "2" });
          await waitForFact(() => session.range.maximum === 2, "range refresh");
          assert.equal(session.state, "targeting");
        });
      });

      describe("Wall validation and commitment", function () {
        for (const [name, cells, config, fragment] of [
          ["side-connected bend", [[1200, 1200], [1300, 1200], [1300, 1300]], {}, null],
          ["closed loop", [[1200, 1200], [1300, 1200], [1300, 1300], [1200, 1300]], {}, null],
          ["empty wall", [], {}, "at least one"],
          ["duplicate squares", [[1200, 1200], [1200, 1200]], {}, "unique"],
          ["diagonal-only contact", [[1200, 1200], [1300, 1300]], {}, "connect through sides"],
          ["branching footprint", [[1200, 1200], [1300, 1200], [1400, 1200], [1300, 1300]], {}, "two other"],
          ["overlength footprint", [[1200, 1200], [1300, 1200], [1400, 1200], [1500, 1200], [1600, 1200]], {}, "exceeds"],
          ["square beyond range", [[2000, 2000]], {}, "within range"],
          ["square outside scene", [[-100, -100]], {}, "on the scene"],
          ["invalid height", [[1200, 1200]], { wallHeight: 0 }, "wall height"],
          ["solid wall overlapping a creature", [[1100, 1000]], { wallSolid: true }, "unoccupied"],
        ]) {
          it(name, async function () {
            const session = await fixture.open({ system: { rangeType: "wall", area: "4" }, config });
            const problems = session.wallProblems(cells.map(([x, y]) => ({ x, y })));
            if (fragment) {
              assert.include(problems.join(" "), fragment);
            } else {
              assert.lengthOf(problems, 0);
            }
          });
        }
        it("wall drawing ignores duplicates, supports Undo, and Clear resets its origin", async function () {
          const session = await fixture.open({ system: { rangeType: "wall", area: "4" } });
          for (const [x, y] of [[1200, 1200], [1300, 1200], [1300, 1200]]) {
            session.wallHover = { x, y };
            session.addWallSquare();
          }
          assert.lengthOf(session.wallCells, 2);
          session.editWall();
          assert.lengthOf(session.wallCells, 1);
          session.editWall(true);
          assert.lengthOf(session.wallCells, 0);
          assert.notExists(session.origin);
        });
        it("utility confirmation spends one use and finalizes the same card once", async function () {
          const session = await fixture.open({ targets: ["enemy"] });
          const id = session.message.id;
          await session.attack();
          assert.isTrue(session.finished);
          assert.equal(fixture.item.system.uses.value, 1);
          assert.isFalse(game.messages.get(id).flags["dnd4e-health-display"].powerActivation.provisional);
          await session.attack();
          assert.equal(fixture.item.system.uses.value, 1);
        });
        it("close-burst Region commits once and retains the excluded-origin hole", async function () {
          const session = await fixture.open({ system: { rangeType: "closeBurst", area: "1" }, config: { placeRegion: true, targetDisposition: "allies" } });
          await session.attack();
          const regions = fixture.scene.regions.filter(region => region.name === fixture.item.name);
          assert.lengthOf(regions, 1);
          assert.lengthOf(regions[0].shapes, 2);
          assert.isTrue(regions[0].shapes[1].hole);
          assert.equal(regions[0].shapes[0].width, 300);
          await session.placeAreaRegion();
          assert.equal(fixture.scene.regions.size, 1);
        });
        it("summon confirmation creates one token and consumes one use", async function () {
          const session = await fixture.open({ system: { rangeType: "personal", rangePower: "5" },
            config: { placementMode: "summon", summonActor: fixture.actors.companion.uuid } });
          session.origin = { x: 1400, y: 1400 };
          session.placementLocked = true;
          const before = fixture.scene.tokens.size;
          await session.attack();
          assert.equal(fixture.scene.tokens.size, before + 1);
          assert.equal(fixture.item.system.uses.value, 1);
          await session.placeSummon();
          assert.equal(fixture.scene.tokens.size, before + 1);
        });
      });
    });
  }, { displayName: "INFO DISPLAYS: Target Automation range, canvas and resource cases", preSelected: false });
  return key;
}
