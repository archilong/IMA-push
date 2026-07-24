const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createWorkflowPusher, ensureEnterpriseKnowledgeBase } = require("../src/workflow");
const { buildOfficebookMarkdown } = require("../src/markdown");
const { renderWorkflowPage } = require("../src/html-page");
const { createApp } = require("../src/app");

test("ensureEnterpriseKnowledgeBase reuses the enterprise shared knowledge base by name", async () => {
  const calls = [];
  const client = {
    async request(apiPath, body) {
      calls.push({ apiPath, body });
      assert.equal(apiPath, "openapi/wiki/v1/search_knowledge_base");
      return {
        code: 0,
        data: {
          knowledgeBaseList: [
            { knowledge_base_id: "kb_existing", name: "企业办公本数据中心", type: "KBT_SHARED_KB" },
          ],
        },
      };
    },
  };

  const result = await ensureEnterpriseKnowledgeBase({ client });

  assert.deepEqual(result, {
    id: "kb_existing",
    name: "企业办公本数据中心",
    type: "KBT_SHARED_KB",
    created: false,
  });
  assert.equal(calls.length, 1);
});

test("ensureEnterpriseKnowledgeBase understands IMA search info_list shape", async () => {
  const client = {
    async request(apiPath) {
      assert.equal(apiPath, "openapi/wiki/v1/search_knowledge_base");
      return {
        code: 0,
        data: {
          info_list: [
            {
              kb_id: "kb_real",
              kb_name: "企业办公本数据中心",
              base_type: "共享知识库",
            },
          ],
        },
      };
    },
  };

  const result = await ensureEnterpriseKnowledgeBase({ client });

  assert.deepEqual(result, {
    id: "kb_real",
    name: "企业办公本数据中心",
    type: "共享知识库",
    created: false,
  });
});

