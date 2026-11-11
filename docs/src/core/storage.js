/*
 * localStorage wrapper. Safari in private mode throws on write, so every
 * access is guarded and falls back to an in-memory store.
 */

var memory = {};
var usable = (function () {
  try {
    var probe = '__desk_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (error) {
    return false;
  }
})();

export function read(key, fallback) {
  try {
    var raw = usable
      ? window.localStorage.getItem(key)
      : memory[key];
    if (raw === null || raw === undefined) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

export function write(key, value) {
  var raw = JSON.stringify(value);
  try {
    if (usable) {
      window.localStorage.setItem(key, raw);
    } else {
      memory[key] = raw;
    }
  } catch (error) {
    memory[key] = raw;
  }
}

