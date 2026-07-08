# 專案規則

## Git 分支規則

- **GitHub 帳號**：`goldshoot0720`（含此帳號的所有專案）
- **預設分支**：一律使用 `main`，不論本地或遠端，絕對不使用 `master`
- 初始化新 repo 時：`git init` 後立即 `git checkout -b main` 或確認 `init.defaultBranch = main`
- 推送時：`git push -u origin main`
- 不得建立或保留 `master` 分支，若意外產生須立即刪除
