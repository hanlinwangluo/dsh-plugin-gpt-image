# 发布与分发

当前状态：

| 渠道 | 状态 |
|---|---|
| GitHub | 已上传，`main` 分支最新提交 `v1.3.3` |
| Gitee | 待「导入 GitHub 仓库」镜像 |
| npm | 已发布 `1.2.0`；`1.3.3` 待发布 |

仓库地址：

- GitHub：https://github.com/hanlinwangluo/dsh-plugin-gpt-image
- Gitee：https://gitee.com/yuhanlin2026/dsh-plugin-gpt-image

「插件 → 添加插件」支持三种来源，对应下表：

| 来源 | 填什么 |
|---|---|
| npm 包名 | `dsh-plugin-gpt-image` |
| GitHub | `git+https://github.com/hanlinwangluo/dsh-plugin-gpt-image.git` |
| Gitee | `git+https://gitee.com/yuhanlin2026/dsh-plugin-gpt-image.git` |
| 本地目录 | 解压后目录的绝对路径 |

---

## 1. npm

`%USERPROFILE%\.npmrc`：

```
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=npm_xxx
```

发布（开了 2FA 带验证码）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\admin\Documents\deepseek-harness\dist\publish.ps1" -Otp 123456
```

- `publish.ps1` 会先自检：`private`、`cordis.patch.yml` 里的 `sk-` 残留、版本号是否已发布
- 版本号不可复用，每次改 `package.json` 的 `version`
- 72 小时内可 `npm unpublish` 撤回，之后只能 `deprecate`
- 新账号建议开 2FA：绕过 2FA 的 token 从 2027-01 起不能直接发布

## 2. Gitee（从 GitHub 导入，一次搞定）

1. gitee.com → **+ → 新建仓库**
2. 页面右上角「在其他网站已经有仓库了吗？点击导入」
3. 选 **GitHub**，授权后填 `https://github.com/hanlinwangluo/dsh-plugin-gpt-image`
4. 导入完成，代码自动镜像；之后在仓库「设置 → 仓库镜像管理」里可开启自动同步

> 账号安全等级不足时 Gitee 会拦「发布公开内容」：先绑定 GitHub / 微信 / QQ，或开启两步验证。

若导入不可用，也可以手动传 11 个文件（`package.json`、`cordis.patch.yml`、`index.js`、
`icon.svg`、`README.md`、`RELEASING.md`、`LICENSE`、`.gitignore`、`lib/client.js`、
`locale/en.json`、`locale/zh.json`），注意 `package.json` 必须在仓库根目录。

## 3. GitHub 更新

本机没有 git，更新走 GitHub API（`dist/gh-upload.cjs`，原理：blob → tree → commit → 移动
`refs/heads/main`）。需要一枚 fine-grained token：

1. https://github.com/settings/personal-access-tokens/new
2. Repository access → Only select repositories → `dsh-plugin-gpt-image`
3. Permissions → Repository permissions → **Contents: Read and write**
4. 生成后 `$env:GH_TOKEN='github_pat_...'`，运行脚本，用完删除 token

也可以在网页上传：`https://github.com/hanlinwangluo/dsh-plugin-gpt-image/upload/main`。

发布 Release：仓库右侧 **Releases → Create a new release**，tag 写 `v1.3.3`，把
`dist/dsh-plugin-gpt-image-1.3.3.tgz` 作为附件上传，得到可直接安装的 tgz 直链。

## 4. 后续发新版

1. 改 `package.json` 的 `version`（`1.3.3`、`1.4.0`…）并同步 README 里的版本号
2. `publish.ps1` 发 npm
3. 用 `gh-upload.cjs`（或网页上传）把改动的文件推到 GitHub；Gitee 镜像会自动同步
4. 打 tag / 发 Release，附新的 tgz

## 5. 进社区市场索引（可选）

DSH 的可选 bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle` 提供「发现」页，
从市场索引浏览安装插件。索引是一个 `index.json`（format 1），建议单独建一个仓库托管，
例如 `dsh-plugins-index`，里面放：

```json
{
  "format": 1,
  "title": { "en": "hanlinwangluo DSH plugins", "zh": "hanlinwangluo 的 DSH 插件" },
  "description": { "en": "DSH plugins by hanlinwangluo.", "zh": "hanlinwangluo 维护的 DSH 插件。" },
  "metadata": {
    "categories": { "tools": { "title": { "en": "Tools", "zh": "工具" } } },
    "labels": {},
    "sortKeys": {}
  },
  "plugins": [
    {
      "name": "dsh-plugin-gpt-image",
      "title": { "en": "GPT Image", "zh": "GPT 生图" },
      "description": {
        "en": "Text-to-image and image editing through any OpenAI-compatible images API, with an in-app settings page, connection test, model picker, and gallery.",
        "zh": "通过任意 OpenAI 兼容生图接口出图与改图，设置页里填自己的地址与密钥，支持测试连接、拉取模型、查看最近生成。"
      },
      "homepage": "https://github.com/hanlinwangluo/dsh-plugin-gpt-image",
      "repository": { "url": "https://github.com/hanlinwangluo/dsh-plugin-gpt-image" },
      "metadata": { "category": "tools", "keywords": ["image", "gpt-image", "text-to-image", "image-edit", "deepseek-harness"] },
      "versions": [
        {
          "version": "1.3.3",
          "publishTimestamp": 1794201600,
          "source": { "type": "git", "url": "https://github.com/hanlinwangluo/dsh-plugin-gpt-image", "commit": "<该版本的 commit sha>" },
          "engines": { "dsh": ">=0.2.1-0 <0.3.0" }
        }
      ],
      "icon": "data:image/svg+xml;base64,<base64 后的 icon.svg>"
    }
  ]
}
```

`icon` 可选（PNG/SVG 的 data URI），`publishTimestamp` 是 Unix 秒，`name` 必须与 npm 包名一致。

## 6. 版本与兼容

- 按 DSH `0.2.1-rc.5` 的 `ctx.tools.register` / `ctx.slots.register` 编写；接口变化时需适配并调整 `engines.dsh`
- 运行时零依赖、无构建步骤，git / tarball 安装都不需要 `prepare`
