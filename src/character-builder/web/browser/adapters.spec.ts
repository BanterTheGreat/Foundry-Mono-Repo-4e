import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/browser/harness.html");
  await page.waitForFunction(() => "IndexedDbCharacterStore" in window);
});

test("store behavioral contract: CRUD, detached snapshots, collisions, compare/recovery, retention", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    const store = new w.IndexedDbCharacterStore("contract");
    const doc = w.fixture;
    const value = async (op: string, payload?: unknown) => {
      const input = payload as any;
      const result = op === "save"
        ? await store.save(input.document, input.mode, input.expected)
        : await store[op](payload);
      if (result.type !== "available") {
        throw new Error(JSON.stringify(result));
      }
      return result.value;
    };
    const empty = await value("list");
    await value("save", { document: doc, mode: "CREATE" });
    const duplicate = await store.operation("save", { document: doc, mode: "CREATE" });
    const loaded = await value("load", doc.id);
    loaded.identity.name = "Detached edit";
    const detached = await value("load", doc.id);
    const edited = { ...doc, identity: { ...doc.identity, name: "Edited" } };
    const receipt = await value("save", { document: edited, mode: "REPLACE_WITH_RECOVERY", expected: doc });
    const stale = await store.operation("save", { document: doc, mode: "REPLACE_WITH_RECOVERY", expected: doc });
    const missingExpected = await store.operation("save", { document: doc, mode: "REPLACE_WITH_RECOVERY" });
    const recoveries = await value("listRecovery", doc.id);
    const recovered = await value("loadRecovery", receipt.recoveryId);
    const live = await value("list");
    const deleted = await value("delete", doc.id);
    const deletedAgain = await value("delete", doc.id);
    const retained = await value("loadRecovery", receipt.recoveryId);
    const missing = await store.operation("load", doc.id);
    return { empty, duplicate, detached, stale, missingExpected, recoveries, recovered, live, deleted, deletedAgain, retained, missing, doc };
  });
  expect(result.empty).toEqual([]);
  expect(result.duplicate.diagnostics[0].code).toBe("store.exists");
  expect(result.detached).toEqual(result.doc);
  expect(result.stale.diagnostics[0].code).toBe("store.conflict");
  expect(result.missingExpected.diagnostics[0].code).toBe("store.conflict");
  expect(result.recoveries).toHaveLength(1);
  expect(result.recovered).toEqual(result.doc);
  expect(result.retained).toEqual(result.doc);
  expect(result.live).toHaveLength(1);
  expect(result.deleted).toBe(true);
  expect(result.deletedAgain).toBe(false);
  expect(result.missing.type).toBe("unavailable");
});

test("committed save persists across a browser reload", async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    const saved = await new w.IndexedDbCharacterStore("reload").operation("save", { document: w.fixture, mode: "CREATE" });
    if (saved.type !== "available") {
      throw new Error(JSON.stringify(saved));
    }
    const store = new w.IndexedDbCharacterStore("reload");
    await store.operation("save", { document: { ...w.fixture, identity: { ...w.fixture.identity, name: "Reloaded" } }, mode: "REPLACE_WITH_RECOVERY", expected: w.fixture });
  });
  await page.reload();
  await page.waitForFunction(() => "IndexedDbCharacterStore" in window);
  expect(await page.evaluate(async () => {
    const w = window as any;
    return (await new w.IndexedDbCharacterStore("reload").operation("load", w.fixture.id)).value;
  })).toMatchObject({ identity: { name: "Reloaded" } });
  expect(await page.evaluate(async () => {
    const w = window as any;
    const store = new w.IndexedDbCharacterStore("reload");
    const copies = await store.operation("listRecovery", w.fixture.id);
    return (await store.operation("loadRecovery", copies.value[0].recoveryId)).value;
  })).toMatchObject({ identity: { name: "Ada" } });
});

