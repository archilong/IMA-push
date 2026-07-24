const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "data", "config.json");

function createConfigStore(filePath = DEFAULT_CONFIG_PATH) {
  return {
    async read() {
      try {
        return normalizeConfig(JSON.parse(await readFile(filePath, "utf8")));
      } catch (error) {
        if (error.code === "ENOENT") {
          return normalizeConfig({});
        }
        throw error;
      }
    },

    async write(config) {
      const normalized = normalizeConfig(config);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
      return normalized;
    },
  };
}

function normalizeConfig(config = {}) {
  return {
    enabled: config.enabled === true || String(config.enabled).toLowerCase() === "true",
    clientId: String(config.clientId || "").trim(),
    apiKey: String(config.apiKey || "").trim(),
    knowledgeBaseId: String(config.knowledgeBaseId || "").trim(),
    knowledgeBaseName: String(config.knowledgeBaseName || "").trim(),
    knowledgeBaseType: String(config.knowledgeBaseType || "").trim(),
  };
}

function publicConfig(config = {}) {
  const normalized = normalizeConfig(config);
  return {
    enabled: normalized.enabled,
    clientId: normalized.clientId,
    apiKeyConfigured: Boolean(normalized.apiKey),
    knowledgeBaseName: normalized.knowledgeBaseName,
    knowledgeBaseType: normalized.knowledgeBaseType,
    knowledgeBaseReady: Boolean(normalized.knowledgeBaseId),
  };
}

module.exports = {
  createConfigStore,
  normalizeConfig,
  publicConfig,
};
