# 游戏文本翻译提示词生成器

一个本地运行的网页工具，用来从 RPG Maker MZ/MV 与 Unity 游戏中提取可翻译文本，并生成适合上传给 ChatGPT 的批次文件、提示词、操作指南和术语表素材。

项目地址：

```text
https://github.com/249769/rpgm-translation-prompt-generator
```

在线使用：

```text
https://249769.github.io/rpgm-translation-prompt-generator/
```

打包下载：

```text
https://github.com/249769/rpgm-translation-prompt-generator/releases/latest/download/RPGMTranslationPromptGenerator.zip
```

## 功能

- 支持 RPG Maker MZ/MV：拖入 `data` 和 `js` 文件夹，提取玩家可见文本。
- 支持 Unity / XUnity AutoTranslator：拖入游戏根目录，提取 `*_Data`、`AutoTranslator` 和根目录 `.txt` 中的可翻译内容。
- 修复文件夹拖拽：支持把整个文件夹直接拖到页面，递归读取内部文件。
- 根据内容大小自动拆分 `batches/batch_XXX.json`。
- 根据批次大小自动建议一次上传给 ChatGPT 的文件数量。
- 生成 ChatGPT 翻译提示词、术语表制作提示词、术语候选文件、复核清单和操作指南。
- 一键下载 ZIP，所有处理都在浏览器本地完成。

## RPG Maker 需要丢入什么

推荐直接拖入游戏根目录，或至少拖入：

```text
data/
js/
```

工具会处理：

- `data/*.json`
- `js/plugins.js`
- `js/plugins/*.js`

默认跳过 `note`、脚本、开关变量名、事件名、文件名、图片名、音频名、URL 和插件源代码逻辑。

## Unity 需要丢入什么

推荐直接拖入 Unity 游戏根目录。至少需要：

```text
游戏名_Data/
```

建议同时包含：

```text
AutoTranslator/
readme.txt
攻略提示.txt
Installation Instructions.txt
```

Unity 模式会读取：

- `*_Data/level*`
- `*_Data/*.assets`
- `*_Data/Managed/Assembly-CSharp.dll`
- `AutoTranslator/Translation/*/Text/*.txt`
- 根目录普通 `.txt` 文档

默认跳过：

- `*.resS`
- `*.resource`
- 图片、音频、视频
- `exe`
- Unity 引擎 XML 文档
- 明显路径、资源名、配置项

二进制资源里不确定的字符串会进入 `review/binary_string_review_candidates.json`，不会直接进入主翻译批次。

## 使用方法

1. 打开网页。
2. 在“游戏类型”里选择 RPG Maker 或 Unity。
3. 把对应游戏文件夹拖进页面，或使用“选择文件夹”按钮。
4. 点击“开始提取”。
5. 检查统计结果和建议上传数量。
6. 点击“下载翻译包 ZIP”。
7. 复制 `prompts/chatgpt_upload_prompt.md` 的内容给 ChatGPT。
8. 按建议上传 `batches/batch_001.json` 等批次文件。

## 输出内容

下载的 ZIP 包包含：

```text
batches/
  batch_001.json
  batch_002.json
manifest.json
stats.json
all_translatable_items.json
prompts/
  chatgpt_upload_prompt.md
  glossary_prompt.md
glossary/
  glossary_candidates.json
  glossary_seed.json
review/
  js_source_review_candidates.json 或 binary_string_review_candidates.json
README_操作指南.md
```

## 本地隐私

这个网页应用完全在浏览器本地运行，不会上传你的游戏文件。只有你主动把生成的批次文件上传给 ChatGPT 时，文本才会离开本机。
