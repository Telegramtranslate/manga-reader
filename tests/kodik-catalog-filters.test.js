const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDiscoverPayload } = require("../api/_kodik");

test("buildDiscoverPayload maps alias genres to canonical Kodik labels", () => {
  const actionPayload = buildDiscoverPayload("catalog", 24, 1, "updated_at", "desc", ["\u0411\u043e\u0435\u0432\u0438\u043a"]);
  const militaryPayload = buildDiscoverPayload("catalog", 24, 1, "updated_at", "desc", ["\u0412\u043e\u0435\u043d\u043d\u044b\u0439"]);
  const joseiPayload = buildDiscoverPayload("catalog", 24, 1, "updated_at", "desc", ["\u0414\u0437\u0451\u0441\u044d\u0439"]);

  assert.equal(actionPayload.anime_genres, "\u042d\u043a\u0448\u0435\u043d");
  assert.equal(militaryPayload.anime_genres, "\u0412\u043e\u0435\u043d\u043d\u043e\u0435");
  assert.equal(joseiPayload.anime_genres, "\u0414\u0437\u0451\u0441\u044d\u0439");
});

test("buildDiscoverPayload keeps supported direct genres unchanged", () => {
  const payload = buildDiscoverPayload(
    "catalog",
    24,
    1,
    "updated_at",
    "desc",
    ["\u0418\u0437\u043e\u0431\u0440\u0430\u0437\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0435 \u0438\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u043e"]
  );

  assert.equal(payload.anime_genres, "\u0418\u0437\u043e\u0431\u0440\u0430\u0437\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0435 \u0438\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u043e");
});

test("weekly discover payload uses fresh updates, not all-time rating", () => {
  const payload = buildDiscoverPayload("weekly", 48, 1);

  assert.equal(payload.sort, "updated_at");
  assert.equal(payload.order, "desc");
  assert.equal(payload.types, "anime,anime-serial");
});

test("catalog discover payload asks Kodik for both anime formats by default", () => {
  const payload = buildDiscoverPayload("catalog", 24, 1, "updated_at", "desc");

  assert.equal(payload.types, "anime,anime-serial");
  assert.equal(payload.not_blocked_for_me, "true");
});
