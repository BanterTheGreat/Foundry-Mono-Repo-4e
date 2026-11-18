import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const book = path.join(repo, "src/modern4e");

/** Collect files recursively without depending on the shell. */
function files(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return files(filename, extension);
    }
    return filename.endsWith(extension) ? [filename] : [];
  });
}

const catalog = new Map(files(path.join(book, "content/feats"), ".json").map((filename) => [
  filename, JSON.parse(readFileSync(filename, "utf8")).feats,
]));
const definitions = new Map([...catalog.values()].flat().filter(feat => feat.id).map(feat => [feat.id, feat]));

test("feat catalog has complete prose entries and explicit prerequisites", () => {
  for (const [filename, feats] of catalog) {
    assert.ok(Array.isArray(feats), filename);
    for (const placement of feats) {
      const feat = placement.ref ? definitions.get(placement.ref) : placement;
      assert.ok(feat, `${filename}: unresolved reference ${placement.ref}`);
      for (const key of ["title", "description"]) {
        assert.equal(typeof feat[key], "string", `${filename}: ${key}`);
        assert.ok(feat[key].trim(), `${filename}: ${key}`);
      }
      assert.equal(typeof feat.id, "string", filename);
      assert.equal(typeof feat.access?.type, "string", filename);
      assert.equal(typeof feat.prerequisites?.type, "string", filename);
      assert.ok(!Object.hasOwn(feat, "requirements"), filename);
      assert.ok(Object.hasOwn(feat.selection, "maximum"), filename);
      assert.ok(Array.isArray(feat.selection.constraints), filename);
    }
  }
});

test("rulebook renders every JSON feat exactly once, including split sections", () => {
  const uses = new Map([...catalog].map(([filename, feats]) => [filename, feats.map(() => 0)]));
  const pages = [
    ...files(path.join(book, "classes"), ".typ"),
    ...files(path.join(book, "ancestries"), ".typ"),
    path.join(book, "glossary/feats.typ"),
  ];
  for (const filename of pages) {
    const source = readFileSync(filename, "utf8");
    assert.doesNotMatch(source, /theme\.featBlock\(/, filename);
    if (filename.endsWith("glossary/feats.typ")) {
      assert.doesNotMatch(source, /theme\.choiceBox\(/, filename);
    }
    const pattern = /theme\.feat(?:Cards|Blocks|Choices)FromJson\("([^"]+)"(?:, start: (\d+)(?:, end: (\d+))?)?\)/g;
    for (const match of source.matchAll(pattern)) {
      const target = path.resolve(path.dirname(filename), match[1]);
      const counts = uses.get(target);
      assert.ok(counts, `${filename}: missing ${match[1]}`);
      const start = Number(match[2] ?? 0);
      const end = Number(match[3] ?? counts.length);
      assert.ok(start >= 0 && start < end && end <= counts.length, `${filename}: invalid range`);
      for (let i = start; i < end; i++) {
        counts[i]++;
      }
    }
  }
  for (const [filename, counts] of uses) {
    assert.ok(counts.every((count) => count === 1), `${filename}: missing or repeated entries`);
  }
});

const typst = process.env.TYPST_BIN || "typst";
const hasTypst = spawnSync(typst, ["--version"]).status === 0;
test("Typst feat renderer preserves formatting, literal text, ranges and multiclass requirements", { skip: !hasTypst }, () => {
  const output = execFileSync(typst, [
    "query", "--root", repo,
    path.join(repo, "scripts/test/fixtures/modern4e-feats.typ"), "metadata",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const [{ value }] = JSON.parse(output);
  assert.match(value.formatted, /strong\(body: \[Bold\]\)/);
  assert.match(value.formatted, /emph\(body: \[italic\]\)/);
  assert.match(value.formatted, /parbreak\(\)/);
  assert.match(value.formatted, /list\(/);
  assert.match(value.formatted, /#panic\("literal"\) 1\[W\]/);
  assert.match(value.trailingList, /item\(body: \[One\]\)/);
  assert.match(value.trailingList, /item\(body: \[Two\]\)/);
  assert.match(value.range, /Lucky Shot/);
  assert.doesNotMatch(value.range, /Student of the Cosmos|Unlucky Teleport/);
  assert.match(value.multiclass, /NOVICE POWER/);
  assert.match(value.multiclass, /3rd level, Any class-specific multiclass feat, Any encounter power with a level/);
});
