const UPSTREAM_BASE = 'https://api.mangadex.org/';
const ALLOWED_ROOTS = new Set(['manga', 'chapter', 'at-home']);

function buildTargetUrl(pathSegments, query) {
  const encodedPath = pathSegments.map(segment => encodeURIComponent(String(segment))).join('/');
  const target = new URL(encodedPath, UPSTREAM_BASE);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (key === 'path') return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item !== undefined && item !== null && item !== '') target.searchParams.append(key, String(item));
      });
      return;
    }
    if (value !== undefined && value !== null && value !== '') target.searchParams.append(key, String(value));
  });
  return target;
}

function applyCacheHeaders(res, pathSegments) {
  const root = pathSegments[0];
  if (root === 'manga' && pathSegments.length === 1) {
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return;
  }
  if (root === 'manga' && pathSegments[pathSegments.length - 1] === 'feed') {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return;
  }
  if (root === 'at-home') {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=900');
    return;
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
}

module.exports = async (req, res) => {
  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path.filter(Boolean)
    : req.query.path
      ? [req.query.path]
      : [];

  if (!pathSegments.length || !ALLOWED_ROOTS.has(pathSegments[0])) {
    res.status(400).json({ error: 'Unsupported MangaDex path' });
    return;
  }

  const target = buildTargetUrl(pathSegments, req.query);

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MangaCloudProxy/1.0 (+https://color-manga-cloud.vercel.app)'
      }
    });

    const body = await upstream.text();
    applyCacheHeaders(res, pathSegments);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.status(upstream.status).send(body);
  } catch (error) {
    res.status(502).json({ error: 'Upstream request failed', details: error && error.message ? error.message : 'Unknown error' });
  }
};
