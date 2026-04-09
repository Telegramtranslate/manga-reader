const DEFAULT_SITE_URL = "https://color-manga-cloud.vercel.app";

function readHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSiteUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return DEFAULT_SITE_URL;

  try {
    return new URL(value).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function resolveSiteUrl(req) {
  const envSiteUrl = normalizeSiteUrl(process.env.SITE_URL || "");
  if (process.env.SITE_URL) return envSiteUrl;

  const forwardedProto = readHeaderValue(req?.headers?.["x-forwarded-proto"]);
  const forwardedHost = readHeaderValue(req?.headers?.["x-forwarded-host"]);
  const host = forwardedHost || req?.headers?.host;
  const proto = forwardedProto || (req?.connection?.encrypted ? "https" : "http");

  if (!host) return envSiteUrl;
  return normalizeSiteUrl(`${proto}://${host}`);
}

function replaceDefaultSiteUrl(text, siteUrl) {
  return String(text || "")
    .replaceAll(DEFAULT_SITE_URL, siteUrl || DEFAULT_SITE_URL)
    .replaceAll("__SITE_URL__", siteUrl || DEFAULT_SITE_URL);
}

module.exports = {
  DEFAULT_SITE_URL,
  normalizeSiteUrl,
  resolveSiteUrl,
  replaceDefaultSiteUrl
};
