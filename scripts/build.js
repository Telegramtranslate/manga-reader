const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "app-constants.js",
  "firebase-config.js",
  "cloud-sync.js",
  "app.js",
  "auth.js",
  "watch-features.js"
];

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

  for (const filename of FILES) {
    built.push(await buildFile(filename));
  }

  built.forEach((file) => {
    console.log(`Built ${path.relative(ROOT, file)}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
