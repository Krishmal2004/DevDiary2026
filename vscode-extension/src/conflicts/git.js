const { execFile } = require("node:child_process");

// Predicts the merge conflicts your staged changes would have with a base
// branch (normally origin/main), before you commit or open a pull request.
//
// It never touches the working tree, the index or any branch: the staged
// snapshot is written as a throwaway commit object and merged in memory with
// `git merge-tree --write-tree` (git 2.38+). The merged tree contains files
// with conflict markers, which are parsed into line regions.

const GIT_TIMEOUT_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 60 * 1000;
const MAX_BUFFER = 64 * 1024 * 1024;

class GitError extends Error {
  constructor(message, { code, stderr } = {}) {
    super(message);
    this.name = "GitError";
    this.code = code;
    this.stderr = stderr;
  }
}

// Runs git and resolves { stdout, code }. Exit codes listed in `okCodes`
// resolve; anything else rejects with a GitError.
function git(cwd, args, { okCodes = [0], timeout = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", "core.quotepath=off", ...args],
      {
        cwd,
        timeout,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        // Never block on a credential prompt (fetch runs in the background).
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : null) : 0;
        if (okCodes.includes(code)) return resolve({ stdout, code });
        const detail = (stderr || (err && err.message) || "").trim();
        reject(new GitError(`git ${args[0]} failed: ${detail}`, { code, stderr }));
      }
    );
  });
}

async function revParse(cwd, ref) {
  const { stdout, code } = await git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    okCodes: [0, 1],
  });
  return code === 0 ? stdout.trim() : null;
}

async function repoRoot(cwd) {
  const { stdout } = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

async function currentBranch(cwd) {
  const { stdout, code } = await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], { okCodes: [0, 1] });
  return code === 0 ? stdout.trim() : null;
}

// The branch pull requests usually target: the configured one if set,
// otherwise origin's default branch, otherwise main/master.
async function findBaseRef(cwd, configured) {
  const wanted = (configured || "").trim();
  if (wanted) {
    if (await revParse(cwd, wanted)) return wanted;
    throw new GitError(`Base branch "${wanted}" doesn't exist in this repository.`);
  }
  const { stdout, code } = await git(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], {
    okCodes: [0, 1],
  });
  if (code === 0 && stdout.trim()) return stdout.trim();
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    if (await revParse(cwd, ref)) return ref;
  }
  return null;
}

