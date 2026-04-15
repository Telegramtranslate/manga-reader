const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldPreferFastStart, pickPreferredQuality } = require("../app-player-utils");

test("shouldPreferFastStart prefers constrained mobile network", () => {
  assert.equal(
    shouldPreferFastStart({
      navigator: {
        connection: {
          effectiveType: "3g",
          downlink: 1.5
        }
      },
      matchMedia: () => ({ matches: true })
    }),
    true
  );
});

test("pickPreferredQuality respects current quality and mobile fallback", () => {
  assert.equal(
    pickPreferredQuality([{ key: "480" }, { key: "720" }, { key: "1080" }], "1080", {
      navigator: {},
      matchMedia: () => ({ matches: false })
    }),
    "1080"
  );

  assert.equal(
    pickPreferredQuality([{ key: "480" }, { key: "720" }], "", {
      navigator: { connection: { effectiveType: "3g" } },
      matchMedia: () => ({ matches: true })
    }),
    "480"
  );
});
