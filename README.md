# dsh-plugin-gpt-image

为 DeepSeek Harness 增加 **GPT 生图与改图**：两个工具 + 一个设置页。

- `image_generate`：文生图，走任意 OpenAI 兼容的 `POST /v1/images/generations`
- `image_edit`：图生图，走 multipart `POST /v1/images/edits`
- 设置页：填自己的 API 地址与密钥、测试连接、拉取模型列表、选画质/背景、看最近生成的图

默认中转 `https://ai.stjapi.com`，默认模型 `gpt-image-2.6-flare`。生成的图片写进工作区
`gpt-images/`，当前模型支持图片输入时会一并附到对话里。

- 包名：`dsh-plugin-gpt-image`　版本：`1.3.0`
- 适配：DSH `>=0.2.1-0 <0.3.0`（`engines.dsh`，不满足时安装会被明确拒绝）
- 运行时零第三方依赖，只需要 Node 内置能力

## 安装

三选一，对应「插件 → 添加插件」的输入框：

| 方式 | 填什么 |
|---|---|
| npm（已发布） | `dsh-plugin-gpt-image` |
| GitHub | `git+https://github.com/hanlinwangluo/dsh-plugin-gpt-image.git` |
| Gitee | `git+https://gitee.com/yuhanlin2026/dsh-plugin-gpt-image.git` |
| 本地目录 | 解压后该目录的绝对路径，例如 `D:\plugins\dsh-plugin-gpt-image` |

仓库：[GitHub](https://github.com/hanlinwangluo/dsh-plugin-gpt-image) ·
[Gitee](https://gitee.com/yuhanlin2026/dsh-plugin-gpt-image)

装好即生效；打开 **设置 → GPT 生图** 填自己的密钥即可。安装需要会话具备
`danger-full-access` 或一次明确批准（插件代码在 Host 进程、工作区沙箱之外执行）。

> 升级提示：若同一包名在本机跑过不带 `dsh.client` 的旧版本，Host 会缓存该包名元数据直到
> 重启，设置页不会出现；换包名安装或重启 DSH 一次即可。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| API 地址 | `https://ai.stjapi.com` | 任意 OpenAI 兼容网关 |
| API 密钥 | 空 | 只写进本机 `<profile>/gpt-image.options.json`，界面只回显后四位 |
| 模型 | `gpt-image-2.6-flare` | 可点「获取模型列表」从 `/v1/models` 拉取后选择 |
| 默认尺寸 | `1024x1024` | `1536x1024` / `1024x1536` / `auto` |
| 画质 | `auto` | `low` / `medium` / `high`，非 auto 时才发给接口 |
| 背景 | `auto` | `transparent` / `opaque`，非 auto 时才发给接口 |
| 输出目录 | `gpt-images` | 相对工作区 |

设置页另外提供：

- **测试连接**：用保存的密钥请求 `/v1/models`，返回成功或失败原因与耗时，不消耗生图额度
- **获取模型列表**：填充模型输入框的候选
- **最近生成**：缩略图网格，点开看原图（按生成时所在的工作区读取）

配置优先级：设置页/工具保存的值 → `cordis.patch.yml` 的 `config` → 环境变量
`GPT_IMAGE_API_KEY` → 内置默认值。同一个操作也能让 Agent 用 `image_configure` 改。

## 使用

- 「画一张深夜拉面店的招牌，霓虹灯，电影感」
- 「做一个 1536x1024 的极简产品横幅，主体是黑色耳机」
- 「把这张图里的纸鹤改成深蓝色」——附上图片路径，走 `image_edit`

工具参数：`prompt`（必填）、`image`（仅 `image_edit`）、`size`、`model`、`quality`、
`background`、`n`（1–4）。

## 稳定性

- 429 与 5xx 自动重试两次，遵守 `Retry-After`，退避 1s/2s
- 单次调用受 `timeoutMs`（默认 180s）约束，取消会立即中断
- 输出目录不存在时自动创建

## 已知限制

- 不导出 `Config` schema（路径软链接安装取不到 `@deepseek-ai/schemastery`），
  所以插件详情页没有自动生成的配置表单；配置在设置页与 patch 里。
- 设置页通过本机回环路由 `/gpt-image-api/*` 读写；响应不含明文密钥，写操作要求
  JSON 请求体，跨站表单无法直接利用。
- 只有当前模型路由声明支持图片输入时，图片才会作为图像块进入对话。
- 不做局部重绘遮罩（mask）与多图参考，只支持单张源图编辑。

## 文件清单

```
gpt-image/
├── package.json        # 包声明：dsh.bundle.patch + dsh.client
├── cordis.patch.yml    # 插入插件行并给出默认配置（key 留空）
├── index.js            # Host：两个图像工具、配置工具、5 条设置路由
├── lib/client.js       # Client：设置页（settings.section）
├── icon.svg            # 插件图标（自绘）
├── locale/{en,zh}.json # 插件列表标题与描述
├── README.md
├── RELEASING.md        # 发布到 npm / Gitee / GitHub 与市场索引
└── LICENSE             # MIT
```

## 许可

MIT
