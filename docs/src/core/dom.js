/*
 * Minimal DOM helpers. We avoid innerHTML for user data to keep injection
 * out of reach, and avoid any syntax Safari 12 cannot parse.
 */

export function h(tag, className, text) {
  var node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined && text !== null) {
    node.textContent = text;
  }
  return node;
}

export function panelTitle(text) {
  return h('h2', 'panel-title', text);
}

export function clear(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  return node;
}

export function showError(panel, message) {
  clear(panel);
  panel.appendChild(h('div', 'panel-error', message));
}

export function showHint(panel, message) {
  clear(panel);
  panel.appendChild(h('div', 'panel-hint', message));
}

