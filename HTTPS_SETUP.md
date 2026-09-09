# 公開部署與 HTTPS

網站現在支援真正的密碼登入。使用者資料保存在 `users.json`，密碼只以雜湊形式保存；時間表和計劃保存在 `profiles.json`。

本地測試仍可使用 `http://127.0.0.1:4173/timetable-site/index.html`。要啟用 HTTPS，先取得網域的 TLS 憑證與私密金鑰，再設定環境變數：

```powershell
$env:HTTPS_CERT_FILE = 'C:\path\fullchain.pem'
$env:HTTPS_KEY_FILE = 'C:\path\privkey.pem'
$env:SPACE_PLANNER_AUTH_SECRET = '請使用長而隨機的密鑰'
node timetable-site/server.mjs
```

之後使用 `https://你的網域:4173/timetable-site/index.html`。公開上網時，建議把網站放在有固定網域的伺服器，並由 Caddy、Nginx 或雲端平台代辦 TLS 憑證；不要把 `users.json`、`profiles.json` 或 `auth-secret.txt` 加入公開版本庫。
