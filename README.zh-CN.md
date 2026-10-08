# CUA Relay

[English](README.md)

**让本机 stdio MCP 客户端使用官方 Codex Computer Use。**

CUA Relay 是一个运行在本机的 stdio MCP 兼容桥接层，面向 Claude Code、
Codex CLI、Gemini CLI 和 Kimi Code CLI。它把 Mac 上已经安装的、由 OpenAI
签名的官方 Codex Computer Use runtime 暴露为 10 个标准 MCP 工具。

CUA Relay 不是 Computer Use 引擎。它不携带或修改闭源 runtime，不运行
planner 或 subagent，不登录模型服务，不调用模型 API，也不读取模型服务商凭据。
MCP 客户端继续使用用户自己的账号和订阅。

> [!CAUTION]
> **CUA Relay 当前只有一种运行模式：Full access。**它以
> `approvalPolicy: "never"` 和 `sandbox: "danger-full-access"` 启动隔离的
> Codex app-server 上下文，并暴露全部 10 个官方工具。桥接层没有安全模式、
> App 白名单或二次确认。MCP 客户端仍可能在调用前询问用户，但工具一旦被调用，
> CUA Relay 不会再增加一层确认。只应在你愿意交给当前 Agent 操作的 Mac 和账号上
> 使用。Full access 不会绕过 macOS TCC、管理员认证、系统隐私弹窗或官方 runtime
> 自身的限制。

## 提供的能力

- 仅在本机通过标准 stdio MCP 通信，不启动网络服务。
- 只暴露官方 Codex Computer Use 的 10 个工具及其 schema。
- 为必要的 `get_app_state -> 一个动作` 保留同一个签名 runtime 会话。
- 每个 relay 进程内使用 FIFO 串行执行，避免同一客户端的并发调用交错桌面状态。
- 校验官方二进制签名、Team ID、工具清单和 schema。
- 使用隔离、无凭据、临时的 Codex app-server 上下文，并禁用模型传输。
- 官方 runtime 漂移或出现任何模型 turn 时失败关闭。
- 归一化 MCP 结果，避免不同客户端对诊断 `structuredContent` 的处理差异。

```text
Claude Code / Codex CLI / Gemini CLI / Kimi Code CLI
                         |
                   MCP over stdio
                         |
                     CUA Relay
                         |
          已校验、隔离的 Codex app-server
                         |
          官方签名的 Computer Use 组件
                         |
                    macOS App
```

完整信任边界和生命周期见[架构说明](docs/architecture.md)。

## 前置条件

- 已解锁且存在图形登录会话的 macOS。
- Node.js 22 或更高版本。
- 官方 ChatGPT macOS App 安装在 `/Applications/ChatGPT.app`，并已安装其
  Codex app-server 和 Computer Use 组件。
- 已向官方 Computer Use 组件授予 Screen Recording 和 Accessibility 权限；
  `get_app_state` 和交互调用会实际使用这些权限，`doctor` 和 `list_apps`
  不能证明两项权限都已生效。
- 一个目标本机 MCP 客户端：
  [Claude Code](docs/clients/claude-code.md)、
  [Codex CLI](docs/clients/codex-cli.md)、
  [Gemini CLI](docs/clients/gemini-cli.md) 或
  [Kimi Code CLI](docs/clients/kimi-cli.md)。

CUA Relay 不负责安装官方 runtime，也不会让某个平台的模型订阅跨平台使用。它只让
你正在使用的 MCP 客户端调用本机 Computer Use 组件。

## 安装

从源码安装：

```bash
git clone https://github.com/Zippland/cua-relay.git
cd cua-relay
npm ci
npm run build
npm link
cua-relay doctor
```

npm release 发布后，可使用等价的全局安装方式：

```bash
npm install --global cua-relay
cua-relay doctor
```

