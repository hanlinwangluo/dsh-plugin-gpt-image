# 发布与分发

「插件 → 添加插件」支持三种来源：**npm 包名 / GitHub（或 Gitee）地址 / 本地目录**。
本文按「先发 npm，再托管到 Gitee 和 GitHub」的顺序写。

本机（Windows，DSH 桌面版）没有安装 git，也没有 npm CLI，所以下面的发布命令都走 DSH
自带的 Node + pnpm；仓库托管则全部用网页上传，不需要装 git。

---

## 0. 发布前自检

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\admin\Documents\deepseek-harness\dist\publish.ps1" -DryRun
```

脚本会检查：`private` 是否关闭、`cordis.patch.yml` 里有没有残留 `sk-` 密钥、该版本号是否已发布。
通过后再去掉 `-DryRun` 正式发布。

---

## 1. npm（已发布 1.2.0，下次发 1.3.0）

`%USERPROFILE%\.npmrc`：

```
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=npm_xxx
```

发布（开了 2FA 要带验证码）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "...\dist\publish.ps1" -Otp 123456
```

- 版本号不能复用，每次改 `package.json` 的 `version`
- 72 小时内可 `npm unpublish` 撤回，之后只能 `deprecate`
- 新账号建议开 2FA：绕过 2FA 的 token 从 2027-01 起不能直接发布

---

## 2. Gitee（国内，网页上传即可）

1. 登录 gitee.com → 右上角 **+** → **新建仓库**
   - 仓库名：`dsh-plugin-gpt-image`
   - 开源 / 公开（私有仓库别人装不了，除非配 token）
   - **不要**勾选「使用 Readme 文件初始化」（会多一个文件，后续合并麻烦）
2. 进入空仓库 → **上传文件**，把本目录下这 10 个文件按原结构放上去：
   `package.json`、`cordis.patch.yml`、`index.js`、`lib/client.js`、`icon.svg`、
   `locale/en.json`、`locale/zh.json`、`README.md`、`RELEASING.md`、`LICENSE`
   （网页上传支持一次拖多个文件；`lib/`、`locale/` 目录名要保留）
3. 提交信息写 `v1.3.0`，提交。
4. 别人即可用仓库地址安装：

```
git+https://gitee.com/<你的用户名>/dsh-plugin-gpt-image.git
```

5. 想要「单文件直链」安装：把 `dist/dsh-plugin-gpt-image-1.3.0.tgz` 也上传到仓库，
   然后取它的原始地址（形如
   `https://gitee.com/<你>/dsh-plugin-gpt-image/raw/master/dsh-plugin-gpt-image-1.3.0.tgz`），
   在「添加插件」里填这个直链。

> Gitee 网页上传对单个文件有大小限制（通常 20 MB 以内没问题，本项目最大 27 KB）。

---

## 3. GitHub（网页上传，需要能访问）

1. 登录 github.com → 右上角 **+** → **New repository**
   - Repository name：`dsh-plugin-gpt-image`
   - Public
   - **不要**勾 Add a README / .gitignore / license
2. 空仓库页面 → **uploading an existing file** → 拖入上面那 10 个文件
   （GitHub 支持直接拖文件夹，`lib/` 与 `locale/` 会自动保留）
3. Commit changes，提交信息 `v1.3.0`
4. 安装地址：

```
git+https://github.com/<你的用户名>/dsh-plugin-gpt-image.git
```

5. 发布 Release（可选）：右侧 **Releases → Create a new release**，tag 写 `v1.3.0`，
   把 `dist/dsh-plugin-gpt-image-1.3.0.tgz` 作为附件上传，得到 tgz 直链。

> 本机访问 GitHub 会被风控（`访问暂时受限`），用浏览器时关掉杀毒软件的网页防护、
> 登录账号后再操作，成功率更高；GitHub 装不了就用 Gitee，功能完全一样。

---

## 4. 后续发新版

1. 改 `package.json` 的 `version`（`1.3.1`、`1.4.0`…）并更新 README 里的版本号
2. `publish.ps1` 发 npm
3. 在 Gitee / GitHub 网页上把改动的文件重新上传（或在有 git 的机器上 push）
4. 打完 tag 后可在 Release 里附新的 tgz

---

## 5. 进社区市场索引（可选）

DSH 的可选 bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle` 提供「发现」页，
从市场索引浏览安装插件。索引是一个 `index.json`（format 1），可以自建仓库托管，
也可以给已有索引提 PR。

```json
{
  "format": 1,
  "title": { "en": "My DSH Plugins", "zh": "我的 DSH 插件" },
  "description": { "en": "…", "zh": "…" },
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
      "homepage": "https://gitee.com/<你>/dsh-plugin-gpt-image",
      "repository": { "url": "https://gitee.com/<你>/dsh-plugin-gpt-image" },
      "metadata": { "category": "tools", "keywords": ["image", "gpt-image", "text-to-image", "image-edit", "deepseek-harness"] },
      "versions": [
        {
          "version": "1.3.0",
          "publishTimestamp": 1794201600,
          "source": { "type": "git", "url": "https://gitee.com/<你>/dsh-plugin-gpt-image", "commit": "<commit sha>" },
          "engines": { "dsh": ">=0.2.1-0 <0.3.0" }
        }
      ],
      "icon": "data:image/svg+xml;base64,<base64 后的 icon.svg>"
    }
  ]
}
```

`icon` 可选（PNG/SVG 的 data URI），`publishTimestamp` 是 Unix 秒。

---

## 6. 版本与兼容

- 按 DSH `0.2.1-rc.5` 的 `ctx.tools.register` / `ctx.slots.register` 编写；
  接口变化时需要适配并调整 `engines.dsh`
- 运行时零依赖，无构建步骤，因此 git / tarball 安装都不需要 `prepare`
