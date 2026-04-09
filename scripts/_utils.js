function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(cleaned);
  });

  return result;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0451/g, "\u0435")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function decryptToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-f0-9]{32}$/i.test(raw)) return raw;
  if (raw.length < 4 || raw.length % 2 !== 0) return raw;

  try {
    const middle = raw.length / 2;
    const left = raw.slice(0, middle).split("").reverse().join("");
    const right = raw.slice(middle).split("").reverse().join("");
    const decoded = Buffer.from(right, "base64").toString("utf8") + Buffer.from(left, "base64").toString("utf8");
    return /^[a-f0-9]{32}$/i.test(decoded) ? decoded : raw;
  } catch {
    return raw;
  }
}

module.exports = {
  uniqueStrings,
  normalizeText,
  decryptToken
};
