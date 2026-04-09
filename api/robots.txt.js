const { resolveSiteUrl } = require("./_site-url");

module.exports = async (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /api/anilibria-stream
Sitemap: ${siteUrl}/sitemap.xml
`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.end(body);
};
