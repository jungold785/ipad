import { h } from '../../core/dom.js';
import { timeHm, timeSeconds, dateCn, weekday } from '../../core/format.js';

var config = window.DESK_CONFIG || {};

export var clock = {
  id: 'clock',
  area: 'side',
  interval: 1000,

  mount: function (panel) {
    panel.classList.add('clock');

    var time = h('div', 'clock-time');
    var hm = h('span', null, '--:--');
    var seconds = h('span', 'clock-seconds');
    time.appendChild(hm);
    time.appendChild(seconds);

    var date = h('div', 'clock-date');
    var day = h('div', 'clock-weekday');

    panel.appendChild(time);
    panel.appendChild(date);
    panel.appendChild(day);

    this.hm = hm;
    this.seconds = seconds;
    this.date = date;
    this.day = day;
  },

  tick: function () {
    if (!this.hm) {
      return;
    }
    var now = new Date();
    this.hm.textContent = timeHm(now);
    this.seconds.textContent = config.showSeconds ? timeSeconds(now) : '';
    this.date.textContent = dateCn(now);
    this.day.textContent = weekday(now);
  },
};

