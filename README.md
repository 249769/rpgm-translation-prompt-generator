# RPG Maker 翻译提示词生成器

一个本地运行的 RPG Maker MZ/MV 文本提取工具。把游戏目录里的 `data` 和 `js` 文件夹拖入网页后，它会自动筛选玩家可见文本，生成适合上传给 ChatGPT 翻译的批次文件、提示词、操作指南和术语表素材。

项目地址：

```text
https://github.com/249769/rpgm-translation-prompt-generator
```

在线使用：

```text
https://249769.github.io/rpgm-translation-prompt-generator/
```

## 功能

- 拖入 `data` 和 `js` 文件夹即可离线分析。
- 提取 RPG Maker 数据库文本、地图事件文本、公共事件文本、战斗事件文本、系统菜单术语。
- 安全提取 `js/plugins.js` 中可能显示给玩家的插件参数文本。
- 将插件源码里的日文字符串单独放入复核清单，默认不进入自动翻译批次，降低破坏游戏逻辑的风险。
- 根据内容大小自动拆分批次文件。
- 根据批次大小自动建议一次上传给 ChatGPT 的文件数量。
- 生成 ChatGPT 翻译提示词、术语表制作提示词、术语候选文件和操作指南。
- 一键下载 ZIP，里面包含所有翻译批次和说明文件。

## 使用方法

1. 打开网页。
2. 把游戏里的 `data` 文件夹和 `js` 文件夹一起拖进页面，或使用“选择文件夹/文件”按钮。
3. 点击“开始提取”。
4. 检查统计结果和建议上传数量。
5. 点击“下载翻译包 ZIP”。
6. 将 ZIP 中的 `batches/batch_001.json` 等文件上传给 ChatGPT，并配合 `prompts/chatgpt_upload_prompt.md` 使用。

## 输出内容

下载的 ZIP 包包含：

```text
batches/
  batch_001.json
  batch_002.json
manifest.json
stats.json
prompts/
  chatgpt_upload_prompt.md
  glossary_prompt.md
glossary/
  glossary_candidates.json
  glossary_seed.json
review/
  js_source_review_candidates.json
README_操作指南.md
```

## 安全策略

工具默认不会提取或翻译这些内容：

- `note` / meta 标签
- 开关名、变量名
- 事件名
- 插件源码里的解析别名
- 文件名、图片名、音频名
- 脚本代码

插件源码中的日文字符串会进入 `review/js_source_review_candidates.json`，需要人工判断后再处理。

## 本地隐私

这个网页应用完全在浏览器本地运行，不会上传你的游戏文件。只有你主动把生成的批次文件上传给 ChatGPT 时，文本才会离开本机。

## GitHub Pages

仓库推送后，可在 GitHub 仓库的 `Settings -> Pages` 中选择：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

然后访问：

```text
https://249769.github.io/rpgm-translation-prompt-generator/
```
