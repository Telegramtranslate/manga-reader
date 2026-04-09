const test = require("node:test");
const assert = require("node:assert/strict");
const { decryptToken, normalizeText, uniqueStrings } = require("../scripts/_utils");

function encryptToken(token) {
  const middle = token.length / 2;
  const left = Buffer.from(token.slice(middle), "utf8").toString("base64").split("").reverse().join("");
  const right = Buffer.from(token.slice(0, middle), "utf8").toString("base64").split("").reverse().join("");
  return left + right;
}

test("uniqueStrings removes empty and duplicate values case-insensitively", () => {
  assert.deepEqual(uniqueStrings([" Isekai ", "isekai", "", null, "Drama"]), ["Isekai", "Drama"]);
});

test("normalizeText strips brackets and normalizes yo", () => {
  assert.equal(normalizeText("Наруто [ТВ-1] (2002) Ёкай"), "наруто екай");
});

test("decryptToken restores obfuscated Kodik token", () => {
  const token = "0123456789abcdef0123456789abcdef";
  assert.equal(decryptToken(encryptToken(token)), token);
});
