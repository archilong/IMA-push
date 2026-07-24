const crypto = require("node:crypto");

function isOfficebookMeetingPayload(payload) {
  const data = payload?.data || {};
  const noteUid = String(data.metadata?.noteUid || "").trim();
  if (!noteUid) {
    return false;
  }
  return hasMeaningfulItems(data.asr) || hasMeaningfulItems(data.audio) || hasMeaningfulItems(data.page);
}

function officebookEntryId(payload = {}, fallback = "") {
  const metadata = payload?.data?.metadata || {};
  return cleanText(metadata.noteUid || payload.noteUid || fallback) || payloadHash(payload);
}

function officebookVersionKey(payload = {}) {
  const metadata = payload?.data?.metadata || {};
  const noteUid = cleanText(metadata.noteUid || payload.noteUid || "");
  const version = metadata.dataVersion ?? metadata.version ?? metadata.updateTime ?? "";
  if (noteUid) {
    return version === "" ? `${noteUid}:hash-${payloadHash(payload)}` : `${noteUid}:v${version}`;
  }
  return `payload:hash-${payloadHash(payload)}`;
}

function hasMeaningfulItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.some((item) => {
    if (item === null || typeof item === "undefined" || item === "") {
      return false;
    }
    if (typeof item !== "object") {
      return true;
    }
    return Object.values(item).some((fieldValue) => {
      if (Array.isArray(fieldValue)) {
        return hasMeaningfulItems(fieldValue);
      }
      return fieldValue !== null && typeof fieldValue !== "undefined" && String(fieldValue).trim() !== "";
    });
  });
}

function cleanText(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value).trim();
}

function payloadHash(payload) {
  return crypto.createHash("sha1").update(JSON.stringify(payload || {})).digest("hex").slice(0, 12);
}

module.exports = {
  isOfficebookMeetingPayload,
  officebookEntryId,
  officebookVersionKey,
};