test("quota and aborted database writes never report success and roll back recovery and live save", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    const store = new w.IndexedDbCharacterStore("failures");
    const doc = w.fixture;
    await store.operation("save", { document: doc, mode: "CREATE" });
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException("Disk full", "QuotaExceededError"); };
    const quota = await store.operation("save", { document: { ...doc, identity: { ...doc.identity, name: "Unsaved" } }, mode: "REPLACE_WITH_RECOVERY", expected: doc });
    IDBObjectStore.prototype.put = function (...args: any[]) {
      const request = put.apply(this, args as [any]);
      this.transaction.abort();
      return request;
    };
    const aborted = await store.operation("save", { document: { ...doc, identity: { ...doc.identity, name: "Aborted" } }, mode: "REPLACE_WITH_RECOVERY", expected: doc });
    IDBObjectStore.prototype.put = put;
    const failedFactory = { open() { throw new DOMException("Access denied", "SecurityError"); } };
    const database = await new w.IndexedDbCharacterStore("denied", failedFactory).operation("list");
    return { quota, aborted, database, live: await store.operation("load", doc.id), backups: await store.operation("listRecovery", doc.id), doc };
  });
  expect(result.quota.diagnostics[0].code).toBe("store.quota");
  expect(result.aborted.type).toBe("unavailable");
  expect(result.database.diagnostics[0].code).toBe("store.database");
  expect(result.live.value).toEqual(result.doc);
  expect(result.backups.value).toEqual([]);
});

test("shared importer handles malformed input, collision, copy, stale preview and recovery restoration", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    const store = new w.IndexedDbCharacterStore("imports");
    const importer = new w.WebCharacterImporter(store.call, () => "copy-id");
    const parse = async (p: Promise<string>) => JSON.parse(await p);
    const malformed = await parse(importer.inspect("{"));
    const empty = await store.operation("list");
    const first = await parse(importer.inspect(JSON.stringify(w.fixture)));
    await parse(importer.commit(first.value.token, "IMPORT"));
    const edited = { ...w.fixture, identity: { ...w.fixture.identity, name: "Incoming" } };
    const preview = await parse(importer.inspect(JSON.stringify(edited)));
    const copy = await parse(importer.commit(preview.value.token, "COPY"));
    const copyDoc = await store.operation("load", "copy-id");
    const collision = await parse(importer.inspect(JSON.stringify(edited)));
    const stale = await parse(importer.inspect(JSON.stringify(edited)));
    const replace = await parse(importer.commit(collision.value.token, "REPLACE"));
    const outdated = await parse(importer.commit(stale.value.token, "REPLACE"));
    const backups = await parse(importer.recoveries(w.fixture.id));
    const restore = await parse(importer.inspectRecovery(replace.value.receipt.recoveryId));
    await parse(importer.commit(restore.value.token, "REPLACE"));
    const restored = await store.operation("load", w.fixture.id);
    const cancelPreview = await parse(importer.inspect(JSON.stringify(edited)));
    const cancel = await parse(importer.commit(cancelPreview.value.token, "CANCEL"));
    return { malformed, empty, preview, copy, copyDoc, outdated, backups, restored, cancel, doc: w.fixture };
  });
  expect(result.malformed.diagnostics[0].kind).toBe("INCOMPATIBLE_FORMAT");
  expect(result.empty.value).toEqual([]);
  expect(result.preview.value.actions).toEqual(["REPLACE", "COPY", "CANCEL"]);
  expect(result.copy.value.receipt.characterId).toBe("copy-id");
  expect(result.copyDoc.value).toEqual({ ...result.doc, id: "copy-id", identity: { ...result.doc.identity, name: "Incoming" } });
  expect(result.outdated.diagnostics[0].code).toBe("store.conflict");
  expect(result.backups.value).toHaveLength(1);
  expect(result.restored.value).toEqual(result.doc);
  expect(result.cancel.value.receipt).toBeNull();
});

test("bundled content uses shared metadata search and lazy chunks; missing assets are distinct failures", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    const requests: string[] = [];
    const source = new w.BundledContentSource(async (...args: Parameters<typeof fetch>) => { requests.push(String(args[0])); return fetch(...args); });
    const catalog = new w.WebContentCatalog(source.call);
    const opened = JSON.parse(await catalog.open("modern4e.classes", "[]"));
    const search = JSON.parse(catalog.search("fighter"));
    const before = [...requests];
    const detail = JSON.parse(await catalog.lookup(search.value[0].metadata.id));
    const after = [...requests];
    const missing = JSON.parse(await source.call("loadChunk", JSON.stringify(["modern4e.classes", "missing"])));
    const broken = new w.BundledContentSource(async () => new Response("Missing", { status: 404 }));
    const failed = JSON.parse(await broken.call("listPackages", "null"));
    return { opened, search, before, detail, after, missing, failed };
  });
  expect(result.opened.type).toBe("available");
  expect(result.search.value.length).toBeGreaterThan(0);
  expect(result.before.some(url => url.includes("entries-"))).toBe(false);
  expect(result.after.length).toBe(result.before.length + 1);
  expect(result.detail.value.supplier.packageId).toBe("modern4e.classes");
  expect(result.missing.diagnostics[0].code).toBe("content.load");
  expect(result.failed.diagnostics[0].code).toBe("content.load");
});

