import { h, clear } from '../../core/dom.js';
import { read, write } from '../../core/storage.js';

var KEY = 'desk.todo';

function load() {
  var items = read(KEY, []);
  if (!Array.isArray(items)) {
    return [];
  }
  return items;
}

export var todo = {
  id: 'todo',
  area: 'side',
  grow: true,
  interval: 60 * 1000,

  mount: function (panel) {
    this.panel = panel;
    this.items = load();
    this.render();
  },

  save: function () {
    write(KEY, this.items);
  },

  render: function () {
    var panel = this.panel;
    var self = this;
    clear(panel);

    panel.appendChild(h('h2', 'panel-title', '待辦'));

    var list = h('ul', 'todo-list');
    this.items.forEach(function (item) {
      list.appendChild(self.renderItem(item));
    });
    panel.appendChild(list);

    var input = h('input', 'todo-add');
    input.type = 'text';
    input.placeholder = '新增待辦…';
    input.setAttribute('enterkeyhint', 'done');
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        var text = input.value.trim();
        if (text) {
          self.items.unshift({ id: 'i' + Date.now(), text: text, done: false });
          self.save();
          self.render();
        }
      }
    });
    panel.appendChild(input);
  },

  renderItem: function (item) {
    var self = this;
    var row = h('li', 'todo-item' + (item.done ? ' is-done' : ''));

    var box = h('div', 'todo-box', item.done ? '✓' : '');
    box.addEventListener('click', function () {
      item.done = !item.done;
      self.save();
      self.render();
    });
    row.appendChild(box);

    var text = h('div', 'todo-text', item.text);
    text.addEventListener('click', function () {
      self.editItem(row, item, text);
    });
    row.appendChild(text);

    return row;
  },

  /* Inline editing: we avoid prompt() because standalone web apps on iOS 12
   * do not reliably show it. */
  editItem: function (row, item, textNode) {
    var self = this;
    var input = h('input', 'todo-add');
    input.type = 'text';
    input.value = item.text;
    row.replaceChild(input, textNode);
    input.focus();

    function commit() {
      var value = input.value.trim();
      if (value) {
        item.text = value;
      }
      self.save();
      self.render();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault();
        input.blur();
      }
    });
  },
};

