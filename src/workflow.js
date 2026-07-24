const { createImaClient } = require("./ima-client");
const { createConfigStore, normalizeConfig } = require("./config-store");
const {
  ENTERPRISE_KNOWLEDGE_BASE_NAME,
  SHARED_KNOWLEDGE_BASE_TYPE,
} = require("./constants");
const { buildOfficebookMarkdown, noteTitle } = require("./markdown");
const { readImaSyncState, upsertImaSyncEntry } = require("./ima-sync-state");
const { isOfficebookMeetingPayload, officebookEntryId, officebookVersionKey } = require("./officebook");

async function ensureEnterpriseKnowledgeBase({ client }) {
  const existing = await findEnterpriseKnowledgeBase({ client });
  if (existing?.id) {
    return {
      ...existing,
      name: existing.name || ENTERPRISE_KNOWLEDGE_BASE_NAME,
      type: existing.type || "unknown",
      created: false,
    };
  }

  const createdResponse = await client.request("openapi/wiki/v1/create_knowledge_base", {
    name: ENTERPRISE_KNOWLEDGE_BASE_NAME,
    type: SHARED_KNOWLEDGE_BASE_TYPE,
  });
  if (createdResponse?.code !== 0 && isDuplicateKnowledgeBaseError(createdResponse)) {
    const duplicate = await findEnterpriseKnowledgeBase({ client })
      || await findAddableEnterpriseKnowledgeBase({ client });
    if (duplicate?.id) {
      return {
        ...duplicate,
        name: duplicate.name || ENTERPRISE_KNOWLEDGE_BASE_NAME,
        type: duplicate.type || SHARED_KNOWLEDGE_BASE_TYPE,
        created: false,
      };
    }
  }

  const created = await requireImaSuccess(Promise.resolve(createdResponse), "IMA 共享知识库创建失败");
  const knowledgeBase = normalizeKnowledgeBase(created.data, ENTERPRISE_KNOWLEDGE_BASE_NAME);
  return {
    ...knowledgeBase,
    name: knowledgeBase.name || ENTERPRISE_KNOWLEDGE_BASE_NAME,
    type: knowledgeBase.type || SHARED_KNOWLEDGE_BASE_TYPE,
    created: true,
  };
}

async function findEnterpriseKnowledgeBase({ client }) {
  const search = await requireImaSuccess(
    client.request("openapi/wiki/v1/search_knowledge_base", {
      query: ENTERPRISE_KNOWLEDGE_BASE_NAME,
      cursor: "",
      limit: 20,
    }),
    "IMA 知识库搜索失败"
  );
  return normalizeKnowledgeBases(search.data)
    .find((item) => item.name === ENTERPRISE_KNOWLEDGE_BASE_NAME);
}

async function findAddableEnterpriseKnowledgeBase({ client }) {
  const response = await requireImaSuccess(
    client.request("openapi/wiki/v1/get_addable_knowledge_base_list", {
      cursor: "",
      limit: 50,
    }),
    "IMA 可写知识库列表获取失败"
  );
  return normalizeKnowledgeBases(response.data)
    .find((item) => item.name === ENTERPRISE_KNOWLEDGE_BASE_NAME);
}

function isDuplicateKnowledgeBaseError(response) {
  const message = String(response?.msg || response?.message || response?.code || "");
  return message.includes("同名") || message.toLowerCase().includes("duplicate");
}

