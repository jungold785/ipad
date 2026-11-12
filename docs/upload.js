/*
 * Upload photos to the Desk photo widget, straight from the browser.
 *
 * The page talks to the GitHub REST API directly. A token is kept in
 * localStorage on this device only; it never reaches the repository.
 *
 * Every upload is one commit on main, which is what triggers the Pages
 * workflow. The workflow rebuilds docs/photos/manifest.json, so the widget
 * picks the new picture up on the next deployment.
 *
 * Browser target: Safari 12 (iPad Air 1, iOS 12.5.7).
 */

(function () {
  'use strict';

  var REPO_OWNER = 'jungold785';
  var REPO_NAME = 'ipad';
  var PHOTO_PATH = 'docs/photos';
  var API_ROOT = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME;
  var TOKEN_KEY = 'desk-upload-token';

  /* The widget renders at 2048 x 1536, so 1600 px wide is plenty and keeps
     the files small enough for a comfortable upload on mobile data. */
  var MAX_WIDTH = 1600;
  var JPEG_QUALITY = 0.82;

  var pending = [];
  var uploading = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    return node;
  }

  function getToken() {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function setToken(value) {
    try {
      window.localStorage.setItem(TOKEN_KEY, value);
    } catch (error) {
      /* Private mode: the token still works for this page load. */
    }
  }

  function clearToken() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      /* Ignore. */
    }
  }

  function setStatus(id, message, kind) {
    var node = byId(id);
    node.textContent = message || '';
    node.className = 'status' + (kind ? ' ' + kind : '');
  }

  /* ---------------------------------------------------------- GitHub API */

  function api(path, options) {
    var settings = options || {};
    var headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + getToken(),
    };

    if (settings.body) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(API_ROOT + path, {
      method: settings.method || 'GET',
      headers: headers,
      body: settings.body ? JSON.stringify(settings.body) : undefined,
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = null;
          }
        }
        if (!response.ok) {
          var message = 'HTTP ' + response.status;
          if (data && data.message) {
            message += ' · ' + data.message;
          }
          var failure = new Error(message);
          failure.status = response.status;
          throw failure;
        }
        return data;
      });
    });
  }

  /* The Contents API takes base64 content and returns the new commit. */
  function uploadFile(path, base64, message) {
    return api('/contents/' + path, {
      method: 'PUT',
      body: {
        message: message,
        content: base64,
        branch: 'main',
      },
    });
  }

  function listPhotos() {
    return api('/contents/' + PHOTO_PATH).then(function (data) {
      if (!Array.isArray(data)) {
        return [];
      }
      return data.filter(function (item) {
        return item && item.type === 'file';
      });
    });
  }

  function deleteFile(path, sha) {
    return api('/contents/' + path, {
      method: 'DELETE',
      body: {
        message: 'chore(photos): remove ' + path,
        sha: sha,
        branch: 'main',
      },
    });
  }

  /* ------------------------------------------------------ image handling */

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('讀不到這個檔案'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error('這個格式的圖片開不了（HEIC 請先在相簿轉成 JPG）'));
      };
      image.src = dataUrl;
    });
  }

  /* Reads the EXIF orientation tag so the photo is not stored sideways.
     Returns 1, 3, 6 or 8, and 1 when the file has no usable EXIF. */
  function exifOrientation(buffer) {
    var bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return 1;
    }

    var offset = 2;

    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }

      var marker = bytes[offset + 1];
      var size = (bytes[offset + 2] << 8) | bytes[offset + 3];
      var start = offset + 4;

      /* APP1 holds the Exif block. */
      if (marker === 0xe1) {
        if (start + 14 > bytes.length) {
          return 1;
        }
        if (
          bytes[start] === 0x45 &&
          bytes[start + 1] === 0x78 &&
          bytes[start + 2] === 0x69 &&
          bytes[start + 3] === 0x66
        ) {
          return parseTiff(bytes, start + 6);
        }
      }

      /* Start of scan: the image data begins, no EXIF beyond this point. */
      if (marker === 0xda) {
        return 1;
      }

      offset = start + size;
    }

    return 1;
  }

  function parseTiff(bytes, start) {
    if (start + 8 > bytes.length) {
      return 1;
    }

    var little = bytes[start] === 0x49;
    if (!little && bytes[start] !== 0x4d) {
      return 1;
    }

    function word(at) {
      return little
        ? bytes[at] | (bytes[at + 1] << 8)
        : (bytes[at] << 8) | bytes[at + 1];
    }

    function long(at) {
      if (little) {
        return (
          (bytes[at] |
            (bytes[at + 1] << 8) |
            (bytes[at + 2] << 16) |
            (bytes[at + 3] << 24)) >>>
          0
        );
      }
      return (
        ((bytes[at] << 24) |
          (bytes[at + 1] << 16) |
          (bytes[at + 2] << 8) |
          bytes[at + 3]) >>>
        0
      );
    }

    if (word(start + 2) !== 0x2a) {
      return 1;
    }

    var ifd = start + long(start + 4);
    if (ifd + 2 > bytes.length) {
      return 1;
    }

    var count = word(ifd);
    for (var index = 0; index < count; index++) {
      var entry = ifd + 2 + index * 12;
      if (entry + 12 > bytes.length) {
        return 1;
      }
      if (word(entry) === 0x0112) {
        var value = word(entry + 8);
        if (value === 3 || value === 6 || value === 8) {
          return value;
        }
        return 1;
      }
    }

    return 1;
  }

  /* Turns the EXIF orientation into a rotation in degrees. */
  function rotationFor(orientation) {
    if (orientation === 3) {
      return 180;
    }
    if (orientation === 6) {
      return 90;
    }
    if (orientation === 8) {
      return 270;
    }
    return 0;
  }

  /* Draws the source image into the canvas, scaled and rotated so it fills
     the frame the right way up. */
  function drawScaled(context, image, sourceWidth, sourceHeight, scale, degrees) {
    var radians = (degrees * Math.PI) / 180;

    if (degrees === 90) {
      context.translate(sourceHeight * scale, 0);
    } else if (degrees === 180) {
      context.translate(sourceWidth * scale, sourceHeight * scale);
    } else if (degrees === 270) {
      context.translate(0, sourceHeight * scale);
    }

    if (radians) {
      context.rotate(radians);
    }

    context.drawImage(
      image,
      0,
      0,
      sourceWidth * scale,
      sourceHeight * scale
    );
  }

  /* Downscale to the widget's width and re-encode as JPEG, which is what
     every browser can show. Returns a base64 payload without the prefix. */
  function toJpeg(image, degrees) {
    var sourceWidth = image.naturalWidth || image.width;
    var sourceHeight = image.naturalHeight || image.height;

    var swapped = degrees === 90 || degrees === 270;
    var frameWidth = swapped ? sourceHeight : sourceWidth;
    var frameHeight = swapped ? sourceWidth : sourceHeight;

    var scale = 1;
    if (frameWidth > MAX_WIDTH) {
      scale = MAX_WIDTH / frameWidth;
    }

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(frameWidth * scale);
    canvas.height = Math.round(frameHeight * scale);

    var context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    drawScaled(context, image, sourceWidth, sourceHeight, scale, degrees);
    context.restore();

    var dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  function makeName(index) {
    var stamp = new Date();
    var pad = function (value) {
      return value < 10 ? '0' + value : String(value);
    };
    var part =
      stamp.getFullYear() +
      pad(stamp.getMonth() + 1) +
      pad(stamp.getDate()) +
      '-' +
      pad(stamp.getHours()) +
      pad(stamp.getMinutes()) +
      pad(stamp.getSeconds());
    return 'img-' + part + '-' + index + '.jpg';
  }

  /* --------------------------------------------------------- the queue UI */

  function renderQueue() {
    var list = byId('queue');
    list.textContent = '';

    pending.forEach(function (item) {
      var row = el('li');
      row.appendChild(el('span', 'queue-name', item.file.name));
      row.appendChild(el('span', 'queue-size', Math.round(item.file.size / 1024) + ' KB'));
      list.appendChild(row);
    });

    byId('upload').disabled = !pending.length || uploading;
  }

  function addFiles(files) {
    var added = 0;

    Array.prototype.forEach.call(files, function (file) {
      if (!file.type || file.type.indexOf('image/') !== 0) {
        return;
      }
      pending.push({ file: file });
      added++;
    });

    renderQueue();
    if (added) {
      setStatus('upload-status', added + ' 個檔案準備好了。', 'ok');
    } else if (files.length) {
      setStatus('upload-status', '這些檔案不是圖片。', 'warn');
    }
  }

  function uploadAll() {
    if (uploading || !pending.length) {
      return;
    }
    if (!getToken()) {
      setStatus('upload-status', '先貼上令牌再上載。', 'warn');
      byId('token').focus();
      return;
    }

    uploading = true;
    renderQueue();
    setStatus('upload-status', '上載中…');

    var queue = pending.slice();
    var total = queue.length;
    var done = 0;

    function next() {
      if (!queue.length) {
        uploading = false;
        pending = [];
        renderQueue();
        setStatus(
          'upload-status',
          '完成 ' + done + ' 個檔案。等一兩分鐘重新整理儀表板就會看到。',
          'ok'
        );
        refreshPhotos();
        return;
      }

      var item = queue.shift();
      var name = makeName(done + 1);
      var extra = byId('rotate').checked ? 90 : 0;

      readAsArrayBuffer(item.file)
        .then(function (buffer) {
          var orientation = exifOrientation(buffer);
          var degrees = (rotationFor(orientation) + extra) % 360;
          var blob = new Blob([buffer], { type: item.file.type || 'image/jpeg' });
          var url = window.URL.createObjectURL(blob);

          return loadImage(url).then(function (image) {
            window.URL.revokeObjectURL(url);
            return toJpeg(image, degrees);
          });
        })
        .then(function (base64) {
          return uploadFile(
            PHOTO_PATH + '/' + name,
            base64,
            'chore(photos): add ' + name
          );
        })
        .then(function () {
          done++;
          setStatus('upload-status', '上載中… ' + done + '/' + total);
          next();
        })
        .catch(function (error) {
          uploading = false;
          renderQueue();
          setStatus('upload-status', '失敗：' + error.message, 'warn');
        });
    }

    next();
  }

  function refreshPhotos() {
    if (!getToken()) {
      setStatus('files-status', '貼上令牌後才能看到清單。', 'warn');
      return;
    }

    setStatus('files-status', '讀取中…');
    listPhotos()
      .then(function (items) {
        var list = byId('files-list');
        list.textContent = '';

        var images = items.filter(function (item) {
          return /\.(jpe?g|png|gif|webp)$/i.test(item.name);
        });

        images.forEach(function (item) {
          var row = el('li');
          row.appendChild(el('span', 'file-name', item.name));
          row.appendChild(el('span', 'file-size', Math.round(item.size / 1024) + ' KB'));

          var remove = el('button', 'btn tiny', '刪除');
          remove.addEventListener('click', function () {
            if (!window.confirm('確定刪除 ' + item.name + '？')) {
              return;
            }
            remove.disabled = true;
            deleteFile(PHOTO_PATH + '/' + item.name, item.sha)
              .then(function () {
                setStatus('files-status', '已刪除 ' + item.name, 'ok');
                refreshPhotos();
              })
              .catch(function (error) {
                remove.disabled = false;
                setStatus('files-status', '刪除失敗：' + error.message, 'warn');
              });
          });
          row.appendChild(remove);
          list.appendChild(row);
        });

        setStatus('files-status', images.length + ' 張相片。', 'ok');
      })
      .catch(function (error) {
        setStatus('files-status', '讀取失敗：' + error.message, 'warn');
      });
  }

  /* ------------------------------------------------------------- startup */

  function init() {
    var tokenField = byId('token');
    tokenField.value = getToken();

    if (getToken()) {
      setStatus('token-status', '令牌已儲存在這部裝置。', 'ok');
      refreshPhotos();
    } else {
      setStatus('token-status', '還沒有令牌。', 'warn');
    }

    byId('token-save').addEventListener('click', function () {
      var value = tokenField.value.trim();
      if (!value) {
        setStatus('token-status', '令牌不能是空的。', 'warn');
        return;
      }
      setToken(value);
      setStatus('token-status', '令牌已儲存在這部裝置。', 'ok');
      refreshPhotos();
    });

    byId('token-clear').addEventListener('click', function () {
      clearToken();
      tokenField.value = '';
      byId('files-list').textContent = '';
      setStatus('token-status', '令牌已清除。', 'ok');
    });

    byId('files').addEventListener('change', function (event) {
      addFiles(event.target.files);
      event.target.value = '';
    });

    byId('upload').addEventListener('click', uploadAll);
    byId('files-refresh').addEventListener('click', refreshPhotos);

    renderQueue();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
