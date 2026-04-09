const path = require("node:path");
const admin = require("firebase-admin");

function readArg(index, fallback = "") {
  return String(process.argv[index] || fallback).trim();
}

const DEFAULT_ADMIN_UID = "1EbxnwOUZsQkCVG04o82og4fEz32";

const uid = readArg(2, DEFAULT_ADMIN_UID);
const serviceAccountPath = readArg(3, "./service-account.json");

if (!uid) {
  console.error("Usage: node scripts/set-admin.js <UID> [path-to-service-account.json]");
  process.exit(1);
}

const resolvedServiceAccountPath = path.resolve(process.cwd(), serviceAccountPath);

let serviceAccount;
try {
  serviceAccount = require(resolvedServiceAccountPath);
} catch (error) {
  console.error(`Cannot load service account JSON: ${resolvedServiceAccountPath}`);
  console.error(error?.message || error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

admin
  .auth()
  .setCustomUserClaims(uid, {
    admin: true,
    role: "Админ"
  })
  .then(async () => {
    await admin.auth().revokeRefreshTokens(uid).catch(() => {});
    console.log(`Admin claims set for UID: ${uid}`);
    console.log("Sign out and sign in again on the site.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to set admin claims");
    console.error(error?.message || error);
    process.exit(1);
  });
