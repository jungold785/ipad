import { h, clear, showHint } from '../../core/dom.js';

var config = (window.DESK_CONFIG && window.DESK_CONFIG.photos) || {};

function shuffle(list) {
  var copy = list.slice();
  for (var index = copy.length - 1; index > 0; index--) {
    var swap = Math.floor(Math.random() * (index + 1));
    var held = copy[index];
    copy[index] = copy[swap];
    copy[swap] = held;
  }
  return copy;
}

export var photos = {
  id: 'photos',
  area: 'main',
  interval: config.intervalMs || 20000,

  mount: function (panel) {
    panel.classList.add('photos-stage');
    this.stage = panel;
    this.index = 0;
    this.images = [];
    this.load();
  },

  load: function () {
    var self = this;
    var configured = config.files || [];

    if (configured.length) {
      this.start(configured);
      return;
    }

    var url = (config.folder || 'photos') + '/manifest.json';
    fetch(url, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (files) {
        self.start(Array.isArray(files) ? files : []);
      })
      .catch(function () {
        showHint(self.stage, '找不到 photos/manifest.json');
      });
  },

  start: function (files) {
    var self = this;
    clear(this.stage);

    if (!files.length) {
      showHint(this.stage, '相片匣是空的，加入圖片到 photos/');
      return;
    }

    var ordered = config.shuffle ? shuffle(files) : files;
    var caption = h('div', 'photos-caption');
    this.stage.appendChild(caption);
    this.caption = caption;

    ordered.forEach(function (file, index) {
      var image = new Image();
      image.src = (config.folder || 'photos') + '/' + file;
      image.alt = file;
      if (index === 0) {
        image.className = 'is-active';
      }
      self.stage.insertBefore(image, caption);
      self.images.push(image);
    });

    this.index = 0;
    this.setCaption(ordered[0]);
  },

  setCaption: function (file) {
    if (this.caption) {
      this.caption.textContent = file || '';
    }
  },

  tick: function () {
    if (this.images.length < 2) {
      return;
    }
    this.images[this.index].classList.remove('is-active');
    this.index = (this.index + 1) % this.images.length;
    this.images[this.index].classList.add('is-active');
    this.setCaption(this.images[this.index].getAttribute('alt'));
  },
};

