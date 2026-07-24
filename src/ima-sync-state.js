const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const FILE_NAME = "ima-sync-state.json";

function defaultDataDir() {
  return path.join(__dirname, "..", "data");
}

async function readImaSyncState(dataDir = defaultDataDir()) {
  const dir = dataDir || defaultDataDir();
  try {
    return normalizeState(JSON.parse(await readFile(imaSyncStatePath(dir), "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { entries: {} };
    }
    throw error;
  }
}

async function upsertImaSyncEntry(dataDir, entryId, entry) {
  const dir = dataDir || defaultDataDir();
  const state = await readImaSyncState(dir);
  state.entries[String(entryId || "").trim()] = normalizeEntry(entry);
  await mkdir(dir, { recursive: true });
  await writeFile(imaSyncStatePath(dir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

function normalizeState(state = {}) {
  const entries = {};
  for (const [key, value] of Object.entries(state.entries || {})) {
    const normalizedKey = String(key || "").trim();
    if (normalizedKey) {
      entries[normalizedKey] = normalizeEntry(value);
    }
  }
  return { entries };
}

function normalizeEntry(entry = {}) {
  return {
    versionKey: String(entry.versionKey || "").trim(),
    noteId: String(entry.noteId || "").trim(),
    mediaId: String(entry.mediaId || "").trim(),
    knowledgeBaseId: String(entry.knowledgeBaseId || "").trim(),
    pushedAt: String(entry.pushedAt || "").trim(),
    title: String(entry.title || "").trim(),
  };
}

function imaSyncStatePath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

module.exports = {
  imaSyncStatePath,
  readImaSyncState,
  upsertImaSyncEntry,
};