`doctor` 会检查受支持的 macOS 安装布局，并验证 Codex app-server 与 Computer
Use client 是否由预期的 OpenAI Team ID 签名。优先使用签名的
`Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，同时兼容旧版
`Resources/codex`。不使用未签名的 `codex-cli/bin/codex` 启动器。
优先路径存在但路径或签名验证失败时直接报错，不回退。
`doctor --json` 会报告所选 `codexPath` 和 `codexLayout`。
Screen Recording 和 Accessibility 权限需要通过 `get_app_state` 和交互调用确认。

输出机器可读的诊断：

```bash
cua-relay doctor --json
```

## 连接 MCP 客户端

所有客户端最终启动同一个本地命令：

```text
cua-relay serve
```

### Claude Code

```bash
claude mcp add --transport stdio --scope user cua-relay -- cua-relay serve
claude mcp get cua-relay
claude mcp list
```

### Codex CLI

```bash
codex mcp add cua-relay -- cua-relay serve
codex mcp get cua-relay
codex mcp list
```

### Gemini CLI

```bash
gemini mcp add --scope user --transport stdio cua-relay cua-relay serve
gemini mcp list
```

除非你明确希望 Gemini CLI 跳过自身的工具确认，否则不要增加 `--trust`。

### Kimi Code CLI

```bash
kimi mcp add --transport stdio cua-relay -- cua-relay serve
kimi mcp test cua-relay
kimi mcp list
```

除非你明确希望 Kimi Code CLI 自动批准 MCP 工具调用，否则不要使用 YOLO 或 AFK
模式。

如果启动客户端的环境找不到 `cua-relay`，可以直接使用源码构建产物：

```text
command: node
args: /absolute/path/to/cua-relay/dist/src/cli.js serve
```

各客户端的完整配置和验证步骤位于 [`docs/clients`](docs/clients)。

## 工具

CUA Relay 不添加自定义 MCP 工具：

| 工具 | 用途 |
| --- | --- |
| `list_apps` | 列出正在运行和最近使用的 App。 |
| `get_app_state` | 返回关键窗口截图和 accessibility tree。 |
| `click` | 按 accessibility 元素或截图坐标点击。 |
| `perform_secondary_action` | 调用辅助功能元素的次要动作。 |
| `set_value` | 给可设置的辅助功能元素赋值。 |
| `select_text` | 选择文字或放置文本光标。 |
| `scroll` | 滚动辅助功能元素。 |
| `drag` | 在截图坐标之间拖动。 |
| `press_key` | 发送按键或组合键。 |
| `type_text` | 输入原样文字。 |

工具 metadata 来自官方 contract。其中 `destructiveHint: false` 不是安全保证：
输入、点击或按键仍可能在目标 App 中提交、发送、覆盖或删除数据。

## 必须遵守的调用顺序

每次交互都应：

1. 对目标 App 调用 `get_app_state`。
2. 检查返回的截图和 accessibility tree。
3. 在 120 秒内对同一个 App 最多执行一个动作。
4. 下一个动作前再次调用 `get_app_state`。

一次动作会消费当前状态租约。切换 App、状态过期、新的 `get_app_state`、
`list_apps`、错误或客户端退出都会关闭保留的 runtime 会话。这一约束会主动拒绝
基于陈旧 UI 的连续动作。

## 隐私与安全

CUA Relay 自身不登录模型服务，也不向模型 API 发送请求。它创建不含用户凭据的
私有临时 Codex home，禁用模型传输，并拒绝任何检测到的模型 turn。

Computer Use 的结果不同：截图和 accessibility 文本会返回给发起调用的 MCP
客户端，该客户端可能把它们发送给用户所配置的模型服务。应把屏幕上的可见内容视为
可能通过客户端离开设备的数据。

CUA Relay 不持久化截图、accessibility tree、输入文字或工具结果。网页、消息、
文档和 App UI 可能包含 prompt injection。执行发送、提交、删除、上传、购买或修改
账号设置前，应重新读取状态并核对目标。

使用前请阅读[安全模型](docs/security-model.md)和[安全政策](SECURITY.md)。

## 兼容性与限制

- 仅支持 macOS，不支持 Windows 或 Linux。
- 本机必须保持解锁。
- 只有一个后端：本机安装的官方 Codex Computer Use runtime。
- 不提供远程桌面、无头自动化、宏、录制回放、planner 或多后端抽象。
- runtime 或 schema 漂移时失败关闭，不做猜测性兼容。
- 客户端认证、模型选择、计费和订阅额度完全由客户端负责。

详见[兼容性](docs/compatibility.md)和[故障排查](docs/troubleshooting.md)。

## 开发

```bash
npm ci
npm run check
npm test
npm run pack:check
```

托管 CI 使用 fake backend，不会操作真实桌面。真实 GUI smoke test 必须在已解锁的
本机 Mac 上由操作者明确监督。

## 独立性与许可证

CUA Relay 是独立开源项目，不是 OpenAI 产品，也不隶属于 OpenAI 或得到其背书。
Codex、ChatGPT 和 Computer Use 仍分别受其自身条款约束。

本仓库使用 MIT License。部分桥接代码基于 MIT 许可的
[`tmustier/codex-computer-use-mcp`](https://github.com/tmustier/codex-computer-use-mcp)
改编。详见[第三方声明](THIRD_PARTY_NOTICES.md)和[来源记录](docs/provenance.md)。
