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
    timezone: 'Asia/Shanghai',
    showSeconds: true,

    /* Weather - Open-Meteo needs no API key and allows cross-origin requests.
       Coordinates come from the Open-Meteo geocoder. */
    weather: {
      city: '东阳',
      latitude: 29.26778,
      longitude: 120.22528,
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

