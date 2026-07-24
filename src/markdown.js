const crypto = require("node:crypto");

function buildOfficebookMarkdown(payload = {}) {
  const metadata = payload?.data?.metadata || {};
  const title = cleanText(metadata.title || payload.title || "办公本记录") || "办公本记录";
  const lines = [`# ${title}`, ""];
  const metaLines = [
    ["笔记唯一ID", metadata.noteUid || payload.noteUid],
    ["所属员工", metadata.ownerName],
    ["员工ID", metadata.ownerId],
    ["创建时间", normalizeDateText(metadata.createTime)],
    ["更新时间", normalizeDateText(metadata.updateTime)],
    ["设备SN", metadata.sn],
  ].filter(([, value]) => hasText(value));

  if (metaLines.length) {
    lines.push("## 基础信息", "");
    for (const [label, value] of metaLines) {
      lines.push(`- ${label}：${cleanText(value)}`);
    }
    lines.push("");
  }

  addSection(lines, "AI 总结", payload?.data?.summary?.content);
  addArraySection(lines, "AI 笔记", payload?.data?.aiNote, (item) => item?.content || "");
  addSection(lines, "AI 洞察", payload?.data?.insight?.content);
  addArraySection(lines, "页面 OCR", payload?.data?.page, (item, index) => {
    const page = item?.pageUid || `第 ${index + 1} 页`;
    return item?.ocr ? `### ${cleanText(page)}\n\n${cleanText(item.ocr)}` : "";
  });
  addSection(lines, "语音转写", formatAsr(payload?.data?.asr || []));

  return stripLocalMarkdownImages(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n");
}

function noteTitle(payload = {}) {
  const metadata = payload?.data?.metadata || {};
  return cleanText(metadata.title || payload.title || "办公本记录") || "办公本记录";
}

function officebookEntryId(payload = {}, fallback = "") {
  const metadata = payload?.data?.metadata || {};
  return cleanText(metadata.noteUid || payload.noteUid || fallback) || payloadHash(payload);
}

function addSection(lines, title, content) {
  const text = cleanText(content);
  if (text) {
    lines.push(`## ${title}`, "", text, "");
  }
}

function addArraySection(lines, title, items, formatter) {
  if (!Array.isArray(items)) {
    return;
  }
  const blocks = items.map(formatter).map(cleanText).filter(Boolean);
  if (blocks.length) {
    lines.push(`## ${title}`, "", blocks.join("\n\n"), "");
  }
}

function formatAsr(items) {
  if (!Array.isArray(items)) {
    return "";
  }
  return items.map((item) => {
    if (typeof item === "string") {
      return item;
    }
    const speaker = cleanText(item?.speaker || item?.speakerName || item?.role || "");
    const time = formatMilliseconds(item?.startTime ?? item?.start_time ?? item?.beginTime);
    const text = cleanText(item?.text || item?.content || item?.sentence || "");
    return [speaker, time, text].filter(Boolean).join(" ");
  }).filter(Boolean).join("\n");
}

function formatMilliseconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return "";
  }
  const totalSeconds = Math.floor(number / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeDateText(value) {
  return typeof value === "string" ? value.replace("T", " ") : value;
}

function stripLocalMarkdownImages(markdown) {
  return String(markdown || "").replace(/!\[[^\]]*]\(([^)]+)\)/g, (match, rawUrl) => {
    const url = String(rawUrl || "").trim().replace(/^['"]|['"]$/g, "");
    if (/^https?:\/\//i.test(url)) {
      return match;
    }
    if (/^(file:\/\/|[a-zA-Z]:[\\/]|\/|\\\\)/.test(url)) {
      return "";
    }
    return match;
  });
}

function cleanText(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value).trim();
}

function hasText(value) {
  return cleanText(value) !== "";
}

function payloadHash(payload) {
  return crypto.createHash("sha1").update(JSON.stringify(payload || {})).digest("hex").slice(0, 12);
}

module.exports = {
  buildOfficebookMarkdown,
  noteTitle,
  officebookEntryId,
  stripLocalMarkdownImages,
};
