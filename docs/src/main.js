/*
 * Desk entry point.
 *
 * Builds the layout from the widget registry, then lets every widget drive
 * itself on its own interval. A widget contract looks like:
 *
 *   {
 *     id: 'clock',
 *     area: 'side',          // main | side | strip
 *     title: '時間',          // optional panel heading
 *     interval: 1000,        // tick cadence in ms
 *     grow: true,            // fill remaining height in the side column
 *     enabled: true,         // set false to drop the widget entirely
 *     mount: function (panel) { ... },
 *     tick: function () { ... }
 *   }
 */

import { clock } from './modules/clock/index.js';
import { weather } from './modules/weather/index.js';
import { todo } from './modules/todo/index.js';
import { photos } from './modules/photos/index.js';
import { rss } from './modules/rss/index.js';

var AREAS = {
  main: 'area-main',
  side: 'area-side',
  strip: 'area-strip',
};

var WIDGETS = [photos, clock, weather, todo, rss];

/* A widget opts out by setting enabled to false, for example a feature the
   user switched off in config.js. Such a widget gets no panel at all, so it
   cannot leave an empty strip behind. */
function isEnabled(widget) {
  return !!(widget && widget.id && AREAS[widget.area] && widget.enabled !== false);
}

function buildArea(app, name) {
  var section = document.createElement('section');
  section.className = AREAS[name];
  section.setAttribute('data-area', name);
  app.appendChild(section);
  return section;
}

function buildLayout() {
  var app = document.getElementById('app');
  var areas = {};

  Object.keys(AREAS).forEach(function (name) {
    areas[name] = buildArea(app, name);
  });

  WIDGETS.forEach(function (widget) {
    if (!isEnabled(widget)) {
      return;
    }
    var panel = document.createElement('div');
    panel.className = 'panel' + (widget.grow ? ' panel-grow' : '');
    panel.id = 'panel-' + widget.id;
    areas[widget.area].appendChild(panel);
    widget.mount(panel);
  });
}

var timersStarted = false;

function startWidgets() {
  if (timersStarted) {
    /* The timers are already running, so only refresh the values. */
    WIDGETS.forEach(function (widget) {
      if (isEnabled(widget) && typeof widget.tick === 'function') {
        widget.tick();
      }
    });
    return;
  }
  timersStarted = true;

  WIDGETS.forEach(function (widget) {
    if (!isEnabled(widget)) {
      return;
    }
    if (typeof widget.tick === 'function') {
      widget.tick();
      var interval = widget.interval || 1000;
      /* Wrapped in a closure so `this` stays bound to the widget. */
      window.setInterval(function () {
        widget.tick();
      }, interval);
    }
  });
}

function boot() {
  buildLayout();
  startWidgets();
  /* Keep the clock honest when the iPad wakes from sleep. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      startWidgets();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

