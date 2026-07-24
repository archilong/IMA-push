const { publicConfig } = require("./config-store");
const { ENTERPRISE_KNOWLEDGE_BASE_NAME } = require("./constants");

function renderWorkflowPage({ config = {} } = {}) {
  const safe = publicConfig(config);
  const enabled = safe.enabled;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IMA 传输工作流</title>
  <style>
    :root {
      color-scheme: light;
      --sidebar: #0f172a;
      --sidebar-active: #1e293b;
      --ink: #111827;
      --muted: #667085;
      --line: #e5e7eb;
      --page: #f5f6f8;
      --panel: #ffffff;
      --primary: #111827;
      --primary-hover: #243044;
      --blue: #2563eb;
      --green: #16a34a;
      --shadow: 0 8px 24px rgba(15,23,42,0.04);
      --control-h: 44px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #f5f6f8;
      color: var(--ink);
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    button, input { font: inherit; }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 280px minmax(0, 1fr); grid-template-rows: 72px minmax(0, 1fr); }
    .top-header { grid-column: 1 / -1; height: 72px; background: #ffffff; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; padding: 0 30px; }
    .brand { display: flex; align-items: baseline; gap: 18px; min-width: 0; }
    .brand-title { color: #020617; font-size: 22px; font-weight: 820; letter-spacing: 0; white-space: nowrap; }
    .brand-subtitle { color: #475467; font-size: 14px; white-space: nowrap; }
    .side-nav { grid-row: 2; background: var(--sidebar); color: #e5e7eb; padding: 24px 16px; display: flex; flex-direction: column; gap: 28px; }
    .nav-list { display: grid; gap: 8px; }
    .nav-item { min-height: 48px; border-radius: 6px; padding: 0 14px; display: flex; align-items: center; gap: 12px; color: #cbd5e1; font-weight: 720; text-decoration: none; }
    .nav-item.active { background: var(--sidebar-active); color: #ffffff; }
    .nav-icon { width: 18px; height: 18px; border: 1.8px solid currentColor; border-radius: 4px; display: inline-block; position: relative; flex: 0 0 auto; }
    .nav-icon.line::after { content: ""; position: absolute; left: 3px; right: 3px; top: 7px; border-top: 1.8px solid currentColor; }
    .main-area { grid-row: 2; min-width: 0; }
    .header-title { font-size: 18px; font-weight: 780; color: #111827; }
    .header-action { color: #344054; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
    .header-action::before { content: ""; width: 14px; height: 14px; border: 1.8px solid currentColor; border-left: 0; border-bottom: 0; transform: rotate(45deg); }
    .content { max-width: 1280px; padding: 32px 40px 48px; display: grid; gap: 24px; align-content: start; }
    .hero { display: grid; gap: 8px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    .subtitle { color: var(--muted); font-size: 14px; line-height: 1.6; max-width: 760px; }
    .content-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); box-shadow: var(--shadow); overflow: hidden; }
    .card-head { min-height: 72px; padding: 0 30px; border-bottom: 1px solid #eef0f3; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .card-title { font-size: 18px; font-weight: 760; }
    .card-body { padding: 28px 30px 30px; display: grid; gap: 22px; }
    .setting-row { border: 1px solid var(--line); background: #f9fafb; border-radius: 8px; padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .switch-copy { display: grid; gap: 6px; min-width: 0; }
    .switch-title { font-size: 16px; font-weight: 760; }
    .switch-note { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .switch-control { position: relative; display: inline-flex; align-items: center; flex: 0 0 auto; min-width: 64px; min-height: 34px; cursor: pointer; }
    .switch-control input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
    .switch-slider { position: relative; width: 58px; height: 32px; border-radius: 999px; background: #d0d5dd; transition: background 140ms ease; }
    .switch-slider::before { content: ""; position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: 50%; background: #ffffff; box-shadow: 0 2px 6px rgba(15,23,42,0.24); transition: transform 140ms ease; }
    .switch-slider::after { content: attr(data-state); position: absolute; top: 50%; right: 8px; transform: translateY(-50%); color: #ffffff; font-size: 10px; font-weight: 760; }
    .switch-control input:checked + .switch-slider { background: #2563eb; }
    .switch-control input:checked + .switch-slider::before { transform: translateX(26px); }
    .switch-control input:checked + .switch-slider::after { left: 8px; right: auto; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 8px; color: #344054; font-size: 14px; font-weight: 650; }
    input { min-height: var(--control-h); border: 1px solid #d0d5dd; border-radius: 8px; background: #f9fafb; color: var(--ink); padding: 10px 12px; font: 14px "Cascadia Mono", Consolas, monospace; width: 100%; outline: none; }
    input:focus { border-color: var(--blue); background: #ffffff; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
    .btn { min-height: var(--control-h); border: 1px solid #d0d5dd; border-radius: 8px; background: #ffffff; color: #111827; padding: 0 18px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-weight: 720; white-space: nowrap; }
    .btn.primary { border-color: var(--primary); background: var(--primary); color: #ffffff; }
    .btn.primary:hover { background: var(--primary-hover); }
    .btn.success { border-color: var(--primary); background: var(--primary); color: #ffffff; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .workflow { display: grid; gap: 12px; counter-reset: step; }
    .step { border: 1px solid var(--line); border-radius: 8px; background: #f9fafb; padding: 16px; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 14px; align-items: start; }
    .step::before { counter-increment: step; content: counter(step); width: 28px; height: 28px; border-radius: 50%; background: #eef2ff; color: var(--blue); display: inline-flex; align-items: center; justify-content: center; font-weight: 820; font-size: 13px; }
    .step-title { font-weight: 760; font-size: 14px; }
    .api-name { margin-top: 5px; color: var(--muted); font: 12px "Cascadia Mono", Consolas, monospace; overflow-wrap: anywhere; }
    .banner { display: none; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 8px; padding: 10px 12px; font-size: 13px; }
    .banner.visible { display: block; }
    .status-line { color: var(--muted); font-size: 13px; line-height: 1.55; }
    @media (max-width: 900px) {
      .app-shell { grid-template-columns: 1fr; grid-template-rows: 64px minmax(0, 1fr); }
      .side-nav { display: none; }
      .top-header { padding: 0 18px; }
      .brand-title { font-size: 18px; }
      .brand-subtitle { display: none; }
      .content { padding: 20px 16px 32px; }
    }
    @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } .actions { display: grid; grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="app-shell">
    <header class="top-header">
      <div class="brand">
        <div class="brand-title">企业开放平台</div>
        <div class="brand-subtitle">星云科技</div>
      </div>
      <a class="header-action" href="/">退出</a>
    </header>
    <aside class="side-nav">
      <nav class="nav-list" aria-label="主导航">
        <a class="nav-item" href="#"><span class="nav-icon"></span><span>总览</span></a>
        <a class="nav-item active" href="#"><span class="nav-icon line"></span><span>办公本数据推送</span></a>
        <a class="nav-item" href="#"><span class="nav-icon"></span><span>系统设置</span></a>
      </nav>
    </aside>
    <div class="main-area">
      <main class="content">
        <section class="hero">
          <h1>IMA数据推送</h1>
          <div class="subtitle">办公本会议会自动转换为 Markdown，并直接写入共享知识库「${escapeHtml(ENTERPRISE_KNOWLEDGE_BASE_NAME)}」。</div>
        </section>
        <div id="banner" class="banner"></div>
        <section class="content-card">
          <div class="card-head"><div class="card-title">传输启动</div></div>
          <div class="card-body">
            <div class="setting-row">
              <div class="switch-copy">
                <div class="switch-title">IMA 传输</div>
                <div id="switchNote" class="switch-note">${enabled ? "已启用；新接收的办公本会议会写入 IMA。" : "未启用；服务只接收请求，不写入 IMA。"}</div>
              </div>
              <label class="switch-control" aria-label="启用 IMA 传输">
                <input id="imaEnabled" type="checkbox"${enabled ? " checked" : ""} />
                <span class="switch-slider" data-state="${enabled ? "ON" : "OFF"}"></span>
              </label>
            </div>
          </div>
        </section>
        <section class="content-card">
          <div class="card-head"><div class="card-title">IMA 鉴权</div></div>
          <div class="card-body">
            <div class="form-grid">
              <label>Client ID<input id="clientId" type="text" autocomplete="off" spellcheck="false" value="${escapeAttribute(safe.clientId)}" /></label>
              <label>API Key<input id="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${safe.apiKeyConfigured ? "已配置，留空则保持不变" : ""}" /></label>
            </div>
            <div class="actions">
              <button id="saveAuth" class="btn primary" type="button">保存鉴权</button>
              <button id="initialize" class="btn" type="button">初始化共享知识库</button>
            </div>
            <div id="status" class="status-line">目标知识库：${escapeHtml(safe.knowledgeBaseName || ENTERPRISE_KNOWLEDGE_BASE_NAME)}；状态：${safe.knowledgeBaseReady ? "已就绪" : "等待初始化"}</div>
          </div>
        </section>
        <section class="content-card">
          <div class="card-head"><div class="card-title">接口步骤</div></div>
          <div class="card-body workflow">
            <div class="step"><div><div class="step-title">判断是否为会议内容</div><div class="api-name">要求包含 noteUid，并且 ASR、音频或页面内容至少一项有效；否则标记为非会议并跳过写入。</div></div></div>
            <div class="step"><div><div class="step-title">查找共享知识库</div><div class="api-name">openapi/wiki/v1/search_knowledge_base</div></div></div>
            <div class="step"><div><div class="step-title">不存在时创建共享知识库</div><div class="api-name">openapi/wiki/v1/create_knowledge_base</div></div></div>
            <div class="step"><div><div class="step-title">重复推送覆盖</div><div class="api-name">同一 noteUid 已存在时复用本地记录的 IMA note_id，并调用 openapi/note/v1/append_doc 更新已有笔记。</div></div></div>
            <div class="step"><div><div class="step-title">办公本内容转换为 Markdown 笔记</div><div class="api-name">openapi/note/v1/import_doc</div></div></div>
            <div class="step"><div><div class="step-title">将笔记绑定到共享知识库</div><div class="api-name">openapi/wiki/v1/add_knowledge</div></div></div>
          </div>
        </section>
      </main>
    </div>
  </div>
  <script>
    const els = {
      banner: document.getElementById("banner"),
      imaEnabled: document.getElementById("imaEnabled"),
      switchNote: document.getElementById("switchNote"),
      clientId: document.getElementById("clientId"),
      apiKey: document.getElementById("apiKey"),
      saveAuth: document.getElementById("saveAuth"),
      initialize: document.getElementById("initialize"),
      status: document.getElementById("status"),
    };
    function showBanner(message) {
      els.banner.textContent = message;
      els.banner.classList.add("visible");
    }
    function syncSwitch() {
      document.querySelector(".switch-slider").dataset.state = els.imaEnabled.checked ? "ON" : "OFF";
      els.switchNote.textContent = els.imaEnabled.checked
        ? "已启用；新接收的办公本会议会写入 IMA。"
        : "未启用；服务只接收请求，不写入 IMA。";
    }
    async function post(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || data.message || "请求失败");
      return data;
    }
    async function saveConfig(extra = {}) {
      const body = {
        enabled: els.imaEnabled.checked,
        clientId: els.clientId.value.trim(),
        apiKey: els.apiKey.value.trim(),
        ...extra,
      };
      const data = await post("/api/config", body);
      showBanner("设置已保存");
      return data.config;
    }
    els.imaEnabled.addEventListener("change", async () => {
      syncSwitch();
      try { await saveConfig(); } catch (error) { showBanner(error.message); }
    });
    els.saveAuth.addEventListener("click", async () => {
      try { await saveConfig(); } catch (error) { showBanner(error.message); }
    });
    els.initialize.addEventListener("click", async () => {
      try {
        await saveConfig();
        const data = await post("/api/initialize", {});
        els.status.textContent = "目标知识库：" + data.knowledgeBase.name + "；状态：已就绪";
        showBanner("共享知识库已初始化");
      } catch (error) {
        showBanner(error.message);
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

module.exports = {
  renderWorkflowPage,
};
