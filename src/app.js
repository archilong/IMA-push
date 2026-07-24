const fs = require("node:fs");
const path = require("node:path");

const { createConfigStore, normalizeConfig, publicConfig } = require("./config-store");
const { renderWorkflowPage } = require("./html-page");
const { createImaClient } = require("./ima-client");
const { createWorkflowPusher } = require("./workflow");

function createApp({
  configStore = createConfigStore(),
  client,
  createClient = createImaClient,
  dataDir,
} = {}) {
  const webhookLogDir = dataDir || path.join(__dirname, "..", "data");

  async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/") {
        const config = await configStore.read();
        return sendHtml(res, renderWorkflowPage({ config }));
      }
      if (req.method === "GET" && url.pathname === "/api/config") {
        const config = await configStore.read();
        return sendJson(res, 200, { ok: true, config: publicConfig(config) });
      }
      if (req.method === "POST" && url.pathname === "/api/config") {
        const body = await readJsonBody(req);
        const current = normalizeConfig(await configStore.read());
        const next = await configStore.write({
          ...current,
          enabled: body.enabled === true,
          clientId: body.clientId ?? current.clientId,
          apiKey: body.apiKey ? body.apiKey : current.apiKey,
        });
        return sendJson(res, 200, { ok: true, config: publicConfig(next) });
      }
      if (req.method === "POST" && url.pathname === "/api/initialize") {
        const pusher = createWorkflowPusher({ configStore, client, createClient, dataDir });
        const knowledgeBase = await pusher.initialize();
        return sendJson(res, 200, {
          ok: true,
          knowledgeBase: {
            name: knowledgeBase.name,
            type: knowledgeBase.type,
            created: knowledgeBase.created,
          },
        });
      }
      if (isWebhookConnectivityMethod(req.method) && url.pathname === "/webhook") {
        await appendWebhookAccessLog(webhookLogDir, req, url, 200, "connectivity_method");
        return sendOfficebookSuccess(res);
      }
      if (req.method === "POST" && url.pathname === "/webhook") {
        const rawBody = await readRawBody(req);
        const parsed = parseJsonBody(rawBody);
        if (!parsed.ok || isEmptyObject(parsed.value) || !isLikelyOfficebookPayload(parsed.value)) {
          await appendWebhookAccessLog(webhookLogDir, req, url, 200, parsed.ok ? "connectivity_payload" : "non_json_payload", rawBody);
          return sendOfficebookSuccess(res);
        }
        const pusher = createWorkflowPusher({ configStore, client, createClient, dataDir });
        try {
          await pusher.push(parsed.value);
          await appendWebhookAccessLog(webhookLogDir, req, url, 200, "pushed", rawBody);
          return sendOfficebookSuccess(res);
        } catch (error) {
          await appendWebhookAccessLog(webhookLogDir, req, url, error.statusCode || 500, "push_failed", rawBody, error);
          throw error;
        }
      }
      return sendJson(res, 404, { ok: false, error: "not_found" });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, {
        ok: false,
        error: error.message || "internal_error",
      });
    }
  }

  handler.inject = async function inject({ method = "GET", url = "/", body } = {}) {
    const chunks = [];
    const req = {
      method,
      url,
      on(event, callback) {
        if (event === "data" && typeof body !== "undefined") {
          callback(Buffer.from(JSON.stringify(body), "utf8"));
        }
        if (event === "end") {
          callback();
        }
        return this;
      },
    };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers || {};
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
    };
    await handler(req, res);
    const responseBody = Buffer.concat(chunks).toString("utf8");
    let json = null;
    try {
      json = responseBody ? JSON.parse(responseBody) : null;
    } catch {
      json = null;
    }
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: responseBody,
      json,
    };
  };

  return handler;
}

function readJsonBody(req) {
  return readRawBody(req).then((raw) => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      error.statusCode = 400;
      throw error;
    }
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", reject);
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function parseJsonBody(raw) {
  try {
    return { ok: true, value: raw ? JSON.parse(raw) : {} };
  } catch (error) {
    return { ok: false, error };
  }
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
  });
  res.end(html);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function sendOfficebookSuccess(res) {
  return sendJson(res, 200, { code: 0, message: "success" });
}

function isWebhookConnectivityMethod(method) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isEmptyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

function isLikelyOfficebookPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const data = value.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  return Boolean(
    data.metadata ||
    data.summary ||
    data.aiNote ||
    data.insight ||
    data.page ||
    data.asr
  );
}

async function appendWebhookAccessLog(logDir, req, url, statusCode, action, rawBody = "", error = null) {
  const logPath = path.join(logDir, "webhook-access.log");
  const headers = req.headers || {};
  const record = {
    time: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    search: url.search,
    statusCode,
    action,
    contentType: headers["content-type"] || headers["Content-Type"] || "",
    userAgent: headers["user-agent"] || headers["User-Agent"] || "",
    bodyLength: Buffer.byteLength(String(rawBody || ""), "utf8"),
    bodyPreview: String(rawBody || "").slice(0, 500),
  };
  if (error) {
    record.error = error.message || String(error);
  }
  await fs.promises.mkdir(logDir, { recursive: true });
  await fs.promises.appendFile(logPath, JSON.stringify(record) + "\n", "utf8");
}

module.exports = {
  createApp,
};
