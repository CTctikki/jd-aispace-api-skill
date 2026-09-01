# JD AISpace API Skill

面向京东商家的 Codex Skill 与本地 API 网关，用于无界面发现、调用和维护京麦「AI 经营中心」工具。它不模拟鼠标键盘，不抢占商家正在使用的界面。

> 非京东官方 SDK。后台接口可能变化，仅用于调用者本人有权访问的商家账号与数据。请遵守平台规则，不要共享登录态或绕过权限控制。

## 当前支持

| 能力 | 状态 |
| --- | --- |
| 动态发现 AI 经营中心工具目录 | 已支持 |
| 已识别 6 类、26 个工具的基础目录 | 已支持 |
| 4 个官方商品工作流元数据与 AG-UI 流协议 | 已支持 |
| 商详信息 AI 全巡检自动启动、提交、结果重放 | 已支持 |
| 巡检 Excel 下载及安全字段结构化 | 已支持 |
| 未验证工具的自动执行 | 不支持，避免猜测参数 |

## 安装为 Codex Skill

```powershell
git clone https://github.com/CTctikki/jd-aispace-api-skill.git "$env:USERPROFILE\.codex\skills\jd-aispace-api-skill"
cd "$env:USERPROFILE\.codex\skills\jd-aispace-api-skill"
python -m pip install -r requirements.txt
npm test
```

之后可直接向 Codex 提出：

```text
使用 $jd-aispace-api-skill，通过我的京麦登录态执行商详信息 AI 全巡检，检查指定 SKU 的“7天无理由退货”。
```

## 启动网关

使用一个已登录但当前未运行的京麦 Chrome 用户数据目录：

```powershell
$env:AISPACE_GATEWAY_TOKEN = "请设置随机本地令牌"
$env:AISPACE_CHROME_USER_DATA_DIR = "C:\path\to\merchant-profile"
$env:AISPACE_CHROME_PROFILE_NAME = "Default"
npm start
```

网关默认监听 `http://127.0.0.1:17321`。请勿把 Cookie、令牌或本机用户目录提交到仓库。

## 调用全巡检

```powershell
$headers = @{ Authorization = "Bearer $env:AISPACE_GATEWAY_TOKEN" }
$body = @{
  confirm = $true
  input = @{
    skuIds = @("12345678901234")
    inspectText = "7天无理由退货"
    terminalTypes = @("APP")
    locations = @("BeltImage", "Title", "ActivityTag", "ServiceTag")
    timeoutMs = 600000
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod http://127.0.0.1:17321/v1/workflows/product-detail-inspection `
  -Method Post -Headers $headers -ContentType application/json -Body $body
```

返回包含任务状态、文字摘要、结构化巡检行和原始 Excel 地址。完整接口见 [`references/api.md`](references/api.md)。

## 跟踪 AISpace 更新

运行 `npm run catalog:check` 检查工具目录变化。确认协议并通过测试后，运行 `npm run catalog:update` 更新公开基线。详细流程见 [`references/maintenance.md`](references/maintenance.md)。

## 安全设计

- 默认只监听本机回环地址，并支持 Bearer Token。
- 执行类接口强制要求 `confirm=true`。
- 登录 Cookie 仅在内存中按域名短期缓存，不写入结果或日志。
- 公开响应会移除身份与认证字段。
- 报告解析只保留 SKU、终端、巡检位置和命中结果。

## 开发

```powershell
npm test
$env:PYTHONUTF8 = "1"
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" .
```

欢迎通过 Issue 提交新工具名称、公开页面信息和脱敏后的错误现象。请勿提交 Cookie、账号、店铺 ID、任务 ID 或完整抓包。
