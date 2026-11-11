import { h, clear, showError, showHint } from '../../core/dom.js';
import { temperature, weekdayShort } from '../../core/format.js';

var config = (window.DESK_CONFIG && window.DESK_CONFIG.weather) || {};
var unit = config.units === 'fahrenheit' ? 'fahrenheit' : 'celsius';

/* WMO weather interpretation codes -> Chinese label and an emoji. */
var WMO = {
  0: ['晴', '☀️'],
  1: ['大部晴朗', '🌤'],
  2: ['局部多雲', '⛅️'],
  3: ['陰', '☁️'],
  45: ['霧', '🌫'],
  48: ['霜霧', '🌫'],
  51: ['毛毛雨', '🌦'],
  53: ['小雨', '🌦'],
  55: ['中雨', '🌧'],
  56: ['凍毛毛雨', '🌧'],
  57: ['凍雨', '🌧'],
  61: ['小雨', '🌦'],
  63: ['中雨', '🌧'],
  65: ['大雨', '🌧'],
  66: ['凍雨', '🌧'],
  67: ['強凍雨', '🌧'],
  71: ['小雪', '🌨'],
  73: ['中雪', '🌨'],
  75: ['大雪', '❄️'],
  77: ['雪粒', '🌨'],
  80: ['陣雨', '🌦'],
  81: ['強陣雨', '🌧'],
  82: ['暴雨', '⛈'],
  85: ['陣雪', '🌨'],
  86: ['強陣雪', '❄️'],
  95: ['雷暴', '⛈'],
  96: ['雷暴冰雹', '⛈'],
  99: ['強雷暴冰雹', '⛈'],
};

function describe(code) {
  var entry = WMO[code];
  return entry ? entry : ['--', '·'];
}

function endpoint() {
  return (
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' +
    encodeURIComponent(config.latitude) +
    '&longitude=' +
    encodeURIComponent(config.longitude) +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&timezone=auto' +
    '&forecast_days=4'
  );
}

export var weather = {
  id: 'weather',
  area: 'side',
  interval: 10 * 60 * 1000,

  mount: function (panel) {
    this.panel = panel;
    showHint(panel, '載入天氣中…');
    this.refresh();
  },

  refresh: function () {
    var self = this;
    fetch(endpoint(), { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        self.render(data);
      })
      .catch(function () {
        showError(self.panel, '天氣載入失敗（檢查網絡）');
      });
  },

  tick: function () {
    this.refresh();
  },

  render: function (data) {
    var panel = this.panel;
    clear(panel);

    var current = data.current || {};
    var info = describe(current.weather_code);

    panel.appendChild(h('div', 'weather-city', config.city || ''));

    var now = h('div', 'weather-now');
    now.appendChild(h('div', 'weather-icon', info[1]));
    now.appendChild(h('div', 'weather-temp', temperature(current.temperature_2m, unit)));
    panel.appendChild(now);

    var detail = info[0];
    if (current.apparent_temperature !== undefined) {
      detail += ' · 體感 ' + temperature(current.apparent_temperature, unit);
    }
    if (current.relative_humidity_2m !== undefined) {
      detail += ' · 濕度 ' + current.relative_humidity_2m + '%';
    }
    panel.appendChild(h('div', 'weather-desc', detail));

    var daily = data.daily || {};
    var list = h('ul', 'weather-forecast');
    var codes = daily.weather_code || [];
    var highs = daily.temperature_2m_max || [];
    var lows = daily.temperature_2m_min || [];
    var times = daily.time || [];

    for (var index = 1; index < codes.length; index++) {
      var dayInfo = describe(codes[index]);
      var item = h('li');
      var label = '今天';
      if (times[index]) {
        var parsed = new Date(times[index]);
        if (!isNaN(parsed.getTime())) {
          label = index === 1 ? '明天' : weekdayShort(parsed);
        }
      }
      item.appendChild(h('span', 'forecast-day', label));
      item.appendChild(h('span', 'forecast-icon', dayInfo[1]));
      item.appendChild(h('span', 'forecast-lo', temperature(lows[index], unit)));
      item.appendChild(h('span', 'forecast-hi', temperature(highs[index], unit)));
      list.appendChild(item);
    }

    if (list.childNodes.length) {
      panel.appendChild(list);
    }
  },
};

