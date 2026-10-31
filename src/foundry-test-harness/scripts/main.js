import { assertTestWorld, FOLDER_NAME, MODULE_ID, TestDocuments } from "./fixtures.js";

const suiteModules = ["banter-4e-modifications", "dnd4e-health-display"];
const batchKeys = ["foundry-test-harness.runtime"];
let running = false;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "testWorldId", {
    name: "Test world ID",
    hint: "Development only. Enter this world's exact ID to permit fixture creation and deletion. Leave empty in campaign worlds. Requires reload.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: true,
  });
});

Hooks.once("ready", () => {
  const api = { batchKeys, run, ready: false, initializationError: null };
  game.modules.get(MODULE_ID).api = api;
  void registerSuites(api).catch(error => {
    api.initializationError = error.message;
    console.error(`${MODULE_ID} | Could not load integration tests`, error);
    ui.notifications.error(`Integration tests: ${error.message}`);
  });
});

/** Load tests only on the opted-in GM client; normal modules never import test code. */
async function registerSuites(api) {
  if (!game.user.isGM || game.settings.get(MODULE_ID, "testWorldId") !== game.world.id) {
    return;
  }
  assertTestWorld();
  const quench = globalThis.quench;
  if (!quench?.registerBatch || !quench?.runBatches) {
    throw new Error("Quench is unavailable. Enable Quench and reload the world.");
  }
  quench.registerBatch(batchKeys[0], ({ describe, it, assert, afterEach }) => {
    describe("Fixture folders", function () {
      let fixtures;
      afterEach(async function () {
        await fixtures?.cleanup();
        fixtures = null;
      });
      it("places created actors in one top-level INTEGRATION TESTS folder", async function () {
        fixtures = new TestDocuments();
        const [first, second] = await Promise.all([fixtures.createActor(), fixtures.createActor()]);
        const folders = game.folders.filter(folder => folder.type === "Actor" && folder.name === FOLDER_NAME);
        assert.lengthOf(folders, 1, "exactly one Actor folder");
        assert.isFalse(Boolean(folders[0].folder), "folder is top-level");
        assert.equal(first.folder?.id, folders[0].id);
        assert.equal(second.folder?.id, folders[0].id);
      });
      it("keeps the folder after fixture cleanup", async function () {
        fixtures = new TestDocuments();
        const actor = await fixtures.createActor();
        const folderId = actor.folder.id;
        await fixtures.cleanup();
        assert.isUndefined(game.actors.get(actor.id));
        assert.exists(game.folders.get(folderId));
      });
    });
    describe("Pinned Foundry runtime", function () {
      it("runs on Foundry 14 and DnD4e 0.9.3 as the active GM", function () {
        assertTestWorld();
        assert.equal(Number(game.release.generation), 14);
        assert.equal(game.system.version, "0.9.3");
      });
      it("has both modules and SocketLib enabled", function () {
        for (const id of [...suiteModules, "socketlib"]) {
          assert.isTrue(game.modules.get(id)?.active, `${id} must be enabled`);
        }
      });
    });
  }, { displayName: "FOUNDRY TESTS: Runtime prerequisites", preSelected: false });

  for (const id of suiteModules) {
    if (!game.modules.get(id)?.active) {
      throw new Error(`Enable ${id} in the test world before loading its suites.`);
    }
    const url = new URL(`../../${id}/test-foundry/register.js`, import.meta.url);
    const suite = await import(url.href);
    batchKeys.push(...suite.registerTests(quench, { assertTestWorld, TestDocuments }));
  }
  api.ready = true;
  console.info(`${MODULE_ID} | Registered ${batchKeys.length} Quench batches for ${game.world.id}`);
}

/**
 * Run only this harness's explicit batches and resolve on Quench's report event.
 * runBatches resolves when the runner starts, so awaiting it alone does not await tests.
 */
async function run() {
  assertTestWorld();
  const api = game.modules.get(MODULE_ID).api;
  // Quench 0.10.0 exposes no public busy getter; guard its current runner as well as ours.
  if (!api.ready || running || globalThis.quench?._currentRunner) {
    throw new Error("The test harness is not ready, or a Quench run is already active.");
  }
  running = true;
  try {
    // Quench 0.10.0's reporter queries its UI during run start, even for API runs.
    await globalThis.quench.app.render({ force: true });
    const report = await new Promise((resolve, reject) => {
      const hook = Hooks.once("quenchReports", reports => {
        try {
          resolve(JSON.parse(reports.json));
        } catch (error) {
          reject(error);
        }
      });
      Promise.resolve(globalThis.quench.runBatches([...batchKeys])).catch(error => {
        Hooks.off("quenchReports", hook);
        reject(error);
      });
    });
    return {
      environment: {
        worldId: game.world.id,
        foundry: game.version,
        system: game.system.version,
        modules: Object.fromEntries([...suiteModules, "quench", MODULE_ID].map(id => [id, game.modules.get(id)?.version])),
      },
      batchKeys: [...batchKeys],
      report,
    };
  } finally {
    running = false;
  }
}
