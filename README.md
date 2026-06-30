# Gemini Auth - Antigravity Multi-Account Profile Manager

`gemini-auth` 是一个用于管理和切换 Google Antigravity 官方桌面客户端 (Windows) 账号的命令行工具。

因为官方客户端将所有登录会话（OAuth 凭证、Cookies）加密存储在 Chromium 用户数据目录中，直接解密 Token 极易因客户端更新而失效。因此，`gemini-auth` 通过物理隔离和管理不同的 Electron 目录，实现账号的无缝快速热切换，并支持使用命令行启动分身，实现**多账号同时在线**。

---

## 安装说明

1. 确保您的系统已安装 Node.js (推荐 v18+)。
2. 克隆或将本项目保存到本地。
3. 打开 PowerShell，进入本项目根目录：
   ```powershell
   cd d:\EPICProject\gemini-auth
   ```
4. 将该工具全局链接到系统：
   ```powershell
   npm link
   ```
5. 现在您可以在全局使用 `gemini-auth` 命令行了！

---

## 常用指令

### 1. 注册/登录新账号 (Add / Login)
创建一个新账号的分身。系统会提示您输入别名和绑定的邮箱，并询问是否导入当前客户端中已经登录的会话。
```powershell
gemini-auth add work
# 或者使用 login 别名
gemini-auth login work
```

### 2. 账号列表 (List Accounts)
展示所有已注册的账号分身，包括当前正在使用的状态（`[√]` 标记）、别名/邮箱、占用磁盘空间大小、缓存的 Gemini / Claude 额度用量，以及上次使用时间。
```powershell
gemini-auth list
# 刷新并展示最新的 Gemini / Claude 用量额度
gemini-auth list --refresh
# 或者使用简写
gemini-auth ls -r
```

### 3. 全局一键切换 (Switch Account)
热切换当前处于激活状态的账号。
> **注意**：切换时必须完全关闭正在运行的 Antigravity 客户端。工具会提示您并自动强制关闭。
```powershell
gemini-auth switch work
```

### 4. 账号多开分身 (Run Side-by-Side)
不替换当前的默认会话，直接以该分身账号的独立数据路径来多开运行 Antigravity，实现**多个账号同时多开，互不干扰**。
```powershell
gemini-auth run personal
```

### 5. 查看当前状态 (Show Status)
查看当前激活使用的账号详细配置信息。
```powershell
gemini-auth status
```

### 6. 删除账号 (Remove Profile)
删除指定的账号及其保存在本地的分身缓存数据。
```powershell
gemini-auth remove work
```

---

## 用量与配额查询说明 (Quota & Usage)

`gemini-auth` 实现了与 Google Cloud Code 官方后台配额 API 的集成，支持直接在终端中显示您的用量额度：

1. **终端实时刷新**：
   运行 `gemini-auth list --refresh`（或 `gemini-auth ls -r`），工具会读取各账号隔离目录下的凭证（Keyring Token），向 Google API 发起请求，自动查询并显示该账号 **Gemini** (Pro/Flash) 和 **Claude** (Sonnet/Opus) 模型的可用额度比例，并将其保存在本地注册表中作为缓存。
2. **官方客户端面板**：
   您也可以直接在桌面端 App 或命令行客户端中进入：**`Settings` > `Advanced Settings` > `Models`**，该面板会为您实时渲染剩余的配额倒计时和详细资源包重置时刻。
