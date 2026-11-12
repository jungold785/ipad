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

如果 `git push` 報 `Recv failure: Connection was reset`（中國大陸連 GitHub 常見），
腳本會自動偵測本機代理（Clash／AndyVPN／v2ray 等）並改走代理推送。也可以手動指定：

```bash
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -ProxyUrl http://127.0.0.1:7890
```

略過代理用 `-NoProxy`。代理設定只寫進本倉庫的 `.git/config`，不影響其他專案。

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
weather: { city: '东阳', latitude: 29.26778, longitude: 120.22528 },
photos: { folder: 'photos', intervalMs: 3600000, shuffle: true },
night: { enabled: true, from: '22:30', to: '06:30' },
```

機器專用的設定放 `docs/config.local.js`（已被 git 忽略），會覆蓋同名項目。

### 加相片

把圖片丟進 `docs/photos/`，然後在 `docs/photos/manifest.json` 列出檔名。
建議 1024 × 768。

`manifest.json` 其實不用手動維護：`scripts/build-photo-manifest.mjs` 會掃描
`docs/photos/` 重新產生它，Actions 每次部署前都會先跑一次，所以放進去的圖片
一定會出現在輪播中。不想碰 git 的話，見「手機上載相片」一節。

### 開啟 RSS

RSS 來源多半沒送 CORS 標頭，瀏覽器讀不到，所以改由 Actions 抓取後轉成 JSON。

1. 在 `docs/config.js` 設 `rss.enabled = true` 並填 `rss.feeds`
2. 推上去，Actions 會產生 `docs/data/rss.json`

## 手機上載相片

不用再回到電腦跑 git，開一條網址就能從手機加相片：

<https://jungold785.github.io/ipad/upload.html>

**第一次要先做一件事**：到 GitHub 建立一個只給這個倉庫的細部個人存取權杖。

1. 打開 <https://github.com/settings/personal-access-tokens/new>，命名 `ipad-photos`
2. Repository access 選 **Only select repositories**，勾選 `jungold785/ipad`
3. Repository permissions 把 **Contents** 設成 **Read and write**
4. 按 Generate token，複製那串 `github_pat_` 開頭的字串

回到上載頁把令牌貼上按「儲存」。令牌只存在那部裝置的瀏覽器裡，不會進倉庫；
想全部撤銷，到 Settings → Developer settings 刪掉這個令牌就行。

接著在手機上：

- 第 2 節選相片；方向不對就勾「旋轉 90 度」
- 按「上載到相片匣」，相片會自動縮成 JPEG 再進倉庫
- 第 3 節可以看現有相片、刪掉不需要的

上載會直接 commit 到 `main`，觸發 GitHub Actions 重新部署，
大約一兩分鐘後儀表板就會換上新相片。

> 第一次上載建議在手機 Safari 打開這個網址 → **分享 → 添加到主屏幕**，
> 之後從主屏幕點進去就有專屬按鈕了。

## 在 iPad 上當擺件

1. Safari 開啟網址 → **分享 → 添加到主屏幕**
2. `设置 → 显示与亮度 → 自动锁定 → 永不`
3. `设置 → 辅助功能 → 引导式访问` 設密碼
4. 打開看板 App，**三擊主屏幕鍵**啟動引導式訪問 → 全屏

這樣螢幕會一直亮著並鎖死在看板，不會誤觸退出。

## 白天亮屏、夜間息屏

iOS 12 沒有「排程熄屏」這項功能，只有「自動鎖定」計時器。這個專案分兩層處理：

**第一層（網頁）**：`docs/config.js` 的 `night` 區段設定夜間時段，到點整個畫面淡成
黑色，外觀上就是關機了，白天自動恢復。時間跟 iPad 本機時區走。

```js
night: { enabled: true, from: '22:30', to: '06:30' },
```

**第二層（系統）**：真的要讓 iPad 熄屏，得靠 iPad 自己：

1. 白天用「引導式訪問」把畫面鎖死在看板，亮度調到 30～50%
2. 夜晚手動退出引導式訪問（三擊主畫面鍵 + 密碼），
   `设置 → 显示与亮度 → 自动锁定 → 1 分钟`，一分鐘後螢幕就熄了
3. 想全自動就用 iOS 12 的「捷徑」App：
   - 捷徑「夜間」→ 動作「設定亮度」→ 0%
   - 捷徑「白天」→ 動作「設定亮度」→ 60%
   - 自動化 → 時間 22:30 → 執行「夜間」；時間 06:30 → 執行「白天」
   - 在自動化細項裡把「執行時要顯示通知」關掉，夜里就不會被通知打擾
4. 最徹底的是用智慧插座夜間斷電（真關機、零耗電），但復電後 iPad 不會自動開機，
   早上還是要手動開機解鎖

另外記得 `设置 → 通用 → 日期与时间 → 自动设定` 要開，時間不準夜間時段就會錯位。

## 重新產生圖示與範例相片

```bash
node scripts/generate-assets.mjs
```

零依賴，用 `node:zlib` 手寫 PNG 編碼器，產出 `docs/icons/` 和範例相片。

