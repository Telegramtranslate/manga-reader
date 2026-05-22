const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPreviewRelease } = require("../api/_kodik");

test("buildPreviewRelease never reports fewer episodes than already published", () => {
  const preview = buildPreviewRelease([
    {
      id: "serial-62601",
      shikimori_id: "62601",
      title: "Брачный токсин",
      title_orig: "Marriagetoxin",
      type: "anime-serial",
      year: 2026,
      last_episode: 5,
      translation: {
        id: "voice-1",
        title: "AniStar",
        type: "voice"
      },
      material_data: {
        year: 2026,
        episodes_total: 1,
        episodes_aired: 5,
        anime_kind: "tv",
        anime_status: "ongoing"
      },
      link: "https://kodikplayer.com/serial/example"
    }
  ]);

  assert.equal(preview.publishedEpisode?.ordinal, 5);
  assert.equal(preview.episodesTotal, 5);
});

