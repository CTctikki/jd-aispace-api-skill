# JD AISpace API Skill

面向京东商家的 Codex Skill 与本地 API 网关，用于无界面发现、调用和维护京麦「AI 经营中心」工具。它不模拟鼠标键盘，不抢占商家正在使用的界面。

> 非京东官方 SDK。后台接口可能变化，仅用于调用者本人有权访问的商家账号与数据。请遵守平台规则，不要共享登录态或绕过权限控制。

## 当前支持

| 能力 | 状态 |
| --- | --- |
| 动态发现官方工具、官方专家、已购服务和自建 Flow | 已支持 |
| 历史任务查询及工作流结果引用恢复 | 已支持（只读） |
| 已识别 6 类、26 个工具及真实服务代码 | 已支持 |
| 机器可读能力清单与精确网关端点 | 已支持（4 个一键、4 个写入计划、18 个元数据） |
| 京麦服务市场工具搜索与精确匹配 | 已支持（公开只读接口） |
| 第三方工具公开详情与细分能力清单 | 已支持（匿名只读，18 个工具有基线） |
| 服务订购/使用权限状态查询 | 已支持（登录后只读、身份脱敏） |
| 已开通服务的启动上下文预检 | 已支持（需确认、仅返回域名与参数名，不返回签名值） |
| 4 个官方商品工作流元数据与 AG-UI 流协议 | 已支持 |
| 商详信息 AI 全巡检自动启动、提交、结果重放 | 已支持 |
| 商详主图 AI 巡检自动执行与报告解析 | 已支持 |
| 商品主图批量下载与图片链接提取 | 已支持 |
| AI 商机情报问答与流式结果汇总 | 已支持 |
| AI 商品信息托管配置查询 | 已支持（只读） |
| AI 评价回复托管状态、协议、语气和长度选项查询 | 已支持（只读） |
| 批量报名预约活动模板、参数查询与本地 XLSX 预检 | 已支持（只读） |
| 主推商品 AI 打标 | 参数校验与只读执行计划已支持；真实执行待授权验证 |
| 商品信息/评价回复托管 | 配置查询与只读变更计划已支持；真实启停待授权验证 |
| 批量报名预约活动 | 模板、XLSX 预检与只读提交计划已支持；真实提交待授权验证 |
| 7 个第三方 Flow 工具 | 服务代码与类型已识别；需先订购/授权并验证各自输入协议 |
| 11 个第三方独立应用 | 服务代码与类型已识别；需先订购/授权并适配服务商接口 |
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
使用 $jd-aispace-api-skill，通过我的京麦登录态执行商详主图 AI 巡检，检查指定 SKU 的第一张 APP 主图是否含“京喜自营”。
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

## 调用示例

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

`GET /v1/tools` 和 `GET /v1/services` 会为每个已适配工具返回 `gatewayActions`，明确列出方法、路径、调用模式以及是否要求 `confirm=true`。当前汇总为 4 个 `one_click_ready`、4 个 `write_plan_ready`、18 个 `metadataOnly`。

其他已验证的一键接口：

- `POST /v1/workflows/main-image-inspection`
- `POST /v1/workflows/image-download`
- `POST /v1/workflows/main-recommendation-label/plan`（仅校验输入并返回脱敏执行计划）
- `POST /v1/business-opportunity/ask`
- `POST /v1/workflows/result`（只读结果回放）
- `GET /v1/tasks`（只读任务历史，可恢复工作流 `threadId/runId`）
- `GET /v1/marketplace/search?query=工具名`（公开服务市场精确检索，不使用店铺 Cookie）
- `GET /v1/marketplace/services/FW_GOODS-...`（公开服务详情、端支持与细分能力）
- `GET /v1/services/access?serviceCode=FW_GOODS-...`（只返回脱敏后的可用状态和操作类型）
- `POST /v1/services/launch`（仅对已开通服务准备启动上下文；要求 `confirm=true`，不会订购或自动授权）

托管配置可通过 `GET /v1/hosting/:type` 查询，变更计划使用 `POST /v1/hosting/:type/plan`；活动模板、文件预检和提交计划分别使用 `GET /v1/activity-signup/schema`、`POST /v1/activity-signup/validate` 与 `POST /v1/activity-signup/plan`。所有 `plan` 接口都不会创建任务或修改店铺。完整接口见 [`references/api.md`](references/api.md)。

## 跟踪 AISpace 更新

运行 `npm run marketplace:check` 校验 18 个第三方工具的公开服务代码，运行 `npm run marketplace:details:check` 校验公开功能清单，运行 `npm run official-protocols:check` 校验三个官方写能力的公开前端协议指纹，再运行 `npm run catalog:check` 检查登录后目录变化。获得明确授权后的脱敏协议证据先用 `npm run trace:verify -- <trace.json>` 校验；确认协议并通过测试后，才可实现写适配并更新公开基线。详细流程见 [`references/maintenance.md`](references/maintenance.md)。

## 安全设计

- 默认只监听本机回环地址，并支持 Bearer Token。
- 执行类接口强制要求 `confirm=true`。
- 登录 Cookie 仅在内存中按域名短期缓存，不写入结果或日志。
- 公开响应会移除身份与认证字段。
- 服务启动响应仅保留目标域名和查询参数名，不返回签名、授权码、状态值或原始 URL；原始 DSM 操作不通过 HTTP 暴露。
- 报告解析只保留 SKU、终端、巡检位置和命中结果。
- 持续托管、商品打标和活动报名等写操作在真实验证前不会标记为可用。

## 开发

```powershell
npm test
$env:PYTHONUTF8 = "1"
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" .
```

欢迎通过 Issue 提交新工具名称、公开页面信息和脱敏后的错误现象。请勿提交 Cookie、账号、店铺 ID、任务 ID 或完整抓包。