test("file chooser feeds shared importer; download is shared-format round trip; cancellation is separate", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.exchange = new w.BrowserFileExchange();
    w.importer = new w.WebCharacterImporter(new w.IndexedDbCharacterStore("files").call, () => "copy");
  });
  const chooser = page.waitForEvent("filechooser");
  await page.evaluate(() => { const w = window as any; w.pending = w.exchange.inspectSelection(w.importer); });
  await (await chooser).setFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
  expect(await page.evaluate(async () => (window as any).pending)).toMatchObject({ type: "unavailable" });
  const goodChooser = page.waitForEvent("filechooser");
  await page.evaluate(() => { const w = window as any; w.pending = w.exchange.inspectSelection(w.importer); });
  const fixture = await page.evaluate(() => (window as any).fixture);
  await (await goodChooser).setFiles({ name: "hero.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) });
  expect(await page.evaluate(async () => (window as any).pending)).toMatchObject({ type: "available", value: { actions: ["IMPORT", "COPY", "CANCEL"] } });
  const downloadPromise = page.waitForEvent("download");
  expect(await page.evaluate(async () => { const w = window as any; return w.exchange.exportCharacter(w.fixture); })).toMatchObject({ type: "available" });
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(text)).toEqual(fixture);
  expect(await page.evaluate(text => (window as any).decode(text), text)).toMatchObject({ type: "available", value: fixture });
  // Dispatch the native cancel event without needing OS file-dialog control.
  await page.evaluate(() => {
    const w = window as any;
    HTMLInputElement.prototype.click = function () { this.dispatchEvent(new Event("cancel")); };
    w.pending = w.exchange.receive();
  });
  expect(await page.evaluate(async () => (window as any).pending)).toEqual({ type: "available", value: null, diagnostics: [] });
});

test("concurrent creates serialize and failed recovery cannot publish replacement", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    const first = new w.IndexedDbCharacterStore("races");
    const second = new w.IndexedDbCharacterStore("races");
    const input = { document: w.fixture, mode: "CREATE" };
    const raced = await Promise.all([first.operation("save", input), second.operation("save", input)]);
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: any[]) {
      if (this.name === "recovery") {
        throw new DOMException("Recovery write failed", "UnknownError");
      }
      return add.apply(this, args as [any]);
    };
    const failed = await first.operation("save", { document: { ...w.fixture, identity: { ...w.fixture.identity, name: "Lost" } }, mode: "REPLACE_WITH_RECOVERY", expected: w.fixture });
    IDBObjectStore.prototype.add = add;
    return { raced, failed, live: await first.operation("load", w.fixture.id), backups: await first.operation("listRecovery", w.fixture.id), doc: w.fixture };
  });
  expect(result.raced.filter(result => result.type === "available")).toHaveLength(1);
  expect(result.raced.find(result => result.type === "unavailable").diagnostics[0].code).toBe("store.exists");
  expect(result.failed.type).toBe("unavailable");
  expect(result.live.value).toEqual(result.doc);
  expect(result.backups.value).toEqual([]);
});

test("file read and invalid export failures are explicit without downloading", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.evaluate(() => {
    const w = window as any;
    File.prototype.text = async () => { throw new Error("File cannot be read"); };
    w.pending = new w.BrowserFileExchange().receive();
  });
  await (await chooser).setFiles({ name: "unreadable.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  expect(await page.evaluate(async () => (window as any).pending)).toMatchObject({ type: "unavailable", diagnostics: [{ code: "exchange.read" }] });
  const result = await page.evaluate(async () => {
    const w = window as any;
    return new w.BrowserFileExchange().exportCharacter({ ...w.fixture, formatVersion: 99 });
  });
  expect(result).toMatchObject({ type: "unavailable", diagnostics: [{ kind: "INCOMPATIBLE_FORMAT" }] });
});

test("malformed bundled JSON data becomes content failure rather than a rejected promise", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const w = window as any;
    const source = new w.BundledContentSource(async () => new Response(JSON.stringify({ invalid: true })));
    return JSON.parse(await new w.WebContentCatalog(source.call).open("modern4e.classes", "[]"));
  });
  expect(result).toMatchObject({ type: "unavailable", diagnostics: [{ code: "content.load" }] });
});

