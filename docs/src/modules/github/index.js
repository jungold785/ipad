import { h, clear, showError, showHint } from '../../core/dom.js';
import { relativeTime } from '../../core/format.js';

var config = (window.DESK_CONFIG && window.DESK_CONFIG.github) || {};

export var github = {
  id: 'github',
  area: 'strip',
  interval: 5 * 60 * 1000,

  mount: function (panel) {
    this.panel = panel;
    showHint(panel, '載入 GitHub 動態中…');
    this.refresh();
  },

  refresh: function () {
    var self = this;
    var owner = config.owner || '';
    var repo = config.repo || '';
    var limit = config.limit || 8;

    if (!owner) {
      showHint(this.panel, '在 config.js 設定 github.owner');
      return;
    }

    var commitsUrl =
      'https://api.github.com/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/commits?per_page=' +
      limit;

    fetch(commitsUrl, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) {
        if (response.status === 404) {
          showHint(self.panel, '倉庫 ' + owner + '/' + repo + ' 尚未公開');
          return null;
        }
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (commits) {
        if (commits) {
          self.renderCommits(commits);
        }
      })
      .catch(function () {
        showError(self.panel, 'GitHub 載入失敗（檢查網絡或 API 限額）');
      });
  },

  tick: function () {
    this.refresh();
  },

  renderCommits: function (commits) {
    var panel = this.panel;
    clear(panel);

    var header = h('div', 'feed-row');
    var heading = h('h2', 'panel-title', 'GitHub · ' + (config.repo || ''));
    heading.style.margin = '0';
    header.appendChild(heading);
    header.appendChild(
      h('span', 'feed-row-right', '最近 ' + commits.length + ' 次提交')
    );
    panel.appendChild(header);

    var list = h('ul', 'feed');
    commits.forEach(function (commit) {
      var row = h('li');
      row.appendChild(
        h('span', 'feed-time', relativeTime(commit.commit.author.date))
      );
      var message = h('span', 'feed-msg');
      var subject = commit.commit.message.split('\n')[0];
      message.appendChild(h('strong', null, subject));
      row.appendChild(message);
      var sha = (commit.sha || '').slice(0, 7);
      if (sha) {
        row.appendChild(h('span', 'feed-badge', sha));
      }
      list.appendChild(row);
    });
    panel.appendChild(list);
  },
};

