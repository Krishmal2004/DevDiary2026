const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  git,
  findBaseRef,
  parseMergeTree,
  parseConflictMarkers,
  locateRegion,
  estimateOursLines,
  predictConflicts,
} = require("../../src/conflicts/git");

test("parseConflictMarkers reads both sides of each block", () => {
  const text = [
    "a",
    "<<<<<<< ours",
    "mine 1",
    "mine 2",
    "=======",
    "theirs",
    ">>>>>>> theirs",
    "b",
    "<<<<<<< ours",
    "||||||| base",
    "old",
    "=======",
    "new",
    ">>>>>>> theirs",
  ].join("\n");
  assert.deepEqual(parseConflictMarkers(text), [
    { mergedLine: 1, ours: ["mine 1", "mine 2"], theirs: ["theirs"] },
    { mergedLine: 8, ours: [], theirs: ["new"] },
  ]);
  assert.deepEqual(parseConflictMarkers("no conflicts\nhere"), []);
});

test("locateRegion finds the staged lines nearest the estimate", () => {
  const lines = ["x", "dup", "y", "z", "dup", "w"];
  assert.deepEqual(locateRegion(lines, { ours: ["dup"] }, 4), { start: 4, end: 4 });
  assert.deepEqual(locateRegion(lines, { ours: ["dup"] }, 0), { start: 1, end: 1 });
  assert.deepEqual(locateRegion(lines, { ours: ["y", "z"] }, 0), { start: 2, end: 3 });
  // Deleted lines anchor on the line before; unknown text falls back to the estimate.
  assert.deepEqual(locateRegion(lines, { ours: [] }, 3), { start: 2, end: 2 });
  assert.deepEqual(locateRegion(lines, { ours: ["gone"] }, 9), { start: 5, end: 5 });
});

test("estimateOursLines discounts earlier blocks", () => {
  const regions = [
    { mergedLine: 2, ours: ["a"], theirs: ["b", "c"] },
    { mergedLine: 10, ours: ["d"], theirs: ["e"] },
  ];
  assert.deepEqual(estimateOursLines(regions), [2, 5]);
});

test("parseMergeTree splits the -z output", () => {
  const out =
    "TREE\0" +
    "100644 aaa 1\tsrc/a.js\x00100644 bbb 2\tsrc/a.js\x00100644 ccc 3\tsrc/a.js\0\0" +
    "1\0src/a.js\0Auto-merging\0Auto-merging src/a.js\n\0" +
    "1\0src/a.js\0CONFLICT (contents)\0CONFLICT (content): Merge conflict in src/a.js\n\0";
  assert.deepEqual(parseMergeTree(out), {
    tree: "TREE",
    paths: ["src/a.js"],
    messages: [
      { paths: ["src/a.js"], type: "Auto-merging", text: "Auto-merging src/a.js" },
      { paths: ["src/a.js"], type: "CONFLICT (contents)", text: "CONFLICT (content): Merge conflict in src/a.js" },
    ],
  });
});

// End to end against a real repository: main and a feature branch both edit
// the same lines; the feature branch's edit is only staged, not committed.
let dir;
const run = (...args) => git(dir, args);
const write = (name, lines) => fs.writeFileSync(path.join(dir, name), lines.join("\n") + "\n");

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "devdiary-conflicts-"));
  await run("init", "-q", "-b", "main");
  await run("config", "user.email", "test@example.com");
  await run("config", "user.name", "Test");
  await run("config", "core.autocrlf", "false");
  write("app.js", ["one", "two", "three", "four", "five"]);
  write("notes.txt", ["keep"]);
  write("other.txt", ["untouched"]);
  await run("add", ".");
  await run("commit", "-q", "-m", "base");
  await run("branch", "feature");

  write("app.js", ["one", "two (main)", "three", "four", "five", "six"]);
  await run("rm", "-q", "notes.txt");
  await run("add", ".");
  await run("commit", "-q", "-m", "main changes");

  await run("checkout", "-q", "feature");
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("findBaseRef falls back to main without a remote", async () => {
  assert.equal(await findBaseRef(dir, ""), "main");
  await assert.rejects(findBaseRef(dir, "nope"), /doesn't exist/);
});

test("nothing staged that clashes means no conflicts", async () => {
  write("other.txt", ["changed on feature"]);
  await run("add", "other.txt");
  const result = await predictConflicts(dir, "main");
  assert.equal(result.baseRef, "main");
  assert.deepEqual(result.files, []);
});

test("staged edits to the same lines are reported with their lines", async () => {
  write("app.js", ["header", "one", "two (feature)", "three", "four", "five"]);
  write("notes.txt", ["keep", "and more"]);
  await run("add", ".");
  const head = (await run("rev-parse", "HEAD")).stdout;
  const status = (await run("status", "--porcelain")).stdout;

  const result = await predictConflicts(dir, "main");
  const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
  assert.deepEqual(Object.keys(byPath).sort(), ["app.js", "notes.txt"]);

  const app = byPath["app.js"];
  assert.equal(app.regions.length, 1);
  assert.deepEqual(app.regions[0].ours, ["two (feature)"]);
  assert.deepEqual(app.regions[0].theirs, ["two (main)"]);
  const lines = fs.readFileSync(path.join(dir, "app.js"), "utf8").split("\n");
  const estimates = estimateOursLines(app.regions);
  assert.deepEqual(locateRegion(lines, app.regions[0], estimates[0]), { start: 2, end: 2 });

  // Deleted on main, modified here: a whole-file conflict with git's reason.
  const notes = byPath["notes.txt"];
  assert.deepEqual(notes.regions, []);
  assert.match(notes.messages.join("\n"), /modify\/delete/);
  assert.match(notes.messages.join("\n"), /your staged changes/);

  // The check leaves the repository exactly as it was.
  assert.equal((await run("rev-parse", "HEAD")).stdout, head);
  assert.equal((await run("status", "--porcelain")).stdout, status);
});
