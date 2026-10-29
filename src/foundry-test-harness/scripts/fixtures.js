export const MODULE_ID = "foundry-test-harness";

/**
 * Refuse persisted test mutations outside the explicitly opted-in world and active GM.
 * Recheck before each creation so changing worlds or settings cannot reuse an old fixture.
 */
export function assertTestWorld() {
  if (!game.ready || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
    throw new Error("Integration tests require a ready DnD4e 0.9.3 world.");
  }
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) {
    throw new Error("Run integration tests as the active GM, with other GM sessions logged out.");
  }
  if (game.settings.get(MODULE_ID, "testWorldId") !== game.world.id) {
    throw new Error("Set the harness Test world ID setting to this world's exact ID before running tests.");
  }
}

/**
 * Track only documents created by this fixture; delete them in reverse order after each test.
 * Embedded documents are removed with their parent. Cleanup failures fail the test run.
 */
export class TestDocuments {
  documents = [];
  runId = foundry.utils.randomID();

  /** Create a deterministic NPC or PC, optionally owned by the test player. */
  async createActor({ type = "NPC", ownerId, items = [], effects = [] } = {}) {
    assertTestWorld();
    const actor = await Actor.create({
      name: `[Integration test ${this.runId}] NPC`,
      type,
      items,
      effects,
      ownership: ownerId ? { [ownerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } : {},
      flags: {
        [MODULE_ID]: { runId: this.runId },
        // Drac's updateActor hook starts detached status writes. These HP/schema fixtures
        // use its per-actor opt-out so those writes cannot race fixture deletion.
        dracsTools: { autoBloodied: { ignore: true } },
      },
      system: {
        attributes: { hp: { value: 40, max: 40, autototal: false }, temphp: { value: 5 } },
        details: { level: 1 },
      },
    }, { renderSheet: false });
    if (!actor) {
      throw new Error("Actor creation was prevented by a hook.");
    }
    this.documents.push(actor);
    return actor;
  }

  /** Create a linked token on the viewed test scene; track it independently for cleanup. */
  async createToken(actor, x = 100) {
    assertTestWorld();
    if (!canvas.ready || !canvas.scene) {
      throw new Error("View a scene in the test world before running Active Defense tests.");
    }
    const source = await actor.getTokenDocument({ x, y: 100, actorLink: true,
      flags: { [MODULE_ID]: { runId: this.runId } } });
    const [token] = await canvas.scene.createEmbeddedDocuments("Token", [source.toObject()]);
    this.documents.push(token);
    return token;
  }

  /** Create a tracked chat message, retaining the run marker through module interception. */
  async createMessage(data) {
    assertTestWorld();
    const message = await ChatMessage.create({ ...data,
      flags: { ...data.flags, [MODULE_ID]: { runId: this.runId } } }, { notify: false });
    if (!message) {
      throw new Error("The test attack message was unexpectedly cancelled.");
    }
    this.documents.push(message);
    return message;
  }

  /** Remove owned fixtures without searching or deleting unrelated world documents. */
  async cleanup() {
    const failures = [];
    for (const document of [...this.documents].reverse()) {
      try {
        assertTestWorld();
        if (document.getFlag(MODULE_ID, "runId") !== this.runId) {
          throw new Error(`Fixture ownership changed: ${document.uuid}`);
        }
        await document.delete();
        this.documents.splice(this.documents.indexOf(document), 1);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) {
      throw new AggregateError(failures, `Could not remove ${failures.length} test fixture(s): ${failures.map(error => error.message).join("; ")}`);
    }
  }
}
