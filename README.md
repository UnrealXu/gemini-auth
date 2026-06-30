# Gemini Auth - Antigravity Multi-Account Profile Manager

`gemini-auth` 是一个专为 **Google Antigravity** 官方桌面客户端 (Windows) 设计的多账号分身管理与用量额度监控命令行工具 (CLI)。

通过物理隔离不同的 Chromium 用户数据目录（User Data Directory）以及自动接管并热换 Windows 系统凭据（Credential Manager），`gemini-auth` 实现了账号的一键热切换，并支持使用命令行拉起独立分身，实现**多个账号同时双开/多开**。

---

## 🌟 核心特性

1.  **物理沙盒隔离**：每个分身账号拥有独立的配置目录（包括历史对话、IDE 插件联动状态等），切换时绝对不混淆。
2.  **系统凭据自动接管**：集成 Windows 凭据管理器（Vault），在 `switch` 账号时自动保存旧账号的 OAuth 令牌，并写入新账号的令牌，确保官方 CLI (`agy`) 和 IDE 插件无缝衔接。
3.  **用量配额实时监控**：默认在列表页通过官方 Cloud Code PA 内部 API (`retrieveUserQuotaSummary`) 获取并显示各账号 **Gemini** (Pro/Flash/Thinking) 和 **Claude** (Sonnet/Opus) 的 **5小时限制 (5h)** 和 **每周限制 (Weekly)** 可用额度比例。
4.  **双模运行**：
    *   `switch`：热切换当前系统默认激活的账号（官方 App、CLI 和 VS Code 等插件都会跟随切换）。
    *   `run`：在不影响全局账号的状态下，以特定账号的独立数据路径拉起全新的 App 窗口，实现**多账号同时多开在线**。
5.  **主动安全保护**：首次使用切换时，如果默认路径存在登录会话且未备份，工具会强制引导您将其安全克隆为 `default` 分身，防止数据丢失。切换时会自动检测并安全关闭正在运行的 `Antigravity` 进程。

---

## 📦 安装方法

1.  **环境要求**：确保系统已安装 Node.js (推荐 v18+)。
2.  **克隆/下载本项目**到本地：
    ```powershell
    cd d:\EPICProject\gemini-auth
    ```
3.  **全局链接安装**：
    ```powershell
    npm link
    ```
4.  安装完成后，您可以在系统的任意终端（PowerShell / CMD）中直接运行 `gemini-auth`。

---

## 🚀 常用命令

### 1. 查看账号列表 (`list` / `ls`)
默认会实时向 Google API 查询并刷新所有已配置账号的 **订阅计划 (Plan)**、**Gemini 额度 (5h/Wk)**、**Claude 额度 (5h/Wk)**。
```powershell
gemini-auth list

# 离线或快速查看模式（不发起网络请求，只显示本地缓存额度）
gemini-auth list --no-refresh
# 或者简写
gemini-auth ls
```

### 2. 注册/登录新账号 (`add` / `login`)
创建一个新的分身账号。您可以选择性地指定别名和绑定邮箱，并决定是否导入当前默认 App 目录中已经登录的会话。
```powershell
# 交互式引导创建
gemini-auth login work

# 非交互式（适合脚本自动化，不导入当前登录态）
gemini-auth add personal --alias "个人号" --email "myemail@gmail.com" --no-import
```

### 3. 一键热切换默认账号 (`switch` / `use`)
将系统的默认账号热切换为指定的分身。此操作会保存旧账号的 Token，并将新账号的数据软链接/物理复制到官方 `%APPDATA%\Antigravity` 下。
> **注意**：切换时工具会检测并提示关闭正在运行的客户端。使用 `-f` 或 `--force` 可以跳过二次确认直接强行关闭。
```powershell
gemini-auth switch work

# 强行关闭运行中的 App 并快速切换
gemini-auth switch work -f
```

### 4. 账号多开分身运行 (`run` / `launch`)
在不改变当前系统默认账号（全局激活账号）的前提下，拉起一个专属的独立客户端窗口。
```powershell
gemini-auth run personal
```

### 5. 查看当前系统激活状态 (`status`)
查看当前全局激活的分身账号名称和详细配置路径。
```powershell
gemini-auth status
```

### 6. 安全删除账号分身 (`remove` / `rm`)
删除分身账号配置，并**彻底清空**该分身在本地保存的所有 Chromium 数据目录。
```powershell
gemini-auth remove work
```

---

## 🛠️ 技术原理与技术债

*   **OAuth 凭据存储**：通过 PowerShell 的 Windows API wrapper (`advapi32.dll!CredReadW`/`CredWriteW`)，安全地读写 Windows 本地 Generic Credentials 中的 `gemini:antigravity` 目标，实现 Token 无缝交换。
*   **Google Quota API**：模拟官方客户端的调用请求链，使用 Google 客户端 ID `1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com` 刷新 Access Token，通过 `retrieveUserQuotaSummary` 还原多层级 Quota 监控。
*   **物理换盘机制**：基于官方 Chromium 目录结构特征，主要对 `Network/Cookies` 等关键 Session 文件夹进行深度归档与备份。

---

## 📄 许可证

本项目遵循 ISC 许可证开源。
