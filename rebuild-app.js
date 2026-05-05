#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function rebuildApp() {
  const appPath = path.join(__dirname, 'app.js');
  const minPath = path.join(__dirname, 'app.min.js');
  
  const source = fs.readFileSync(appPath, 'utf8');
  const result = await esbuild.transform(source, {
    loader: 'js',
    format: 'iife',
    minify: true,
    legalComments: 'none',
    target: 'es2020'
  });
  
  fs.writeFileSync(minPath, result.code, 'utf8');
  console.log('Built app.min.js');
  
  // Also update public folder if it exists
  const publicMinPath = path.join(__dirname, 'public', 'app.min.js');
  if (fs.existsSync(path.dirname(publicMinPath))) {
    fs.writeFileSync(publicMinPath, result.code, 'utf8');
    console.log('Copied to public/app.min.js');
  }
}

rebuildApp().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
