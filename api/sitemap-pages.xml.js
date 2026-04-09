const fs = require("node:fs/promises");
const path = require("node:path");
const { replaceDefaultSiteUrl, resolveSiteUrl } = require("./_site-url");

const SITEMAP_PATH = path.resolve(__dirname, "..", "sitemap-pages.xml");

module.exports = async (req, res) => {
  try {
    const xml = await fs.readFile(SITEMAP_PATH, "utf8");
    const siteUrl = resolveSiteUrl(req);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(replaceDefaultSiteUrl(xml, siteUrl));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Static sitemap pages are unavailable: ${error?.message || error}`);
  }
};
