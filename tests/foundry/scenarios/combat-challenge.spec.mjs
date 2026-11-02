import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

const counts = () => ({ actors: game.actors.size, scenes: game.scenes.size, combats: game.combats.size,
  messages: game.messages.size, tokens: game.scenes.reduce((n, scene) => n + scene.tokens.size, 0) });

test("Combat Challenge actor toggle, native attacks, confirmation and next-turn expiry", async ({ page }, testInfo) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (process.env.COMBAT_CHALLENGE_FAULT === 'friendly') {
    await page.route('**/trigger-prompts/combat-challenge.js', async route => {
      const response=await route.fetch();
      const body=(await response.text()).replace('target.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY','false');
      await route.fulfill({response,body});
    });
  }
  await openTestWorld(page);
  const preflight = await page.evaluate(() => ({ world: game.world.id,
    gm: game.user.isGM && game.users.activeGM?.id === game.user.id,
    optedIn: game.settings.get("foundry-test-harness", "testWorldId"),
    otherUsers: game.users.filter(u => u.active && u.id !== game.user.id).map(u => u.name),
    combats: game.combats.filter(c => c.active || c.started).map(c => c.id),
    fixtures: [...game.actors, ...game.scenes].filter(d => d.getFlag("foundry-test-harness", "runId")).map(d => d.name),
    workflows: [...foundry.applications.instances.values()].filter(app => app.session || app.element?.matches?.(".roll-dialogue")).map(app => app.title),
    running: game.quench?.isRunning === true,
  }));
  expect(preflight).toEqual({ world: settings.worldId, gm: true, optedIn: settings.worldId,
    otherUsers: [], combats: [], fixtures: [], workflows: [], running: false });
  const before = await page.evaluate(counts);
  await page.evaluate(() => { window.challengeOriginalMessages = game.messages.map(m => m.id); });
  try {
    await page.evaluate(async () => {
      const { TriggerWorld } = await import('/modules/banter-4e-modifications/test-foundry/trigger-prompt-fixture.js');
      window.challengeWorld = await TriggerWorld.open();
      await challengeWorld.encounter([
        { key: "fighter", col: 5, row: 5, actorFlags: { opportunityAttack: { enabled: false } } },
        { key: "enemy", col: 6, row: 5, disposition: -1 },
        { key: "neutral", col: 5, row: 6, disposition: 0 },
        { key: "friend", col: 4, row: 5, disposition: 1 },
      ]);
      window.challengeActor = challengeWorld.get("fighter").actor;
      const { ActorTriggerConfiguration } = await import('/modules/banter-4e-modifications/scripts/modules/trigger-prompts/actor-trigger-configuration.js');
      ActorTriggerConfiguration.showActorDialog(challengeActor);
    });
    const toggle = page.locator('input[name="classFeatures.combatChallenge"]');
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole('heading', { name: 'Class Features', exact: true })).toBeVisible();
    await toggle.check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => page.evaluate(() => challengeActor.getFlag('banter-4e-modifications','trigger-prompts').classFeatures.combatChallenge)).toBe(true);

    // Tracer: the real system attack dialog, native hook and roll message (not a seeded result).
    await page.evaluate(async () => {
      const world = challengeWorld;
      const item = challengeActor.itemTypes.power[0];
      await item.update({ 'system.weaponUse': 'none', 'system.weaponType': 'none', 'system.rangeType': 'range',
        'system.rangePower': '5', 'system.attack.formula': '-100' });
      world.get('fighter').token.object.control({releaseOthers:true});
      for (const key of ['enemy','neutral','friend']) { world.get(key).token.object.setTarget(true,{releaseOthers:false}); }
      window.challengeRng = CONFIG.Dice.randomUniform;
      CONFIG.Dice.randomUniform = () => 0.45;
      window.challengeNative = item.rollAttack();
    });
    await expect(page.locator('form.application.roll-dialogue')).toBeVisible();
    await page.evaluate(() => { const form = document.querySelector('form.application.roll-dialogue'); delete form.__playwright_target__; });
    await page.locator('form.application.roll-dialogue button[data-action="normal"]').click();
    await expect.poll(() => page.evaluate(() => ['enemy','neutral'].every(key => challengeWorld.get(key).actor.system.marker === challengeActor.uuid))).toBe(true);
    expect(await page.evaluate(() => challengeWorld.get('friend').actor.effects.some(e => e.statuses.has('mark')))).toBe(false);
    await page.evaluate(async () => { await challengeNative; });
    const trace = await page.evaluate(() => challengeWorld.get('enemy').actor.effects.find(e => e.statuses.has('mark')).toObject());
    await testInfo.attach('native-mark-tracer', {body:JSON.stringify(trace,null,2),contentType:'application/json'});
    expect(trace.system.durationType).toBe('endOfUserTurn');
    expect(trace.duration.expiry).toBe('turnEnd');
    expect(trace.start.combatant).toBeTruthy();

    await page.evaluate(async () => {
      // Current turn's end must not expire the mark; next fighter turn's end must.
      await challengeWorld.combat.nextTurn();
    });
    expect(await page.evaluate(() => Boolean(challengeWorld.get('enemy').actor.system.marker))).toBe(true);
    const firstMark = await page.evaluate(() => challengeWorld.get('enemy').actor.effects.find(e=>e.statuses.has('mark')).id);
    await page.evaluate(async () => { await challengeWorld.attack('fighter',['enemy'],{total:1}); });
    await expect.poll(() => page.evaluate(() => challengeWorld.get('enemy').actor.effects.find(e=>e.statuses.has('mark'))?.id)).not.toBe(firstMark);
    expect(await page.evaluate(() => challengeWorld.get('enemy').actor.effects.filter(e=>e.statuses.has('mark')).length)).toBe(1);
    await page.evaluate(async () => {
      for (let i=0;i<3;i++) { await challengeWorld.combat.nextTurn(); }
    });
    expect(await page.evaluate(() => Boolean(challengeWorld.get('enemy').actor.system.marker))).toBe(true);
    await page.evaluate(async () => { await challengeWorld.combat.nextTurn(); });
    await expect.poll(() => page.evaluate(() => ['enemy','neutral'].map(key => ({key,
      marker:challengeWorld.get(key).actor.system.marker,
      marks:challengeWorld.get(key).actor.effects.filter(e=>e.statuses.has('mark')).map(e=>({id:e.id,start:e.start,duration:e.duration})),
    })).filter(entry=>entry.marker||entry.marks.length))).toEqual([]);

    // A seeded message tests only the automation confirmation boundary and removed-target filter.
    await page.evaluate(async () => {
      const world=challengeWorld, rolls=[];
      for(const key of ['enemy','neutral']) {
        const roll=await new Roll('20').evaluate();
        roll.options.multirollData={targetID:world.get(key).token.id,hitstate:'miss',critstate:''}; rolls.push(roll);
      }
      window.challengeMessage=await world.encounterDocuments.createMessage({rolls,
        speaker:{actor:challengeActor.id,token:world.get('fighter').token.id,scene:world.scene.id},
        flags:{'dnd4e-health-display':{attackResults:{sessionId:foundry.utils.randomID(),pending:true,
          sceneId:world.scene.id,casterId:world.get('fighter').token.id,targetIds:[world.get('enemy').token.id]}}}});
    });
    expect(await page.evaluate(() => Boolean(challengeWorld.get('enemy').actor.system.marker))).toBe(false);
    await page.evaluate(async () => { await challengeMessage.update({'flags.dnd4e-health-display.attackResults.pending':false}); });
    await expect.poll(() => page.evaluate(() => challengeWorld.get('enemy').actor.system.marker === challengeActor.uuid)).toBe(true);
    expect(await page.evaluate(() => Boolean(challengeWorld.get('neutral').actor.system.marker))).toBe(false);
    const markId = await page.evaluate(() => challengeWorld.get('enemy').actor.effects.find(e=>e.statuses.has('mark')).id);
    await page.evaluate(async () => { await challengeMessage.update({content:'unrelated update'}); });
    expect(await page.evaluate(() => challengeWorld.get('enemy').actor.effects.find(e=>e.statuses.has('mark')).id)).toBe(markId);

    await page.evaluate(async () => {
      const { ActorTriggerConfiguration } = await import('/modules/banter-4e-modifications/scripts/modules/trigger-prompts/actor-trigger-configuration.js');
      ActorTriggerConfiguration.showActorDialog(challengeActor);
    });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => page.evaluate(() => challengeActor.getFlag('banter-4e-modifications','trigger-prompts').classFeatures.combatChallenge)).toBe(false);
    await page.evaluate(async () => { await challengeWorld.attack('fighter',['neutral']); });
    expect(await page.evaluate(() => Boolean(challengeWorld.get('neutral').actor.system.marker))).toBe(false);

    // A second client proves SocketLib can mark an NPC the attacking player cannot edit.
    const playerContext = await page.context().browser().newContext({baseURL:settings.url});
    try {
      const playerPage = await playerContext.newPage();
      const refs=await page.evaluate(async () => {
        const player=game.users.find(u=>u.name==='Player');
        await challengeActor.update({[`ownership.${player.id}`]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER});
        await challengeActor.setFlag('banter-4e-modifications','trigger-prompts',{classFeatures:{combatChallenge:true}});
        return {scene:challengeWorld.scene.id,caster:challengeWorld.get('fighter').token.id,
          target:challengeWorld.get('neutral').token.id,actor:challengeActor.id};
      });
      await openTestWorld(playerPage, settings.playerName);
      const playerMessageId = await playerPage.evaluate(async refs => {
        const roll=await new Roll('20').evaluate();
        roll.options.multirollData={targetID:refs.target,hitstate:'miss',critstate:''};
        const message = await ChatMessage.create({rolls:[roll],speaker:{scene:refs.scene,actor:refs.actor,token:refs.caster},
          flags:{'dnd4e-health-display':{attackResults:{sessionId:foundry.utils.randomID(),pending:false,
            sceneId:refs.scene,casterId:refs.caster,targetIds:[refs.target]}}}});
        return message.id;
      },refs);
      await page.evaluate(id => { window.challengePlayerMessageId=id; },playerMessageId);
      await expect.poll(() => page.evaluate(() => challengeWorld.get('neutral').actor.system.marker === challengeActor.uuid)).toBe(true);
      await playerPage.evaluate(async () => { await game.logOut(); });
    } finally {
      await playerContext.close();
    }
  } finally {
    await page.evaluate(async () => {
      if(window.challengeRng) { CONFIG.Dice.randomUniform=challengeRng; }
      for(const token of [...game.user.targets]) { token.setTarget(false,{releaseOthers:false}); }
      if (window.challengePlayerMessageId) { await game.messages.get(challengePlayerMessageId)?.delete({notify:false}); }
      await window.challengeWorld?.close();
      const before=new Set(window.challengeOriginalMessages);
      for(const message of game.messages.filter(m=>!before.has(m.id)&&m.author?.id===game.user.id)) { await message.delete({notify:false}); }
    });
    await testInfo.attach('browser-errors',{body:JSON.stringify(errors),contentType:'application/json'});
    expect(errors).toEqual([]);
    expect(await page.evaluate(counts)).toEqual(before);
  }
});
