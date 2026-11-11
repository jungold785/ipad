/*
 * Desk configuration.
 *
 * This file is served to the browser, so it must stay free of secrets.
 * Put anything private in config.local.js (git-ignored) and read it from here.
 */
(function () {
  var local = window.DESK_CONFIG_LOCAL || {};

  window.DESK_CONFIG = {
    /* Clock and date */
    timezone: 'Asia/Hong_Kong',
    showSeconds: true,

    /* Weather - Open-Meteo needs no API key and allows cross-origin requests. */
    weather: {
      city: '香港',
      latitude: 22.3193,
      longitude: 114.1694,
      units: 'celsius',
    },

    /* Photo slideshow - drop images into docs/photos/ */
    photos: {
      folder: 'photos',
      intervalMs: 20000,
      shuffle: true,
      /* Explicit list; when empty the widget reads photos/manifest.json */
      files: [],
    },

    /* GitHub activity - public API, no token, 60 requests/hour per IP */
    github: {
      owner: 'jungold785',
      repo: 'ipad',
      limit: 8,
    },

    /* RSS - fetched server-side by scripts/fetch-rss.mjs, see README */
    rss: {
      enabled: false,
      feeds: [],
    },
  };

  /* Shallow-merge local overrides so users can tweak without touching git. */
  Object.keys(local).forEach(function (key) {
    var value = local[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      window.DESK_CONFIG[key] = Object.assign({}, window.DESK_CONFIG[key], value);
    } else {
      window.DESK_CONFIG[key] = value;
    }
  });
})();