// Updates the remote-tracking ref for a base like "origin/main". Local
// branches need no fetch. Failures (offline, no credentials) are ignored so
// the check still runs against the last fetched state.
async function fetchBase(cwd, baseRef) {
  const { stdout } = await git(cwd, ["remote"]);
  const remotes = stdout.split(/\r?\n/).filter(Boolean);
  const remote = remotes.find((r) => baseRef.startsWith(`${r}/`));
  if (!remote) return false;
  const branch = baseRef.slice(remote.length + 1);
  try {
    await git(cwd, ["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", remote, branch], {
      timeout: FETCH_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

// The tree id of what's staged. Fails while the index has unmerged entries
// (a merge or rebase in progress).
async function stagedTree(cwd) {
  const { stdout } = await git(cwd, ["write-tree"]);
  return stdout.trim();
}

// Splits `git merge-tree --write-tree -z` output into the merged tree id,
// the conflicted paths and the informational messages.
function parseMergeTree(stdout) {
  const fields = stdout.split("\0");
  const tree = fields[0];
  const paths = [];
  let i = 1;
  for (; i < fields.length && fields[i] !== ""; i++) {
    const tab = fields[i].indexOf("\t");
    const path = fields[i].slice(tab + 1);
    if (tab >= 0 && !paths.includes(path)) paths.push(path);
  }
  i++; // the empty field ending the conflicted-file list
  const messages = [];
  while (i < fields.length && fields[i] !== "") {
    const count = Number(fields[i++]);
    if (!Number.isInteger(count)) break;
    const msgPaths = fields.slice(i, i + count);
    i += count;
    const type = fields[i++];
    const text = (fields[i++] || "").trim();
    messages.push({ paths: msgPaths, type, text });
  }
  return { tree, paths, messages };
}

// Finds the conflict blocks in a file merged with markers. Each region gives
// the 0-based line where it starts in the merged file and the lines of both
// sides ("ours" is the staged version, "theirs" the base branch).
function parseConflictMarkers(text) {
  const lines = text.split(/\r?\n/);
  const regions = [];
  let current = null;
  let section = null;
  lines.forEach((line, index) => {
    if (!current && line.startsWith("<<<<<<<")) {
      current = { mergedLine: index, ours: [], theirs: [] };
      section = "ours";
    } else if (current && line.startsWith("|||||||")) {
      section = "base";
    } else if (current && line.startsWith("=======") && section !== "theirs") {
      section = "theirs";
    } else if (current && line.startsWith(">>>>>>>") && section === "theirs") {
      regions.push(current);
      current = null;
      section = null;
    } else if (current && section !== "base") {
      current[section].push(line);
    }
  });
  return regions;
}

// Where a region's staged lines sit in the file you're editing: the
// occurrence of the "ours" lines nearest to where they should be. The merged
// file can be longer or shorter than yours (it also has the base branch's
// clean changes), so the merged position is only an estimate. A region with
// no staged lines (you deleted them) anchors on the line before it.
// Returns { start, end } as 0-based inclusive line numbers.
function locateRegion(fileLines, region, estimate) {
  const ours = region.ours;
  const clamp = (n) => Math.max(0, Math.min(n, Math.max(0, fileLines.length - 1)));
  if (ours.length === 0) {
    const line = clamp(estimate - 1);
    return { start: line, end: line };
  }
  let best = -1;
  for (let i = 0; i + ours.length <= fileLines.length; i++) {
    let match = true;
    for (let j = 0; j < ours.length; j++) {
      if (fileLines[i + j] !== ours[j]) {
        match = false;
        break;
      }
    }
    if (match && (best < 0 || Math.abs(i - estimate) < Math.abs(best - estimate))) best = i;
  }
  if (best < 0) {
    const line = clamp(estimate);
    return { start: line, end: clamp(estimate + ours.length - 1) };
  }
  return { start: best, end: best + ours.length - 1 };
}

// Estimates where each region starts in "our" version of the file: the
// merged line minus the marker lines and "theirs" lines of earlier regions.
function estimateOursLines(regions) {
  let shift = 0;
  return regions.map((r) => {
    const estimate = r.mergedLine - shift;
    // <<<<<<<, =======, >>>>>>> (and ||||||| with its base lines, which the
    // parser drops, so they are only roughly accounted for).
    shift += 3 + r.theirs.length;
    return estimate;
  });
}

// Merges the staged snapshot with `baseRef` in memory. Resolves
// { baseRef, baseCommit, stagedTree, files }, where `files` lists each
// conflicted path with its conflict regions (empty for whole-file conflicts
// like modify/delete or binary files) and git's explanation.
async function predictConflicts(cwd, baseRef) {
  const baseCommit = await revParse(cwd, baseRef);
  if (!baseCommit) throw new GitError(`Base branch "${baseRef}" doesn't exist in this repository.`);
  const head = await revParse(cwd, "HEAD");
  if (!head) throw new GitError("This repository has no commits yet.");
  const tree = await stagedTree(cwd);

  // A dangling commit object; `git gc` removes it later.
  const { stdout: snapshot } = await git(cwd, ["commit-tree", tree, "-p", head, "-m", "DevDiary staged snapshot"]);
  const staged = snapshot.trim();

  const result = await git(
    cwd,
    ["-c", "merge.conflictStyle=merge", "merge-tree", "--write-tree", "-z", "--allow-unrelated-histories", staged, baseCommit],
    { okCodes: [0, 1] }
  );
  const files = [];
  if (result.code === 1) {
    const parsed = parseMergeTree(result.stdout);
    for (const path of parsed.paths) {
      const messages = parsed.messages
        .filter((m) => m.paths.includes(path))
        .map((m) => m.text.split(staged).join("your staged changes").split(baseCommit).join(baseRef));
      let regions = [];
      try {
        const { stdout } = await git(cwd, ["cat-file", "blob", `${parsed.tree}:${path}`]);
        regions = parseConflictMarkers(stdout);
      } catch {
        // Deleted on one side, or not a regular file: a whole-file conflict.
      }
      files.push({ path, regions, messages });
    }
  }
  return { baseRef, baseCommit, stagedTree: tree, files };
}

module.exports = {
  GitError,
  git,
  repoRoot,
  currentBranch,
  findBaseRef,
  fetchBase,
  stagedTree,
  parseMergeTree,
  parseConflictMarkers,
  locateRegion,
  estimateOursLines,
  predictConflicts,
};