test("authored grant substitution and Linguist decisions survive browser save and reload", async ({ page }) => {
  const fixture = JSON.parse(await readFile(new URL("../../shared/fixtures/sample-current-fighter-1-base.json", import.meta.url), "utf8"));
  const selected = await page.evaluate(async (initial) => {
    const w = window as any;
    const catalog = new w.WebContentCatalog(new w.BundledContentSource().call);
    const value = async (request: Promise<string>) => {
      const result = JSON.parse(await request);
      if (result.type !== "available") throw new Error(JSON.stringify(result));
      return result.value;
    };
    await value(catalog.open("modern4e.classes", JSON.stringify(initial.packages.filter((p: any) => p.packageId !== "modern4e.classes"))));
    const root = async (entryId: string, instanceId: string, choiceId: string) => {
      const found = await value(catalog.lookup(entryId));
      return { instanceId, slot: { sourceInstanceId: "creation", choiceId, ordinal: 0 }, selection: {
        entryId, savedTitle: found.entry.presentation.title, supplierPackageId: found.supplier.packageId, acknowledgedFingerprint: found.fingerprint,
      } };
    };
    let document = { ...initial, id: "choices-reopen", equipment: [], levels: [{ level: 1, entries: [
      await root("modern4e.class.wizard", "wizard", "class"), await root("modern4e.feat.linguist", "linguist", "feat"),
    ], proficiencies: [] }] };
    let rules = await value(catalog.evaluate(JSON.stringify(document)));
    const grant = rules.choices.find((choice: any) => choice.optional && choice.entries.some((entry: any) => entry.entryId === "modern4e.feat.alchemist"));
    if (!grant) throw new Error("Missing authored Technique Master grant substitution");
    const defaultOccurrence = rules.entries.find((entry: any) => JSON.stringify(entry.slot) === JSON.stringify(grant.slot));
    document = await value(catalog.chooseEntry(JSON.stringify(document), 1, JSON.stringify(grant.slot), "modern4e.feat.alchemist", "caller-instance"));
    for (let ordinal = 0; ordinal < 3; ordinal++) {
      rules = await value(catalog.evaluate(JSON.stringify(document)));
      const choice = rules.choices.find((choice: any) => choice.slot.sourceInstanceId === "linguist" && choice.valueKind === "LANGUAGE" && choice.slot.ordinal === ordinal);
      document = await value(catalog.chooseValue(JSON.stringify(document), 1, JSON.stringify(choice.slot), choice.values[0].id));
    }
    rules = await value(catalog.evaluate(JSON.stringify(document)));
    const skill = rules.choices.find((choice: any) => choice.slot.sourceInstanceId === "linguist" && choice.valueKind === "SKILL_BONUS");
    document = await value(catalog.chooseValue(JSON.stringify(document), 1, JSON.stringify(skill.slot), skill.values[0].id));
    const store = new w.IndexedDbCharacterStore("choices-reopen");
    const saved = await store.save(document, "CREATE");
    if (saved.type !== "available") throw new Error(JSON.stringify(saved));
    return { document, grantSlot: grant.slot, occurrence: defaultOccurrence.instanceId };
  }, fixture);
  await page.reload();
  await page.waitForFunction(() => "IndexedDbCharacterStore" in window);
  const reopened = await page.evaluate(async () => {
    const w = window as any;
    const stored = await new w.IndexedDbCharacterStore("choices-reopen").load("choices-reopen");
    if (stored.type !== "available") throw new Error(JSON.stringify(stored));
    const catalog = new w.WebContentCatalog(new w.BundledContentSource().call);
    await catalog.open("modern4e.classes", JSON.stringify(stored.value.packages.filter((p: any) => p.packageId !== "modern4e.classes")));
    const evaluated = JSON.parse(await catalog.evaluate(JSON.stringify(stored.value)));
    if (evaluated.type !== "available") throw new Error(JSON.stringify(evaluated));
    return { document: stored.value, rules: evaluated.value };
  });
  expect(reopened.document).toEqual(selected.document);
  const grant = reopened.rules.entries.find((entry: any) => entry.instanceId === selected.occurrence);
  expect(grant).toMatchObject({ slot: selected.grantSlot, granted: true, definition: { entry: { id: "modern4e.feat.alchemist" } } });
  expect(reopened.rules.entries.some((entry: any) => entry.definition.entry.id === "modern4e.feat.technique-master")).toBe(false);
  const choices = reopened.document.levels[0].values;
  expect(choices).toHaveLength(4);
  expect(new Set(choices.filter((choice: any) => choice.slot.choiceId.includes("languages")).map((choice: any) => choice.value)).size).toBe(3);
  expect(reopened.rules.diagnostics.some((diagnostic: any) => diagnostic.slot?.sourceInstanceId === "linguist" && diagnostic.kind === "INVALID_SELECTION")).toBe(false);
});
