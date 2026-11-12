# 相片匣

把要輪播的圖片放進這個資料夾，再把檔名列在 `manifest.json`：

```json
["sample-1.png", "sample-2.png", "my-photo.jpg"]
```

`manifest.json` 就是輪播清單。**這個檔案不用手動維護**：
`scripts/build-photo-manifest.mjs` 會掃描這個資料夾重新產生它，
GitHub Actions 每次部署都會先跑一次，所以放進去的圖片一定會出現在輪播中。

## 手機上載

不想開電腦的話，打開 `https://jungold785.github.io/ipad/upload.html`，
貼上 GitHub 令牌後就可以直接從手機選相片上載、旋轉、刪除。
細節見 README 的「手機上載相片」一節。

建議尺寸 **1024 × 768**（4:3），跟 iPad Air 螢幕一致。

檔名不要有空格，用 `-` 代替。

也可以在 `docs/config.js` 的 `photos.files` 直接寫死清單，
或設 `photos.shuffle = false` 關掉隨機排序。

