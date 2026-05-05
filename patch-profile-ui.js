const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Fix 1: Profile user meta overflow (long email)
css = css.replace(
  /\.profile-user__meta \{\s*display: grid;\s*gap: 6px;\s*\}/,
  `.profile-user__meta {
  display: grid;
  gap: 6px;
  min-width: 0;
}`
);

css = css.replace(
  /\.profile-user__meta span \{\s*color: var\(--muted\);\s*\}/,
  `.profile-user__meta span {
  color: var(--muted);
  word-break: break-all;
  white-space: normal;
}`
);

// Fix 2: Settings toggle text overflow
css = css.replace(
  /\.settings-toggle span \{\s*display: grid;\s*gap: 4px;\s*\}/,
  `.settings-toggle span {
  display: grid;
  gap: 4px;
  min-width: 0;
}`
);

// Fix 3: Admin actions ghost buttons text cutoff
// We append the new CSS rule right after .admin-actions block
css = css.replace(
  /\.admin-actions \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*gap: 12px;\s*margin-top: 14px;\s*\}/,
  `.admin-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.admin-actions .ghost-btn {
  white-space: normal;
  height: auto;
  min-height: 42px;
  line-height: 1.35;
  padding-top: 10px;
  padding-bottom: 10px;
}`
);

fs.writeFileSync('style.css', css);
console.log('Profile UI patched successfully.');
