import { h, clear, showHint } from '../../core/dom.js';
import { relativeTime } from '../../core/format.js';

var config = (window.DESK_CONFIG && window.DESK_CONFIG.rss) || {};

export var rss = {
  id: 'rss',
  area: 'strip',
  interval: 30 * 60 * 1000,

  mount: function (panel) {
    this.panel = panel;
    if (!config.enabled) {
      showHint(panel, 'RSS 未啟用（見 config.js）');
      return;
    }
    this.refresh();
  },

  refresh: function () {
    var self = this;
    fetch('data/rss.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (payload) {
        self.render(payload);
      })
      .catch(function () {
        showHint(self.panel, '尚無 RSS 快取（等待 GitHub Actions 產生）');
      });
  },

  tick: function () {
    if (config.enabled) {
      this.refresh();
    }
  },

  render: function (payload) {
    var panel = this.panel;
    var feeds = (payload && payload.feeds) || [];
    clear(panel);

    var header = h('div', 'feed-row');
    var heading = h('h2', 'panel-title', 'RSS');
    heading.style.margin = '0';
    header.appendChild(heading);
    panel.appendChild(header);

    if (!feeds.length) {
      showHint(panel, 'RSS 快取為空');
      return;
    }

    var list = h('ul', 'feed');
    feeds.slice(0, 6).forEach(function (entry) {
      var row = h('li');
      row.appendChild(h('span', 'feed-time', relativeTime(entry.published)));
      row.appendChild(h('span', 'feed-msg', entry.title));
      list.appendChild(row);
    });
    panel.appendChild(list);
  },
};

