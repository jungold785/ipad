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
      /* One hour between pictures, so the frame is calm enough to look at. */
      intervalMs: 3600000,
      shuffle: true,
      /* Explicit list; when empty the widget reads photos/manifest.json */
      files: [],
    },

    /* Night mode - the whole dashboard fades to black during these hours,
       so the frame looks switched off without touching system settings.
       Times are "HH:MM" in the device local time and may wrap past
       midnight. Set enabled to false to keep the frame lit around the
       clock. */
    night: {
      enabled: true,
      from: '22:30',
      to: '06:30',
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

