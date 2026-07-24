const { readFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_BASE_URL } = require("./constants");

function createImaClient({
  clientId,
  apiKey,
  fetchImpl = globalThis.fetch,
  readCredentialFile = readFile,
  skillVersion = "ima-officebook-workflow",
} = {}) {
  return {
    async request(apiPath, body = {}) {
      if (typeof fetchImpl !== "function") {
        throw new Error("fetch is not available; Node.js 20+ is required");
      }
      const credentials = await resolveCredentials({ clientId, apiKey, readCredentialFile });
      const response = await fetchImpl(`${DEFAULT_BASE_URL}/${apiPath}`, {
        method: "POST",
        headers: {
          "ima-openapi-clientid": credentials.clientId,
          "ima-openapi-apikey": credentials.apiKey,
          "ima-openapi-ctx": `skill_version=${skillVersion}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body || {}),
      });
      const text = await response.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`IMA returned non-JSON response: ${text.slice(0, 200)}`);
      }
      if (!response.ok) {
        throw new Error(parsed.msg || parsed.message || `IMA request failed with HTTP ${response.status}`);
      }
      return parsed;
    },
  };
}

async function resolveCredentials({ clientId, apiKey, readCredentialFile = readFile } = {}) {
  const resolvedClientId =
    clientId ||
    process.env.IMA_OPENAPI_CLIENTID ||
    process.env.IMA_CLIENT_ID ||
    await readOptionalCredential(path.join(os.homedir(), ".config", "ima", "client_id"), readCredentialFile);
  const resolvedApiKey =
    apiKey ||
    process.env.IMA_OPENAPI_APIKEY ||
    process.env.IMA_API_KEY ||
    await readOptionalCredential(path.join(os.homedir(), ".config", "ima", "api_key"), readCredentialFile);

  if (!resolvedClientId || !resolvedApiKey) {
    throw new Error("缺少 IMA Client ID 或 API Key");
  }
  return {
    clientId: String(resolvedClientId).trim(),
    apiKey: String(resolvedApiKey).trim(),
  };
}

async function readOptionalCredential(filePath, readCredentialFile) {
  try {
    return String(await readCredentialFile(filePath, "utf8")).trim();
  } catch {
    return "";
  }
}

module.exports = {
  createImaClient,
  resolveCredentials,
};