function createWorkflowPusher({
  configStore = createConfigStore(),
  client,
  createClient = createImaClient,
  dataDir,
  now = () => new Date(),
} = {}) {
  return {
    async initialize() {
      const config = normalizeConfig(await configStore.read());
      const imaClient = client || createClient({ clientId: config.clientId, apiKey: config.apiKey });
      const knowledgeBase = await ensureEnterpriseKnowledgeBase({ client: imaClient });
      await configStore.write({
        ...config,
        knowledgeBaseId: knowledgeBase.id,
        knowledgeBaseName: knowledgeBase.name,
        knowledgeBaseType: knowledgeBase.type,
      });
      return knowledgeBase;
    },

    async push(payload) {
      const config = normalizeConfig(await configStore.read());
      if (!config.enabled) {
        return { status: "disabled", skipped: true, reason: "ima_disabled" };
      }
      if (!isOfficebookMeetingPayload(payload)) {
        return { status: "skipped", skipped: true, reason: "not_meeting_content" };
      }
      const imaClient = client || createClient({ clientId: config.clientId, apiKey: config.apiKey });
      let knowledgeBase = config.knowledgeBaseId
        ? {
            id: config.knowledgeBaseId,
            name: config.knowledgeBaseName || ENTERPRISE_KNOWLEDGE_BASE_NAME,
            type: config.knowledgeBaseType || SHARED_KNOWLEDGE_BASE_TYPE,
            created: false,
          }
        : null;
      if (!knowledgeBase) {
        knowledgeBase = await ensureEnterpriseKnowledgeBase({ client: imaClient });
        await configStore.write({
          ...config,
          knowledgeBaseId: knowledgeBase.id,
          knowledgeBaseName: knowledgeBase.name,
          knowledgeBaseType: knowledgeBase.type,
        });
      }

      const title = noteTitle(payload);
      const content = ensureUtf8String(buildOfficebookMarkdown(payload));
      const entryId = officebookEntryId(payload);
      const versionKey = officebookVersionKey(payload);
      const state = await readImaSyncState(dataDir);
      const existing = state.entries[entryId];
      let noteId = existing?.noteId || "";
      let mediaId = existing?.mediaId || "";
      let overwritten = false;
      let knowledgeBaseBound = false;

      if (noteId) {
        await requireImaSuccess(
          imaClient.request("openapi/note/v1/append_doc", {
            note_id: noteId,
            content_format: 1,
            content: updateContent(content, now()),
          }),
          "IMA Markdown 笔记更新失败"
        );
        overwritten = true;
      } else {
        const imported = await requireImaSuccess(
          imaClient.request("openapi/note/v1/import_doc", {
            content_format: 1,
            content,
          }),
          "IMA Markdown 笔记创建失败"
        );
        noteId = imported.data?.note_id || imported.data?.noteId || "";
        if (!noteId) {
          throw new Error("IMA 笔记创建成功但未返回 note_id");
        }
        const bound = await requireImaSuccess(
          imaClient.request("openapi/wiki/v1/add_knowledge", {
            media_type: 11,
            note_info: { content_id: noteId },
            title,
            knowledge_base_id: knowledgeBase.id,
          }),
          "IMA 共享知识库绑定失败"
        );
        mediaId = bound.data?.media_id || bound.data?.mediaId || "";
        knowledgeBaseBound = true;
      }

      await upsertImaSyncEntry(dataDir, entryId, {
        versionKey,
        noteId,
        mediaId,
        knowledgeBaseId: knowledgeBase.id,
        pushedAt: now().toISOString(),
        title,
      });

      return {
        status: "done",
        skipped: false,
        noteId,
        mediaId,
        versionKey,
        overwritten,
        knowledgeBaseBound,
        knowledgeBaseName: knowledgeBase.name,
        knowledgeBaseType: knowledgeBase.type,
      };
    },
  };
}

async function requireImaSuccess(promise, prefix) {
  const response = await promise;
  if (response?.code !== 0) {
    throw new Error(`${prefix}: ${response?.msg || response?.message || response?.code || "unknown error"}`);
  }
  return response;
}

function normalizeKnowledgeBases(data) {
  const list =
    data?.knowledgeBaseList ||
    data?.knowledge_base_list ||
    data?.info_list ||
    data?.addable_knowledge_base_list ||
    data?.list ||
    data?.items ||
    data?.knowledge_bases ||
    data?.knowledgeBases ||
    [];
  return Array.isArray(list) ? list.map((item) => normalizeKnowledgeBase(item)).filter((item) => item.id || item.name) : [];
}

function normalizeKnowledgeBase(data, fallbackName = "") {
  const nested = data?.knowledge_base || data?.knowledgeBase || data?.info || data || {};
  return {
    id: String(nested.id || nested.kb_id || nested.knowledge_base_id || nested.knowledgeBaseId || "").trim(),
    name: String(nested.name || nested.kb_name || nested.title || nested.knowledge_base_name || nested.knowledgeBaseName || fallbackName).trim(),
    type: String(nested.type || nested.base_type || nested.knowledge_base_type || nested.knowledgeBaseType || "").trim(),
  };
}

function ensureUtf8String(value) {
  return Buffer.from(String(value || ""), "utf8").toString("utf8");
}

function updateContent(content, date) {
  const timestamp = formatDateTime(date);
  return [
    "",
    "---",
    "",
    `## 同步更新 ${timestamp}`,
    "",
    content,
  ].join("\n");
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (number) => String(number).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");
}

module.exports = {
  createWorkflowPusher,
  ensureEnterpriseKnowledgeBase,
  isOfficebookMeetingPayload,
  normalizeKnowledgeBase,
  normalizeKnowledgeBases,
};
