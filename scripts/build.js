const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const esbuild = require("esbuild");

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const FILES = [
  "app-constants.js",
  "firebase-config.js",
  "cloud-sync.js",
  "app-api-client.js",
  "app-seo.js",
  "app-stats.js",
  "app-player-utils.js",
  "app.js",
  "auth.js",
  "watch-features.js"
];
const STATIC_FILES = [
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "content-stats.json",
  "google247099fdf8c184e2.html",
  "sw.js",
  "mc-icon-192.png",
  "mc-icon-192-maskable.png",
  "mc-icon-512.png",
  "mc-icon-512-maskable.png"
];
const HASHED_PUBLIC_FILES = [
  "style.css",
  "manifest.webmanifest",
  "sw.js",
  "app-constants.min.js",
  "firebase-config.min.js",
  "cloud-sync.min.js",
  "app-api-client.min.js",
  "app-seo.min.js",
  "app-stats.min.js",
  "app-player-utils.min.js",
  "app.min.js",
  "auth.min.js",
  "watch-features.min.js",
  "hls.min.js",
  "mc-icon-192.png",
  "mc-icon-192-maskable.png",
  "mc-icon-512.png",
  "mc-icon-512-maskable.png"
];

async function runNodeScript(scriptPath) {
  await execFileAsync(process.execPath, [scriptPath], {
    cwd: ROOT,
    env: process.env,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
}

function isProductionLikeBuild(env = process.env) {
  return String(env.VERCEL_ENV || env.NODE_ENV || "").toLowerCase() === "production";
}

function getMissingRequiredBuildEnv(env = process.env) {
  if (!isProductionLikeBuild(env)) return [];
  return ["KODIK_TOKEN", "SITE_URL"].filter((key) => !String(env[key] || "").trim());
}

async function generateDerivedFiles() {
  const missing = getMissingRequiredBuildEnv();
  if (missing.length) {
    throw new Error(`Missing required production build env: ${missing.join(", ")}`);
  }

  if (!process.env.KODIK_TOKEN) {
    console.log("Skipping Kodik-derived files: KODIK_TOKEN is not set.");
    return;
  }

  try {
    await runNodeScript(path.join(ROOT, "scripts", "generate-content-stats.js"));
    console.log("Generated content-stats.json during build.");
    await runNodeScript(path.join(ROOT, "scripts", "generate-sitemap-anime.js"));
    console.log("Generated sitemap-anime.xml during build.");
  } catch (error) {
    if (isProductionLikeBuild()) {
      throw error;
    }
    console.warn("Failed to generate Kodik-derived files during build, keeping existing files.");
    if (error?.stdout) console.warn(error.stdout.trim());
    if (error?.stderr) console.warn(error.stderr.trim());
  }
}

async function ensurePublicDir() {
  await fs.rm(PUBLIC_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
}

async function copyFileToPublic(filename) {
  const sourcePath = path.join(ROOT, filename);
  const outputPath = path.join(PUBLIC_DIR, path.basename(filename));
  await fs.copyFile(sourcePath, outputPath);
  return outputPath;
}

async function copyNodeModuleFileToPublic(sourcePath, outputName) {
  try {
    await fs.access(sourcePath);
  } catch {
    throw new Error(`Required runtime asset is missing: ${sourcePath}`);
  }
  const outputPath = path.join(PUBLIC_DIR, outputName);
  await fs.copyFile(sourcePath, outputPath);
  return outputPath;
}

function shortHash(input) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 10);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildPublicAssetReferenceMap() {
  const entries = await Promise.all(
    HASHED_PUBLIC_FILES.map(async (filename) => {
      const content = await fs.readFile(path.join(PUBLIC_DIR, filename));
      return [filename, `/${filename}?v=${shortHash(content)}`];
    })
  );

  return Object.fromEntries(entries);
}

async function rewritePublicAssetReferences(referenceMap) {
  const buildId = shortHash(JSON.stringify(referenceMap));
  const replacements = [
    ["/api/runtime-config.js", `/api/runtime-config.js?v=${buildId}`],
    ...Object.entries(referenceMap).map(([filename, value]) => [`/${filename}`, value])
  ];

  const textFiles = [
    "index.html",
    "sw.js",
    "manifest.webmanifest",
    "app.min.js",
    "auth.min.js",
    "firebase-config.min.js",
    "cloud-sync.min.js",
    "watch-features.min.js",
    "app-constants.min.js"
  ].map((filename) => path.join(PUBLIC_DIR, filename));

  for (const filePath of textFiles) {
    let content = await fs.readFile(filePath, "utf8");

    replacements.forEach(([basePath, hashedPath]) => {
      const pattern = new RegExp(`${escapeRegex(basePath)}(?:\\?v=[^"'\\s<>)]+)?`, "g");
      content = content.replace(pattern, hashedPath);
    });

    if (path.basename(filePath) === "sw.js") {
      content = content.replace(
        /const CACHE_VERSION = ".*?";/,
        `const CACHE_VERSION = "${buildId}";`
      );
      content = content
        .replace(/url\.pathname === "\/manifest\.webmanifest(?:\?v=[^"]+)?"/g, 'url.pathname === "/manifest.webmanifest"')
        .replace(
          /url\.pathname === "\/api\/runtime-config\.js(?:\?v=[^"]+)?"/g,
          'url.pathname === "/api/runtime-config.js"'
        );
    }

    await fs.writeFile(filePath, content, "utf8");
  }
}

async function sanitizePublicIndexHtml() {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  let content = await fs.readFile(indexPath, "utf8");

  content = content
    .replace(/\s*<meta name="keywords"[^>]*>\s*/i, "\n")
    .replace(/\s*<script id="structured-data-legacy"[\s\S]*?<\/script>/, "")
    .replace(/\s*<script id="structured-data-seo-legacy"[\s\S]*?<\/script>/, "");

  await fs.writeFile(indexPath, content, "utf8");
}

async function buildFile(filename) {
  const sourcePath = path.join(ROOT, filename);
  const outputPath = path.join(ROOT, filename.replace(/\.js$/i, ".min.js"));
  const source = await fs.readFile(sourcePath, "utf8");
  const result = await esbuild.transform(source, {
    loader: "js",
    format: "iife",
    minify: true,
    legalComments: "none",
    target: "es2020"
  });

  await fs.writeFile(outputPath, result.code, "utf8");
  return outputPath;
}

async function main() {
  const built = [];
  const copied = [];

  await generateDerivedFiles();
  await ensurePublicDir();

  for (const filename of FILES) {
    built.push(await buildFile(filename));
  }

  for (const filename of STATIC_FILES) {
    copied.push(await copyFileToPublic(filename));
  }

  for (const filename of FILES.map((file) => file.replace(/\.js$/i, ".min.js"))) {
    copied.push(await copyFileToPublic(filename));
  }

  copied.push(
    await copyNodeModuleFileToPublic(
      path.join(ROOT, "node_modules", "hls.js", "dist", "hls.min.js"),
      "hls.min.js"
    )
  );

  const referenceMap = await buildPublicAssetReferenceMap();
  await rewritePublicAssetReferences(referenceMap);
  await sanitizePublicIndexHtml();

  built.forEach((file) => {
    console.log(`Built ${path.relative(ROOT, file)}`);
  });

  copied.forEach((file) => {
    console.log(`Copied ${path.relative(ROOT, file)}`);
  });
}

module.exports = {
  isProductionLikeBuild,
  getMissingRequiredBuildEnv
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
