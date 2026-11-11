/*
 * Date and time formatting.
 *
 * We format by hand instead of using Intl: the locale data shipped with iOS 12
 * is inconsistent, and these strings are few enough to keep deterministic.
 */

var WEEKDAYS = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
];

var WEEKDAYS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

export function pad2(value) {
  return (value < 10 ? '0' : '') + value;
}

export function weekday(date) {
  return WEEKDAYS[date.getDay()];
}

export function weekdayShort(date) {
  return WEEKDAYS_SHORT[date.getDay()];
}

export function dateCn(date) {
  return (
    date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日'
  );
}

export function timeHm(date) {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

export function timeSeconds(date) {
  return pad2(date.getSeconds());
}

export function isoDate(date) {
  return (
    date.getFullYear() +
    '-' +
    pad2(date.getMonth() + 1) +
    '-' +
    pad2(date.getDate())
  );
}

export function relativeTime(value) {
  var then = new Date(value);
  if (isNaN(then.getTime())) {
    return '';
  }
  var seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 0) {
    return '剛剛';
  }
  if (seconds < 60) {
    return seconds + ' 秒前';
  }
  if (seconds < 3600) {
    return Math.floor(seconds / 60) + ' 分鐘前';
  }
  if (seconds < 86400) {
    return Math.floor(seconds / 3600) + ' 小時前';
  }
  if (seconds < 86400 * 30) {
    return Math.floor(seconds / 86400) + ' 天前';
  }
  return isoDate(then);
}

export function temperature(value, unit) {
  if (value === null || value === undefined || isNaN(value)) {
    return '--';
  }
  return Math.round(value) + '°' + (unit === 'fahrenheit' ? 'F' : 'C');
}

