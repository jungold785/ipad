# Desk

一個放在 iPad 上當桌面擺件的儀表板。目標裝置是 **2013 iPad Air（iOS 12.5.7）**，
螢幕 2048 × 1536（橫向 4:3）。

純靜態網站，**沒有建置步驟、沒有 npm 依賴**。用原生 ES Module 寫，
丟到任何靜態託管（GitHub Pages、Netlify、nginx）就能跑。

## 功能

| 模組 | 說明 | 資料來源 |
| --- | --- | --- |
| 相片 | 全出血輪播，淡入淡出 | `docs/photos/` |
| 時間 | 大字時鐘 + 日期 + 星期 | 本機 |
| 天氣 | 現況 + 未來三天預報 | Open-Meteo（免金鑰） |
| 待辦 | 可勾選、可編輯，存 localStorage | 本機 |
| GitHub | 最近提交動態 | GitHub 公開 API |
| RSS | 最新文章（可選） | Actions 產生的快取 |

## 本機預覽

不需要安裝任何東西：

```bash
python -m http.server 8000 --directory docs
```

開 <http://localhost:8000>。

改完可以先跑一次相容性檢查，確認沒有用到 iOS 12 不支援的語法：

```bash
node scripts/check-compat.mjs
```

**iPad 連同一個 Wi-Fi**，把 `localhost` 換成電腦的區域網 IP：

```bash
ipconfig        # Windows，找 IPv4 位址，例如 192.168.1.23
```

然後 iPad Safari 開 `http://192.168.1.23:8000`。

## 部署到 GitHub Pages

一條指令搞定（首次會開瀏覽器做 device login）：

```bash
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

它會依序：登入 GitHub → 提交 → 建倉庫 → 用 API 開啟 Pages（來源設為 GitHub Actions）
→ 推上去 → 觸發首次部署。

部署完網址是 `https://jungold785.github.io/ipad/`。

想看建置進度：

```bash
gh run watch --repo jungold785/ipad
```

也可以手動來：

```bash
gh auth login -h github.com
gh repo create ipad --public --source=. --remote=origin --push
```

再到 **Settings → Pages → Source** 選 **GitHub Actions**。

## 設定

所有可調項目在 `docs/config.js`：

```js
weather: { city: '香港', latitude: 22.3193, longitude: 114.1694 },
photos: { folder: 'photos', intervalMs: 20000, shuffle: true },
github: { owner: 'jungold785', repo: 'ipad', limit: 8 },
```

機器專用的設定放 `docs/config.local.js`（已被 git 忽略），會覆蓋同名項目。

### 加相片

把圖片丟進 `docs/photos/`，然後在 `docs/photos/manifest.json` 列出檔名。
建議 1024 × 768。

### 開啟 RSS

RSS 來源多半沒送 CORS 標頭，瀏覽器讀不到，所以改由 Actions 抓取後轉成 JSON。

1. 在 `docs/config.js` 設 `rss.enabled = true` 並填 `rss.feeds`
2. 推上去，Actions 會產生 `docs/data/rss.json`

## 在 iPad 上當擺件

1. Safari 開啟網址 → **分享 → 添加到主屏幕**
2. `设置 → 显示与亮度 → 自动锁定 → 永不`
3. `设置 → 辅助功能 → 引导式访问` 設密碼
4. 打開看板 App，**三擊主屏幕鍵**啟動引導式訪問 → 全屏

這樣螢幕會一直亮著並鎖死在看板，不會誤觸退出。

## 重新產生圖示與範例相片

```bash
node scripts/generate-assets.mjs
```

零依賴，用 `node:zlib` 手寫 PNG 編碼器，產出 `docs/icons/` 和範例相片。

