(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    dropZone: $("dropZone"),
    folderInput: $("folderInput"),
    fileInput: $("fileInput"),
    runButton: $("runButton"),
    downloadButton: $("downloadButton"),
    clearButton: $("clearButton"),
    copyPromptButton: $("copyPromptButton"),
    contextLines: $("contextLines"),
    targetKb: $("targetKb"),
    uploadKb: $("uploadKb"),
    fileCount: $("fileCount"),
    candidateCount: $("candidateCount"),
    batchCount: $("batchCount"),
    status: $("status"),
    summaryList: $("summaryList"),
    uploadAdvice: $("uploadAdvice"),
    preview: $("preview")
  };

  const JP_RE = /[\u3040-\u30ff\u3400-\u9fff]/;
  const MAP_FILE_RE = /^Map\d+\.json$/;
  const FILE_NAME_RE = /\.(png|jpe?g|webp|gif|ogg|m4a|wav|json|js|rpgmvp|rpgmvo)$/i;
  const INTERNAL_URL_RE = /:\/\//;
  const CONTROL_RE = /(%\d+|\\[A-Za-z]+(?:\[[^\]]*\])?|\\[{}.$|!><^]|_[A-Za-z][A-Za-z0-9_]*)/g;

  const DATABASE_FIELDS = {
    "Actors.json": ["name", "nickname", "profile"],
    "Armors.json": ["name", "description"],
    "Classes.json": ["name"],
    "Enemies.json": ["name"],
    "Items.json": ["name", "description"],
    "Skills.json": ["name", "description", "message1", "message2"],
    "States.json": ["name", "message1", "message2", "message3", "message4"],
    "Weapons.json": ["name", "description"]
  };

  const SYSTEM_VISIBLE_PATHS = [
    ["gameTitle"],
    ["currencyUnit"],
    ["armorTypes"],
    ["elements"],
    ["equipTypes"],
    ["skillTypes"],
    ["weaponTypes"],
    ["terms", "basic"],
    ["terms", "commands"],
    ["terms", "params"],
    ["terms", "messages"]
  ];

  const PLUGIN_VISIBLE_KEYS = new Set([
    "text",
    "message",
    "caption",
    "label",
    "help",
    "title",
    "description",
    "buttonText",
    "displayText"
  ]);

  const GLOSSARY_SEED = {
    "レイニア": "蕾妮娅",
    "ピート": "皮特",
    "プリシア": "普莉希娅",
    "ゲイル": "盖尔",
    "ミシェル": "米歇尔",
    "アルベール": "阿尔贝尔",
    "ケイシー": "凯西",
    "エリオット": "艾略特",
    "ローザ": "罗莎",
    "ルシアン": "露西安",
    "ミアナ": "米娅娜",
    "スライア": "斯莱娅",
    "セレスティア": "塞蕾丝蒂娅",
    "ナーガリア": "娜迦莉娅",
    "マリエル": "玛丽埃尔",
    "タビノ": "塔比诺",
    "エルドリス": "埃尔德里斯",
    "ギルド": "公会",
    "ダンジョン": "地下城",
    "ワープクリスタル": "传送水晶"
  };

  let importedFiles = [];
  let lastPackage = null;

  function hasJapanese(value) {
    return typeof value === "string" && JP_RE.test(value);
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function filePath(file) {
    return normalizePath(file.webkitRelativePath || file.relativePath || file.name);
  }

  function setStatus(message, warn) {
    els.status.textContent = message;
    els.status.classList.toggle("warn", Boolean(warn));
  }

  function bytesOf(value) {
    return new TextEncoder().encode(value).length;
  }

  function jsonString(value) {
    return JSON.stringify(value, null, 2);
  }

  function prettySize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  async function readFileText(file) {
    return await file.text();
  }

  async function collectEntryFiles(entry, prefix) {
    if (entry.isFile) {
      return await new Promise((resolve) => {
        entry.file((file) => {
          file.relativePath = normalizePath(`${prefix}${file.name}`);
          resolve([file]);
        });
      });
    }

    if (!entry.isDirectory) return [];
    const reader = entry.createReader();
    const all = [];
    async function readChunk() {
      const entries = await new Promise((resolve) => reader.readEntries(resolve));
      if (!entries.length) return;
      for (const child of entries) {
        const childPrefix = `${prefix}${entry.name}/`;
        all.push(...await collectEntryFiles(child, childPrefix));
      }
      await readChunk();
    }
    await readChunk();
    return all;
  }

  async function filesFromDataTransfer(dataTransfer) {
    const files = [];
    const items = Array.from(dataTransfer.items || []);
    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        files.push(...await collectEntryFiles(entry, ""));
      }
    }
    if (!files.length) {
      for (const file of Array.from(dataTransfer.files || [])) files.push(file);
    }
    return files;
  }

  function acceptFiles(files) {
    importedFiles = Array.from(files).filter((file) => /\.(json|js)$/i.test(file.name));
    els.fileCount.textContent = String(importedFiles.length);
    els.candidateCount.textContent = "0";
    els.batchCount.textContent = "0";
    lastPackage = null;
    els.downloadButton.disabled = true;
    els.copyPromptButton.disabled = true;
    els.preview.textContent = "暂无输出。";
    renderSummary([{ key: "已导入文件", value: importedFiles.length }]);
    setStatus(importedFiles.length ? `已导入 ${importedFiles.length} 个 JSON/JS 文件。` : "没有识别到 JSON 或 JS 文件。", !importedFiles.length);
  }

  function renderSummary(rows) {
    els.summaryList.innerHTML = rows.map((row) => `
      <div><dt>${escapeHtml(row.key)}</dt><dd>${escapeHtml(String(row.value))}</dd></div>
    `).join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function addOccurrence(list, item) {
    if (!hasJapanese(item.source)) return;
    list.push({
      occurrence_id: `O${String(list.length + 1).padStart(6, "0")}`,
      file: item.file,
      kind: item.kind,
      source: item.source,
      locator: item.locator || {},
      context_before: item.context_before || [],
      context_after: item.context_after || [],
      note: item.note || ""
    });
  }

  function extractDatabaseFile(file, data, occurrences) {
    const name = file.split("/").pop();
    const fields = DATABASE_FIELDS[name];
    if (!fields || !Array.isArray(data)) return;
    data.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      fields.forEach((key) => {
        const value = row[key];
        if (hasJapanese(value)) {
          addOccurrence(occurrences, {
            file,
            kind: `database_${key}`,
            source: value,
            locator: { type: "json", path: [index, key] },
            note: `id=${row.id || ""}, field=${key}`
          });
        }
      });
    });
  }

  function valueAtPath(data, path) {
    let value = data;
    for (const part of path) {
      if (value && Object.prototype.hasOwnProperty.call(value, part)) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  function walkSystem(value, path, file, occurrences, contextLines) {
    if (typeof value === "string") {
      if (hasJapanese(value)) {
        addOccurrence(occurrences, {
          file,
          kind: "system_term",
          source: value,
          locator: { type: "json", path },
          note: path.map((part) => typeof part === "number" ? `[${part}]` : part).join(".")
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      const strings = value.map((item) => typeof item === "string" ? item : "");
      value.forEach((item, index) => {
        const before = strings.slice(Math.max(0, index - contextLines), index).filter(Boolean);
        const after = strings.slice(index + 1, index + 1 + contextLines).filter(Boolean);
        const oldCount = occurrences.length;
        walkSystem(item, path.concat(index), file, occurrences, contextLines);
        occurrences.slice(oldCount).forEach((occ) => {
          occ.context_before = before;
          occ.context_after = after;
        });
      });
      return;
    }
    if (value && typeof value === "object") {
      Object.keys(value).forEach((key) => walkSystem(value[key], path.concat(key), file, occurrences, contextLines));
    }
  }

  function extractSystemFile(file, data, occurrences, contextLines) {
    if (!data || typeof data !== "object") return;
    SYSTEM_VISIBLE_PATHS.forEach((path) => {
      const value = valueAtPath(data, path);
      if (value !== undefined) walkSystem(value, path, file, occurrences, contextLines);
    });
  }

  function collectPluginArgTexts(value, path, found, visibleKey) {
    if (typeof value === "string") {
      if (visibleKey && hasJapanese(value)) found.push({ path, source: value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectPluginArgTexts(item, path.concat(index), found, visibleKey));
      return;
    }
    if (value && typeof value === "object") {
      Object.keys(value).forEach((key) => {
        collectPluginArgTexts(value[key], path.concat(key), found, visibleKey || PLUGIN_VISIBLE_KEYS.has(String(key)));
      });
    }
  }

  function eventVisibleEntries(commands, basePath) {
    const entries = [];
    commands.forEach((command, index) => {
      if (!command || typeof command !== "object") return;
      const code = command.code;
      const params = Array.isArray(command.parameters) ? command.parameters : [];
      if (code === 101 && typeof params[4] === "string" && hasJapanese(params[4])) {
        entries.push({ cmdIndex: index, paramPath: ["parameters", 4], kind: "event_speaker", source: params[4] });
      } else if ((code === 401 || code === 405) && typeof params[0] === "string" && hasJapanese(params[0])) {
        entries.push({ cmdIndex: index, paramPath: ["parameters", 0], kind: "event_text", source: params[0] });
      } else if (code === 102 && Array.isArray(params[0])) {
        params[0].forEach((choice, choiceIndex) => {
          if (hasJapanese(choice)) {
            entries.push({ cmdIndex: index, paramPath: ["parameters", 0, choiceIndex], kind: "event_choice", source: choice });
          }
        });
      } else if ((code === 320 || code === 324 || code === 325) && hasJapanese(params[1])) {
        entries.push({ cmdIndex: index, paramPath: ["parameters", 1], kind: "event_name_change", source: params[1] });
      } else if (code === 357 && params.length >= 4) {
        const found = [];
        collectPluginArgTexts(params[3], ["parameters", 3], found, false);
        found.forEach((item) => {
          entries.push({ cmdIndex: index, paramPath: item.path, kind: "event_plugin_text", source: item.source });
        });
      }
    });

    return entries.map((entry) => ({
      ...entry,
      jsonPath: basePath.concat("list", entry.cmdIndex, entry.paramPath)
    }));
  }

  function extractEventList(commands, file, basePath, owner, contextLines, occurrences) {
    const entries = eventVisibleEntries(commands, basePath);
    entries.forEach((entry, index) => {
      addOccurrence(occurrences, {
        file,
        kind: entry.kind,
        source: entry.source,
        locator: { type: "json", path: entry.jsonPath },
        context_before: entries.slice(Math.max(0, index - contextLines), index).map((item) => item.source),
        context_after: entries.slice(index + 1, index + 1 + contextLines).map((item) => item.source),
        note: owner
      });
    });
  }

  function extractMapFile(file, data, occurrences, contextLines) {
    if (!data || typeof data !== "object") return;
    if (hasJapanese(data.displayName)) {
      addOccurrence(occurrences, {
        file,
        kind: "map_display_name",
        source: data.displayName,
        locator: { type: "json", path: ["displayName"] }
      });
    }
    (data.events || []).forEach((event, eventIndex) => {
      if (!event || typeof event !== "object") return;
      (event.pages || []).forEach((page, pageIndex) => {
        if (Array.isArray(page.list)) {
          extractEventList(page.list, file, ["events", eventIndex, "pages", pageIndex], `event=${event.id || ""}, page=${pageIndex}`, contextLines, occurrences);
        }
      });
    });
  }

  function extractCommonEvents(file, data, occurrences, contextLines) {
    if (!Array.isArray(data)) return;
    data.forEach((event, eventIndex) => {
      if (event && Array.isArray(event.list)) {
        extractEventList(event.list, file, [eventIndex], `common_event=${event.id || ""}, name=${event.name || ""}`, contextLines, occurrences);
      }
    });
  }

  function extractTroops(file, data, occurrences, contextLines) {
    if (!Array.isArray(data)) return;
    data.forEach((troop, troopIndex) => {
      if (!troop || typeof troop !== "object") return;
      (troop.pages || []).forEach((page, pageIndex) => {
        if (Array.isArray(page.list)) {
          extractEventList(page.list, file, [troopIndex, "pages", pageIndex], `troop=${troop.id || ""}, page=${pageIndex}`, contextLines, occurrences);
        }
      });
    });
  }

  function looksInternalString(source) {
    const text = String(source || "").trim();
    if (!text || !hasJapanese(text)) return true;
    if (text.length <= 1) return true;
    if (FILE_NAME_RE.test(text)) return true;
    if (INTERNAL_URL_RE.test(text)) return true;
    if ((text.startsWith("[") || text.startsWith("{")) && text.includes("\"")) return true;
    return false;
  }

  function parsePluginsJs(text) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
      return [];
    }
  }

  function extractPluginsParameters(file, text, occurrences, review) {
    const plugins = parsePluginsJs(text);
    plugins.forEach((plugin, pluginIndex) => {
      if (!plugin || typeof plugin !== "object") return;
      if (hasJapanese(plugin.description)) {
        review.push({
          file,
          line: 0,
          source: plugin.description,
          context_before: [],
          context_after: [],
          reason: "插件说明文字，通常不影响玩家游玩，默认不进入翻译批次。"
        });
      }
      const params = plugin.parameters || {};
      Object.keys(params).forEach((key) => {
        const value = params[key];
        if (hasJapanese(key)) {
          review.push({
            file,
            line: 0,
            source: key,
            context_before: [plugin.name || ""],
            context_after: [],
            reason: "插件参数名可能被代码读取，默认不翻译。"
          });
        }
        if (typeof value === "string" && !looksInternalString(value)) {
          addOccurrence(occurrences, {
            file,
            kind: "js_string",
            source: value,
            locator: { type: "plugins_parameter", pluginIndex, key },
            context_before: [plugin.name || "", key],
            context_after: [],
            note: "plugins.js parameter value"
          });
        } else if (typeof value === "string" && hasJapanese(value)) {
          review.push({
            file,
            line: 0,
            source: value,
            context_before: [plugin.name || "", key],
            context_after: [],
            reason: "插件参数值像嵌套 JSON 或内部配置，默认不进入翻译批次。"
          });
        }
      });
    });
  }

  function decodeJsEscape(raw, index) {
    if (index + 1 >= raw.length) return { value: "\\", next: index + 1 };
    const c = raw[index + 1];
    const simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0", "\\": "\\", "'": "'", "\"": "\"", "`": "`" };
    if (Object.prototype.hasOwnProperty.call(simple, c)) return { value: simple[c], next: index + 2 };
    if (c === "x" && index + 3 < raw.length) {
      const token = raw.slice(index + 2, index + 4);
      const parsed = Number.parseInt(token, 16);
      if (!Number.isNaN(parsed)) return { value: String.fromCharCode(parsed), next: index + 4 };
    }
    if (c === "u") {
      if (raw[index + 2] === "{") {
        const end = raw.indexOf("}", index + 3);
        if (end !== -1) {
          const parsed = Number.parseInt(raw.slice(index + 3, end), 16);
          if (!Number.isNaN(parsed)) return { value: String.fromCodePoint(parsed), next: end + 1 };
        }
      }
      const token = raw.slice(index + 2, index + 6);
      const parsed = Number.parseInt(token, 16);
      if (token.length === 4 && !Number.isNaN(parsed)) return { value: String.fromCharCode(parsed), next: index + 6 };
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && raw[index + 2] === "\n") return { value: "", next: index + 3 };
      return { value: "", next: index + 2 };
    }
    return { value: c, next: index + 2 };
  }

  function scanJsStrings(text) {
    const strings = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "/") {
        i += 2;
        while (i < text.length && !/[\r\n]/.test(text[i])) i += 1;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        i += 2;
        while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
        i += 2;
        continue;
      }
      if (c !== "'" && c !== "\"" && c !== "`") {
        i += 1;
        continue;
      }
      const quote = c;
      const start = i;
      const decoded = [];
      let templateExpr = false;
      i += 1;
      while (i < text.length) {
        const ch = text[i];
        if (quote === "`" && ch === "$" && text[i + 1] === "{") templateExpr = true;
        if (ch === "\\") {
          const result = decodeJsEscape(text, i);
          decoded.push(result.value);
          i = result.next;
          continue;
        }
        if (ch === quote) {
          const end = i + 1;
          if (!templateExpr) strings.push({ start, end, quote, source: decoded.join("") });
          i = end;
          break;
        }
        decoded.push(ch);
        i += 1;
      }
    }
    return strings;
  }

  function lineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\n") starts.push(i + 1);
    }
    return starts;
  }

  function lineNumber(starts, offset) {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (starts[mid] <= offset) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  function jsContext(lines, lineNo, contextLines) {
    const index = lineNo - 1;
    return {
      before: lines.slice(Math.max(0, index - contextLines), index),
      after: lines.slice(index + 1, index + 1 + contextLines)
    };
  }

  function reviewJsSource(file, text, review, contextLines) {
    if (!hasJapanese(text)) return;
    const starts = lineStarts(text);
    const lines = text.split(/\r?\n/);
    scanJsStrings(text).forEach((item) => {
      if (looksInternalString(item.source)) return;
      const line = lineNumber(starts, item.start);
      const context = jsContext(lines, line, contextLines);
      review.push({
        file,
        line,
        source: item.source,
        context_before: context.before,
        context_after: context.after,
        reason: "插件源码字符串可能是解析别名或内部标签，默认不进入翻译批次。"
      });
    });
  }

  async function extract(files, options) {
    const occurrences = [];
    const review = [];
    const errors = [];
    for (const file of files) {
      const path = filePath(file);
      const name = path.split("/").pop();
      const lower = path.toLowerCase();
      try {
        const text = await readFileText(file);
        if (lower.endsWith(".json")) {
          const data = JSON.parse(text);
          if (name === "System.json") extractSystemFile(path, data, occurrences, options.contextLines);
          else if (name === "CommonEvents.json") extractCommonEvents(path, data, occurrences, options.contextLines);
          else if (name === "Troops.json") extractTroops(path, data, occurrences, options.contextLines);
          else if (MAP_FILE_RE.test(name)) extractMapFile(path, data, occurrences, options.contextLines);
          else extractDatabaseFile(path, data, occurrences);
        } else if (lower.endsWith(".js")) {
          if (name === "plugins.js") extractPluginsParameters(path, text, occurrences, review);
          else if (!lower.includes("/libs/") && !name.endsWith(".min.js")) reviewJsSource(path, text, review, options.contextLines);
        }
      } catch (error) {
        errors.push({ file: path, error: error.message });
      }
    }
    return { occurrences, review, errors };
  }

  function groupOccurrences(occurrences) {
    const groupsBySource = new Map();
    occurrences.forEach((occ) => {
      if (!groupsBySource.has(occ.source)) {
        groupsBySource.set(occ.source, {
          id: `T${String(groupsBySource.size + 1).padStart(6, "0")}`,
          source: occ.source,
          translation: "",
          kinds: [],
          files: [],
          occurrences: [],
          examples: []
        });
      }
      const group = groupsBySource.get(occ.source);
      group.occurrences.push(occ);
      if (!group.kinds.includes(occ.kind)) group.kinds.push(occ.kind);
      if (!group.files.includes(occ.file)) group.files.push(occ.file);
      if (group.examples.length < 3) {
        group.examples.push({
          file: occ.file,
          kind: occ.kind,
          context_before: occ.context_before,
          context_after: occ.context_after,
          note: occ.note
        });
      }
    });
    return Array.from(groupsBySource.values());
  }

  function batchView(group) {
    return {
      id: group.id,
      source: group.source,
      translation: "",
      kinds: group.kinds,
      occurrence_count: group.occurrences.length,
      examples: group.examples
    };
  }

  function splitBatches(groups, targetBytes) {
    const batches = [];
    let current = [];
    let currentBytes = 2;
    groups.forEach((group) => {
      const item = batchView(group);
      const itemBytes = bytesOf(jsonString([item]));
      if (current.length && currentBytes + itemBytes > targetBytes) {
        batches.push(current);
        current = [];
        currentBytes = 2;
      }
      current.push(item);
      currentBytes += itemBytes;
    });
    if (current.length) batches.push(current);
    return batches.map((items, index) => {
      const content = jsonString(items);
      return {
        name: `batches/batch_${String(index + 1).padStart(3, "0")}.json`,
        items,
        bytes: bytesOf(content),
        content
      };
    });
  }

  function recommendUploadPlan(batches, uploadBytes) {
    const maxBatch = Math.max(0, ...batches.map((batch) => batch.bytes));
    const average = batches.length ? batches.reduce((sum, batch) => sum + batch.bytes, 0) / batches.length : 0;
    let count = 1;
    if (average > 0) count = Math.max(1, Math.min(3, Math.floor(uploadBytes / average)));
    if (maxBatch > uploadBytes * 0.85) count = 1;
    const large = batches.filter((batch) => batch.bytes > uploadBytes * 0.75).map((batch) => batch.name.split("/").pop());
    return { count, maxBatch, average, large };
  }

  function glossaryCandidates(groups) {
    const candidates = [];
    groups.forEach((group) => {
      const source = group.source.trim();
      const usefulKind = group.kinds.some((kind) => /name|speaker|display_name|system_term/.test(kind));
      if (!usefulKind) return;
      if (!source || source.length > 40) return;
      if (CONTROL_RE.test(source)) return;
      candidates.push({
        id: group.id,
        source,
        kinds: group.kinds,
        occurrence_count: group.occurrences.length,
        sample_files: group.files.slice(0, 5)
      });
    });
    candidates.sort((a, b) => b.occurrence_count - a.occurrence_count || a.source.localeCompare(b.source, "ja"));
    return candidates.slice(0, 500);
  }

  function uploadPrompt(adviceCount) {
    return `# ChatGPT 上传文件翻译提示词

我上传了一个或多个 RPG Maker MZ/MV 游戏文本批次 JSON 文件。请读取上传文件，把里面每条 \`source\` 从日文翻译成简体中文。

## 输出格式

如果只上传了 1 个批次文件，只返回一个 JSON 数组。数组中每一项只需要：

{
  "id": "T000001",
  "translation": "中文译文"
}

如果一次上传了多个批次文件，请按文件分别返回，并用文件名作为标题，例如：

batch_001_zh.json
[
  {
    "id": "T000001",
    "translation": "中文译文"
  }
]

不要返回解释、Markdown 代码块或额外字段。不要省略任何 id。

## 翻译规则

1. 只翻译上传文件里的 source，examples 里的上下文只用于理解，不要翻译上下文。
2. 保留 id，不能改动、删除或重排。
3. 必须保留所有控制符和占位符，例如 %1、%2、\\G、\\C[14]、\\c[16]、\\I[_icon]、\\V[1]、_actor、_name、_num、_desc1、_class。
4. 不要翻译文件名、插件名、变量名、代码片段。
5. 如果 source 是角色名、地名、菜单项或物品名，请按术语表保持一致。
6. 如果文本明显是系统提示，译文要短，适合游戏窗口显示。
7. 如果遇到不能确定的专有名词，音译并保持前后一致。

建议本项目一次上传 ${adviceCount} 个批次文件。`;
  }

  function glossaryPrompt() {
    return `# 术语表制作提示词

我上传了 glossary_candidates.json。请根据候选词为 RPG Maker 游戏制作日文到简体中文术语表。

要求：
1. 只返回 JSON 对象。
2. key 使用原始日文，value 使用简体中文译名。
3. 人名、地名优先音译，系统词和菜单词按常见游戏译法意译。
4. 同一角色或地名保持统一。
5. 不要翻译控制符、文件名、变量名。

输出示例：

{
  "レイニア": "蕾妮娅",
  "ギルド": "公会"
}`;
  }

  function guideText(stats, advice) {
    const largeNote = advice.large.length ? `\n\n以下批次较大，建议单独上传：${advice.large.join("、")}` : "";
    return `# 操作指南

## 1. 使用 ChatGPT 翻译

打开 prompts/chatgpt_upload_prompt.md，把提示词复制到 ChatGPT。

然后上传 batches 文件夹里的 batch_001.json、batch_002.json 等文件。

建议一次上传 ${advice.count} 个批次文件。${largeNote}

ChatGPT 返回后，将结果保存为：

translated_batches/batch_001_zh.json

## 2. 术语表

先上传 glossary/glossary_candidates.json，并使用 prompts/glossary_prompt.md 让 ChatGPT 生成术语表。

确认术语表后，可以把术语表内容附加到后续翻译提示词中。

## 3. 注意事项

- 不要让 ChatGPT 修改 id。
- 不要让 ChatGPT 删除控制符，例如 %1、\\C[14]、\\G、_actor。
- review/js_source_review_candidates.json 是插件源码复核清单，默认不要批量翻译回填。

## 4. 本次统计

- 导入文件：${stats.fileCount}
- 可翻译出现位置：${stats.occurrences}
- 唯一文本：${stats.uniqueItems}
- 批次文件：${stats.batches}
- 插件源码复核候选：${stats.reviewCandidates}
`;
  }

  function buildPackage(files, groups, occurrences, review, errors, options) {
    const targetBytes = Math.max(40, options.targetKb) * 1024;
    const uploadBytes = Math.max(80, options.uploadKb) * 1024;
    const batches = splitBatches(groups, targetBytes);
    const advice = recommendUploadPlan(batches, uploadBytes);
    const candidates = glossaryCandidates(groups);
    const stats = {
      generated_at: new Date().toISOString(),
      fileCount: files.length,
      occurrences: occurrences.length,
      uniqueItems: groups.length,
      batches: batches.length,
      batchTargetKb: options.targetKb,
      uploadTargetKb: options.uploadKb,
      recommendedFilesPerUpload: advice.count,
      largestBatchBytes: advice.maxBatch,
      averageBatchBytes: Math.round(advice.average),
      reviewCandidates: review.length,
      errors
    };

    const manifest = {
      total_unique_items: groups.length,
      total_occurrences: occurrences.length,
      items: groups
    };

    const zipFiles = [];
    batches.forEach((batch) => zipFiles.push({ name: batch.name, content: batch.content }));
    zipFiles.push({ name: "manifest.json", content: jsonString(manifest) });
    zipFiles.push({ name: "stats.json", content: jsonString(stats) });
    zipFiles.push({ name: "prompts/chatgpt_upload_prompt.md", content: uploadPrompt(advice.count) });
    zipFiles.push({ name: "prompts/glossary_prompt.md", content: glossaryPrompt() });
    zipFiles.push({ name: "glossary/glossary_candidates.json", content: jsonString(candidates) });
    zipFiles.push({ name: "glossary/glossary_seed.json", content: jsonString(GLOSSARY_SEED) });
    zipFiles.push({ name: "review/js_source_review_candidates.json", content: jsonString(review) });
    zipFiles.push({ name: "README_操作指南.md", content: guideText(stats, advice) });

    return { stats, batches, advice, candidates, zipFiles, prompt: uploadPrompt(advice.count) };
  }

  function renderResults(pkg) {
    els.fileCount.textContent = String(pkg.stats.fileCount);
    els.candidateCount.textContent = String(pkg.stats.uniqueItems);
    els.batchCount.textContent = String(pkg.stats.batches);
    renderSummary([
      { key: "导入文件", value: pkg.stats.fileCount },
      { key: "可翻译出现位置", value: pkg.stats.occurrences },
      { key: "唯一文本", value: pkg.stats.uniqueItems },
      { key: "批次文件", value: pkg.stats.batches },
      { key: "最大批次", value: prettySize(pkg.stats.largestBatchBytes) },
      { key: "平均批次", value: prettySize(pkg.stats.averageBatchBytes) },
      { key: "插件源码复核候选", value: pkg.stats.reviewCandidates },
      { key: "解析错误", value: pkg.stats.errors.length }
    ]);

    const largeText = pkg.advice.large.length ? `<p>建议单独上传：<strong>${escapeHtml(pkg.advice.large.join("、"))}</strong></p>` : "";
    els.uploadAdvice.innerHTML = `
      <p>建议一次上传 <strong>${pkg.advice.count}</strong> 个批次文件给 ChatGPT。</p>
      <p>目标单次上传总大小：${escapeHtml(String(els.uploadKb.value))} KB。最大批次：${prettySize(pkg.advice.maxBatch)}。</p>
      ${largeText}
    `;

    els.preview.textContent = [
      "将生成 ZIP 文件：",
      ...pkg.zipFiles.slice(0, 16).map((file) => `- ${file.name}`),
      pkg.zipFiles.length > 16 ? `... 还有 ${pkg.zipFiles.length - 16} 个文件` : "",
      "",
      "GPT 提示词预览：",
      pkg.prompt.slice(0, 1400)
    ].filter(Boolean).join("\n");
  }

  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  }

  const CRC_TABLE = makeCrcTable();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
  }

  function u32(value) {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  function generateZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = dosDateTime(new Date());
    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
        ...u16(now.time), ...u16(now.day), ...u32(crc),
        ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
      ]);
      chunks.push(local, nameBytes, data);
      central.push({
        nameBytes,
        crc,
        size: data.length,
        offset,
        time: now.time,
        day: now.day
      });
      offset += local.length + nameBytes.length + data.length;
    });

    let centralSize = 0;
    central.forEach((entry) => {
      const header = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
        ...u16(entry.time), ...u16(entry.day), ...u32(entry.crc),
        ...u32(entry.size), ...u32(entry.size), ...u16(entry.nameBytes.length),
        ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(entry.offset)
      ]);
      chunks.push(header, entry.nameBytes);
      centralSize += header.length + entry.nameBytes.length;
    });

    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length),
      ...u16(central.length), ...u32(centralSize), ...u32(offset), ...u16(0)
    ]);
    chunks.push(end);
    return new Blob(chunks, { type: "application/zip" });
  }

  async function runExtraction() {
    if (!importedFiles.length) {
      setStatus("请先拖入 data 和 js 文件夹，或选择 JSON/JS 文件。", true);
      return;
    }
    setStatus("正在读取并提取文本...");
    els.runButton.disabled = true;
    try {
      const options = {
        contextLines: Number(els.contextLines.value) || 5,
        targetKb: Number(els.targetKb.value) || 180,
        uploadKb: Number(els.uploadKb.value) || 450
      };
      const result = await extract(importedFiles, options);
      const groups = groupOccurrences(result.occurrences);
      lastPackage = buildPackage(importedFiles, groups, result.occurrences, result.review, result.errors, options);
      renderResults(lastPackage);
      els.downloadButton.disabled = false;
      els.copyPromptButton.disabled = false;
      setStatus(`完成：生成 ${lastPackage.stats.batches} 个批次文件。`);
    } catch (error) {
      console.error(error);
      setStatus(`提取失败：${error.message}`, true);
    } finally {
      els.runButton.disabled = false;
    }
  }

  function downloadPackage() {
    if (!lastPackage) return;
    const blob = generateZip(lastPackage.zipFiles);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rpgm_translation_package.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyPrompt() {
    if (!lastPackage) return;
    await navigator.clipboard.writeText(lastPackage.prompt);
    setStatus("已复制 GPT 上传文件翻译提示词。");
  }

  function clearAll() {
    importedFiles = [];
    lastPackage = null;
    els.fileCount.textContent = "0";
    els.candidateCount.textContent = "0";
    els.batchCount.textContent = "0";
    els.folderInput.value = "";
    els.fileInput.value = "";
    els.downloadButton.disabled = true;
    els.copyPromptButton.disabled = true;
    els.preview.textContent = "暂无输出。";
    els.uploadAdvice.textContent = "导入文件并开始提取后生成。";
    renderSummary([{ key: "状态", value: "尚未运行" }]);
    setStatus("等待导入文件。");
  }

  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });

  els.dropZone.addEventListener("dragleave", () => {
    els.dropZone.classList.remove("dragging");
  });

  els.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
    const files = await filesFromDataTransfer(event.dataTransfer);
    acceptFiles(files);
  });

  els.folderInput.addEventListener("change", () => acceptFiles(els.folderInput.files));
  els.fileInput.addEventListener("change", () => acceptFiles(els.fileInput.files));
  els.runButton.addEventListener("click", runExtraction);
  els.downloadButton.addEventListener("click", downloadPackage);
  els.copyPromptButton.addEventListener("click", copyPrompt);
  els.clearButton.addEventListener("click", clearAll);
})();