test("ensureEnterpriseKnowledgeBase reuses an existing knowledge base after duplicate-name create rejection", async () => {
  const calls = [];
  const client = {
    async request(apiPath, body) {
      calls.push({ apiPath, body });
      if (apiPath === "openapi/wiki/v1/search_knowledge_base" && calls.length === 1) {
        return { code: 0, data: { info_list: [] } };
      }
      if (apiPath === "openapi/wiki/v1/create_knowledge_base") {
        return { code: 100001, msg: "你已存在同名的知识库" };
      }
      if (apiPath === "openapi/wiki/v1/search_knowledge_base") {
        return {
          code: 0,
          data: {
            info_list: [
              {
                kb_id: "kb_duplicate",
                kb_name: "企业办公本数据中心",
                base_type: "共享知识库",
              },
            ],
          },
        };
      }
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };

  const result = await ensureEnterpriseKnowledgeBase({ client });

  assert.equal(result.id, "kb_duplicate");
  assert.equal(result.name, "企业办公本数据中心");
  assert.equal(result.created, false);
  assert.deepEqual(calls.map((call) => call.apiPath), [
    "openapi/wiki/v1/search_knowledge_base",
    "openapi/wiki/v1/create_knowledge_base",
    "openapi/wiki/v1/search_knowledge_base",
  ]);
});

test("ensureEnterpriseKnowledgeBase creates a shared knowledge base when missing", async () => {
  const calls = [];
  const client = {
    async request(apiPath, body) {
      calls.push({ apiPath, body });
      if (apiPath === "openapi/wiki/v1/search_knowledge_base") {
        return { code: 0, data: { knowledgeBaseList: [] } };
      }
      if (apiPath === "openapi/wiki/v1/create_knowledge_base") {
        return {
          code: 0,
          msg: "success",
          data: { knowledge_base_id: "kb_new", name: body.name, type: body.type },
        };
      }
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };

  const result = await ensureEnterpriseKnowledgeBase({ client });

  assert.equal(result.id, "kb_new");
  assert.equal(result.name, "企业办公本数据中心");
  assert.equal(result.type, "KBT_SHARED_KB");
  assert.equal(result.created, true);
  assert.deepEqual(calls.map((call) => call.apiPath), [
    "openapi/wiki/v1/search_knowledge_base",
    "openapi/wiki/v1/create_knowledge_base",
  ]);
  assert.deepEqual(calls[1].body, {
    name: "企业办公本数据中心",
    type: "KBT_SHARED_KB",
  });
});

test("webhook logs IMA push failures with the original error", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ima-app-"));
  const client = {
    async request() {
      throw new Error("IMA write failed");
    },
  };
  const configStore = {
    async read() {
      return {
        enabled: true,
        clientId: "client",
        apiKey: "key",
        knowledgeBaseId: "kb_shared",
        knowledgeBaseName: "企业办公本数据中心",
      };
    },
    async write(next) {
      return next;
    },
  };
  const app = createApp({ configStore, client, dataDir });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      body: { data: { metadata: { title: "失败会议", noteUid: "failed_1" }, asr: [{ text: "内容" }] } },
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json.error, "IMA write failed");

    const logText = await readFile(path.join(dataDir, "webhook-access.log"), "utf8");
    const log = JSON.parse(logText.trim());
    assert.equal(log.action, "push_failed");
    assert.equal(log.error, "IMA write failed");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("workflow pusher writes officebook markdown to one shared knowledge base without folders or departments", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ima-workflow-"));
  const calls = [];
  const client = {
    async request(apiPath, body) {
      calls.push({ apiPath, body });
      if (apiPath === "openapi/wiki/v1/search_knowledge_base") {
        return {
          code: 0,
          data: {
            knowledgeBaseList: [
              { knowledge_base_id: "kb_shared", name: "企业办公本数据中心", type: "KBT_SHARED_KB" },
            ],
          },
        };
      }
      if (apiPath === "openapi/note/v1/import_doc") {
        return { code: 0, data: { note_id: "note_1" } };
      }
      if (apiPath === "openapi/wiki/v1/add_knowledge") {
        return { code: 0, data: { media_id: "media_1" } };
      }
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };
  const configStore = {
    async read() {
      return { enabled: true, clientId: "client", apiKey: "key" };
    },
    async write(next) {
      this.saved = next;
      return next;
    },
  };
  const pusher = createWorkflowPusher({ client, configStore, dataDir });

  try {
    const result = await pusher.push({
      data: {
        metadata: {
          title: "项目同步会",
          ownerName: "曹裕龙",
          noteUid: "note_uid_1",
          createTime: "2026-07-24T10:00:00",
        },
        summary: { content: "确认上线安排。" },
        asr: [{ speaker: "说话人1", startTime: 0, text: "今天确认上线安排" }],
      },
    });

    assert.equal(result.status, "done");
    assert.equal(result.knowledgeBaseName, "企业办公本数据中心");
    assert.equal(result.noteId, "note_1");
    assert.deepEqual(calls.map((call) => call.apiPath), [
      "openapi/wiki/v1/search_knowledge_base",
      "openapi/note/v1/import_doc",
      "openapi/wiki/v1/add_knowledge",
    ]);
    assert.equal(calls[1].body.content_format, 1);
    assert.match(calls[1].body.content, /# 项目同步会/);
    assert.match(calls[1].body.content, /确认上线安排/);
    assert.equal(calls[2].body.media_type, 11);
    assert.equal(calls[2].body.knowledge_base_id, "kb_shared");
    assert.equal(calls[2].body.note_info.content_id, "note_1");
    assert.equal(Object.hasOwn(calls[2].body, "folder_id"), false);
    assert.equal(String(JSON.stringify(calls)), JSON.stringify(calls).includes("department") ? "" : JSON.stringify(calls));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("workflow pusher skips non-meeting officebook payloads before writing to IMA", async () => {
  const calls = [];
  const client = {
    async request(apiPath, body) {
      calls.push({ apiPath, body });
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };
  const configStore = {
    async read() {
      return { enabled: true, clientId: "client", apiKey: "key", knowledgeBaseId: "kb_shared" };
    },
    async write(next) {
      return next;
    },
  };
  const pusher = createWorkflowPusher({ client, configStore });

  const result = await pusher.push({
    data: {
      metadata: { title: "普通笔记", noteUid: "note_plain" },
      summary: { content: "这是一条没有录音、转写或页面内容的普通笔记。" },
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    skipped: true,
    reason: "not_meeting_content",
  });
  assert.equal(calls.length, 0);
});

test("workflow pusher overwrites duplicate noteUid pushes by appending to the existing IMA note", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ima-workflow-"));
  const calls = [];
  const client = {
    async request(apiPath, body) {
      calls.push({ apiPath, body });
      if (apiPath === "openapi/wiki/v1/search_knowledge_base") {
        return {
          code: 0,
          data: {
            knowledgeBaseList: [
              { knowledge_base_id: "kb_shared", name: "企业办公本数据中心", type: "KBT_SHARED_KB" },
            ],
          },
        };
      }
      if (apiPath === "openapi/note/v1/import_doc") {
        return { code: 0, data: { note_id: "note_existing" } };
      }
      if (apiPath === "openapi/wiki/v1/add_knowledge") {
        return { code: 0, data: { media_id: "media_existing" } };
      }
      if (apiPath === "openapi/note/v1/append_doc") {
        return { code: 0, data: { note_id: body.note_id } };
      }
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };
  const configStore = {
    async read() {
      return { enabled: true, clientId: "client", apiKey: "key" };
    },
    async write(next) {
      this.saved = next;
      return next;
    },
  };
  const pusher = createWorkflowPusher({
    client,
    configStore,
    dataDir,
    now: () => new Date("2026-07-24T08:00:00+08:00"),
  });
  const payload = {
    data: {
      metadata: {
        title: "重复会议",
        noteUid: "note_same",
        dataVersion: 3,
      },
      asr: [{ text: "第一次会议内容" }],
    },
  };

  try {
    const first = await pusher.push(payload);
    const second = await pusher.push({
      data: {
        metadata: {
          title: "重复会议更新",
          noteUid: "note_same",
          dataVersion: 4,
        },
        asr: [{ text: "第二次覆盖内容" }],
      },
    });

    assert.equal(first.status, "done");
    assert.equal(first.overwritten, false);
    assert.equal(second.status, "done");
    assert.equal(second.overwritten, true);
    assert.equal(second.noteId, "note_existing");
    assert.deepEqual(calls.map((call) => call.apiPath), [
      "openapi/wiki/v1/search_knowledge_base",
      "openapi/note/v1/import_doc",
      "openapi/wiki/v1/add_knowledge",
      "openapi/wiki/v1/search_knowledge_base",
      "openapi/note/v1/append_doc",
    ]);
    assert.equal(calls[4].body.note_id, "note_existing");
    assert.match(calls[4].body.content, /## 同步更新 2026-07-24 08:00:00/);
    assert.match(calls[4].body.content, /第二次覆盖内容/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("workflow page only exposes switch, auth, initialization and API step names", () => {
  const html = renderWorkflowPage({
    config: { enabled: false, clientId: "client_id", knowledgeBaseName: "企业办公本数据中心" },
  });

  assert.match(html, /id="imaEnabled"/);
  assert.match(html, /id="clientId"/);
  assert.match(html, /id="apiKey"/);
  assert.match(html, /class="app-shell"/);
  assert.match(html, /class="side-nav"/);
  assert.match(html, /class="top-header"/);
  assert.match(html, /企业开放平台/);
  assert.match(html, /星云科技/);
  assert.match(html, /办公本数据推送/);
  assert.match(html, /IMA数据推送/);
  assert.match(html, /class="nav-item active"/);
  assert.match(html, /class="content-card"/);
  assert.match(html, /检查 IMA 连接/);
  assert.match(html, /连接正常/);
  assert.doesNotMatch(html, /初始化共享知识库|等待初始化|共享知识库已初始化/);
  assert.match(html, /background:\s*#f5f6f8/);
  assert.match(html, /--sidebar:\s*#0f172a/);
  assert.doesNotMatch(html, /IMA_BASE_URL|imaBaseUrl|API 地址/);
  assert.doesNotMatch(html, /部门管理|部门写入|部门知识库|文件夹|推送记录|操作日志/);
  assert.match(html, /判断是否为会议内容/);
  assert.match(html, /重复推送覆盖/);
  assert.match(html, /search_knowledge_base/);
  assert.match(html, /create_knowledge_base/);
  assert.match(html, /import_doc/);
  assert.match(html, /add_knowledge/);
  assert.match(html, /企业办公本数据中心/);
});

test("officebook markdown builder includes meeting title, metadata, summary and ASR", () => {
  const markdown = buildOfficebookMarkdown({
    data: {
      metadata: {
        title: "研发例会",
        ownerName: "张晨光",
        noteUid: "note_2",
        createTime: "2026-07-24T11:00:00",
      },
      summary: { content: "讨论风险和排期。" },
      asr: [{ speaker: "说话人1", startTime: 1200, text: "需要同步排期" }],
    },
  });

  assert.match(markdown, /^# 研发例会/);
  assert.match(markdown, /## 基础信息/);
  assert.match(markdown, /所属员工：张晨光/);
  assert.match(markdown, /## AI 总结/);
  assert.match(markdown, /讨论风险和排期。/);
  assert.match(markdown, /## 语音转写/);
  assert.match(markdown, /说话人1/);
});

test("standalone app serves workflow UI, saves auth, initializes and receives webhook", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ima-app-"));
  const requests = [];
  const client = {
    async request(apiPath, body) {
      requests.push({ apiPath, body });
      if (apiPath === "openapi/wiki/v1/search_knowledge_base") {
        return { code: 0, data: { knowledgeBaseList: [] } };
      }
      if (apiPath === "openapi/wiki/v1/create_knowledge_base") {
        return { code: 0, data: { knowledge_base_id: "kb_shared", name: body.name, type: body.type } };
      }
      if (apiPath === "openapi/note/v1/import_doc") {
        return { code: 0, data: { note_id: "note_created" } };
      }
      if (apiPath === "openapi/wiki/v1/add_knowledge") {
        return { code: 0, data: { media_id: "media_created" } };
      }
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };
  const memory = {};
  const configStore = {
    async read() {
      return { ...memory };
    },
    async write(next) {
      Object.assign(memory, next);
      return { ...memory };
    },
  };
  const app = createApp({ configStore, client, dataDir });

  try {
    const page = await app.inject({ method: "GET", url: "/" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /IMA 传输工作流/);

    const saved = await app.inject({
      method: "POST",
      url: "/api/config",
      body: { enabled: true, clientId: "client", apiKey: "key" },
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json.config.enabled, true);
    assert.equal(saved.json.config.baseUrl, undefined);

    const initialized = await app.inject({ method: "POST", url: "/api/initialize" });
    assert.equal(initialized.statusCode, 200);
    assert.equal(initialized.json.knowledgeBase.name, "企业办公本数据中心");

    const pushed = await app.inject({
      method: "POST",
      url: "/webhook",
      body: { data: { metadata: { title: "周会", noteUid: "n1" }, asr: [{ text: "内容" }] } },
    });
    assert.equal(pushed.statusCode, 200);
    assert.deepEqual(pushed.json, { code: 0, message: "success" });
    assert.equal(requests.some((request) => Object.hasOwn(request.body, "folder_id")), false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("webhook connectivity check returns officebook success without pushing empty payloads", async () => {
  const requests = [];
  const client = {
    async request(apiPath, body) {
      requests.push({ apiPath, body });
      throw new Error(`unexpected api: ${apiPath}`);
    },
  };
  const configStore = {
    async read() {
      return { enabled: true, clientId: "client", apiKey: "key" };
    },
    async write(next) {
      return next;
    },
  };
  const app = createApp({ configStore, client });

  const getCheck = await app.inject({ method: "GET", url: "/webhook" });
  assert.equal(getCheck.statusCode, 200);
  assert.deepEqual(getCheck.json, { code: 0, message: "success" });

  const emptyPostCheck = await app.inject({ method: "POST", url: "/webhook", body: {} });
  assert.equal(emptyPostCheck.statusCode, 200);
  assert.deepEqual(emptyPostCheck.json, { code: 0, message: "success" });

  const optionsCheck = await app.inject({ method: "OPTIONS", url: "/webhook" });
  assert.equal(optionsCheck.statusCode, 200);
  assert.deepEqual(optionsCheck.json, { code: 0, message: "success" });

  const customTestBodyCheck = await app.inject({
    method: "POST",
    url: "/webhook",
    body: { test: true, message: "connectivity_check" },
  });
  assert.equal(customTestBodyCheck.statusCode, 200);
  assert.deepEqual(customTestBodyCheck.json, { code: 0, message: "success" });
  assert.equal(requests.length, 0);
});
