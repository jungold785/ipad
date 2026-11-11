# 相片匣

把要輪播的圖片放進這個資料夾，然後在 `manifest.json` 裡列出檔名：

```json
["sample-1.png", "sample-2.png", "my-photo.jpg"]
```

`manifest.json` 就是輪播清單。改完後重新整理頁面即可生效。

建議尺寸 **1024 × 768**（4:3），跟 iPad Air 螢幕一致。

檔名不要有空格，用 `-` 代替。

也可以在 `docs/config.js` 的 `photos.files` 直接寫死清單，
或設 `photos.shuffle = false` 關掉隨機排序。

