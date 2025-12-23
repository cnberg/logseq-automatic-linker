import "@logseq/libs";
import { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
// @ts-ignore
import Sherlock from "sherlockjs";
import { getDateForPage } from "logseq-dateutils";
import { replaceContentWithPageLinks, clearRegexCache } from "./src/functions";
import { splitBlock } from "./src/splitBlock";

let pageList: string[] = [];
let blockArray: string[] = [];
let dateFormat = "";
// Map from alias (lowercase) to original page name for pages with auto-link-to-original:: true
let aliasToOriginalMap: Map<string, string> = new Map();

async function fetchAliases() {
  //from https://github.com/sawhney17/logseq-smartblocks
  let query = `
  [:find (pull ?b [*])
             :where
             [?b :block/properties ?p]
             [(get ?p :alias)]]
  `;
  let result = await logseq.DB.datascriptQuery(query);
  let resultMap = result
    .map((item) => item[0].properties.alias) // Extract aliases
    .filter((alias) => alias !== ""); // Exclude empty aliases

  console.log({ LogseqAutomaticLinker: "fetchAliases", result, resultMap });
  return resultMap;
}

async function fetchPropertyIgnoreList() {
  let query = `
  [:find (pull ?b [*])
             :where
             [?b :block/properties ?p]
             [(get ?p :auto-link-ignore)]]
  `;
  let result = await logseq.DB.datascriptQuery(query);
  return result
    .filter(
      (item) =>
        item[0]["name"] && item[0].properties["auto-link-ignore"]
    )
    .map((item) =>
      [
        item[0]["name"].toUpperCase(),
        item[0].properties.alias?.map((alias: string) => alias.toUpperCase()) ?? [],
      ].flat()
    )
    .flat();
}

/**
 * Fetch pages with auto-link-to-original:: true and build a map from alias to original page name.
 * When an alias is matched, it will be linked to the original page name instead.
 */
async function fetchAliasToOriginalMap(): Promise<Map<string, string>> {
  let query = `
  [:find (pull ?b [*])
             :where
             [?b :block/properties ?p]
             [(get ?p :auto-link-to-original)]]
  `;
  let result = await logseq.DB.datascriptQuery(query);
  const map = new Map<string, string>();
  
  console.log({ 
    LogseqAutomaticLinker: "fetchAliasToOriginalMap raw result", 
    resultCount: result?.length,
    result: result?.map((item: any) => ({
      name: item[0]?.["name"],
      originalName: item[0]?.["original-name"],
      properties: item[0]?.properties,
    })),
  });
  
  result
    .filter(
      (item) =>
        item[0]["name"] && item[0].properties["auto-link-to-original"] && item[0].properties.alias
    )
    .forEach((item) => {
      const originalName = item[0]["name"];
      const aliases = item[0].properties.alias;
      console.log({
        LogseqAutomaticLinker: "fetchAliasToOriginalMap processing",
        originalName,
        aliases,
        aliasType: typeof aliases,
        isArray: Array.isArray(aliases),
      });
      if (Array.isArray(aliases)) {
        aliases.forEach((alias: string) => {
          // Store lowercase alias -> original name mapping
          map.set(alias.toLowerCase(), originalName);
          console.log({
            LogseqAutomaticLinker: "fetchAliasToOriginalMap added",
            aliasKey: alias.toLowerCase(),
            originalName,
          });
        });
      } else if (typeof aliases === "string") {
        map.set(aliases.toLowerCase(), originalName);
        console.log({
          LogseqAutomaticLinker: "fetchAliasToOriginalMap added (string)",
          aliasKey: aliases.toLowerCase(),
          originalName,
        });
      }
    });
  
  console.log({ 
    LogseqAutomaticLinker: "fetchAliasToOriginalMap final", 
    mapSize: map.size,
    entries: Array.from(map.entries()),
  });
  return map;
}

const settings: SettingSchemaDesc[] = [
  {
    key: "enableAutoParse",
    description: "Automatically parse the block on enter",
    type: "boolean",
    default: false,
    title: "Automatically parse the block on enter",
  },
  {
    key: "stateKeybinding",
    description: "Keybinding to toggle Automatic Parsing",
    type: "string",
    default: "mod+alt+shift+l",
    title: "Keybinding for Automatic Parsing",
  },
  {
    key: "parseSingleBlockKeybinding",
    description: "Keybinding to parse a single block",
    type: "string",
    default: "mod+shift+l",
    title: "Keybinding for Parsing a Single Block",
  },
  {
    key: "parseSingleWordAsTag",
    description: "Parse single words as tags",
    type: "boolean",
    default: false,
    title: "Parse single words as tags",
  },
  {
    key: "parseAsTags",
    description: "Parse all links as tags",
    type: "boolean",
    default: false,
    title: "Parse all links as tags",
  },
  {
    key: "pagesToIgnore",
    description: "Pages to ignore when generating links",
    type: "string",
    default:
      "a,b,c,card,now,later,todo,doing,done,wait,waiting,canceled,cancelled,started,in-progress",
    title: "Pages to ignore when generating links",
  },
  {
    key: "goToTodayKeybinding",
    description: "Keybinding to navigate to today's journal page",
    type: "string",
    default: "mod+shift+t",
    title: "Keybinding for Go to Today's Journal",
  },
  {
    key: "journalDateFormat",
    description: "Date format for journal pages (e.g., yyyy/MM/dd, MMM do, yyyy)",
    type: "string",
    default: "yyyy/MM/dd",
    title: "Journal Date Format",
  },
  {
    key: "promptTemplateKeybinding",
    description: "Keybinding to open prompt template selector",
    type: "string",
    default: "mod+shift+g",
    title: "Keybinding for Prompt Template",
  },
  {
    key: "promptNamespace",
    description: "Namespace for prompt template pages (e.g., prompt)",
    type: "string",
    default: "prompt",
    title: "Prompt Template Namespace",
  },
  {
    key: "splitBlockKeybinding",
    description: "Keybinding to split the current block by lines",
    type: "string",
    default: "mod+shift+s",
    title: "Keybinding for Split Block",
  },
  {
    key: "llmApiUrl",
    description: "API URL for LLM service (OpenAI compatible)",
    type: "string",
    default: "https://api.openai.com/v1/chat/completions",
    title: "LLM API URL",
  },
  {
    key: "llmApiKey",
    description: "API Key for LLM service",
    type: "string",
    default: "",
    title: "LLM API Key",
  },
  {
    key: "llmModel",
    description: "Model name for LLM service (e.g., gpt-4, gpt-3.5-turbo)",
    type: "string",
    default: "gpt-4",
    title: "LLM Model",
  },
];
logseq.useSettingsSchema(settings);
async function getPages() {
  const propertyBasedIgnoreList = await fetchPropertyIgnoreList();
  // Fetch alias to original page name mapping
  aliasToOriginalMap = await fetchAliasToOriginalMap();
  
  let pagesToIgnore = logseq.settings?.pagesToIgnore
    .split(",")
    .map((x) => x.toUpperCase().trim())
    .concat(propertyBasedIgnoreList);
  pagesToIgnore = [...new Set(pagesToIgnore)];
  const query = `[:find (pull ?p [*]) 
                :where 
                [?p :block/uuid ?u]
                [?p :block/name]]`;
  logseq.DB.datascriptQuery(query).then(async (results) => {
    pageList = results
      .filter((x) => !pagesToIgnore.includes(x[0]["name"].toUpperCase()))
      .map((x) => x[0]["name"])
      .filter((x) => x);
    const aliases = (await fetchAliases()).flat();
    pageList = pageList.concat(aliases);
    //Reverse sort pagelist on the basis of length so that longer page names are matched first
    pageList.sort((a, b) => b.length - a.length);
    // Clear regex cache when page list is refreshed
    clearRegexCache();
    console.log({ 
      LogseqAutomaticLinker: "getPages completed", 
      pageCount: results.length,
      pageListLength: pageList.length,
      aliasesAdded: aliases,
      aliasToOriginalMapSize: aliasToOriginalMap.size,
      aliasToOriginalMapEntries: Array.from(aliasToOriginalMap.entries()),
    });
    // Show toast notification
    logseq.App.showMsg(
      `Automatic Linker: Loaded ${pageList.length} pages, ${aliasToOriginalMap.size} auto-link aliases`,
      "success"
    );
  });
}

/**
 * Remove all links to a specific page from all blocks that reference it.
 * This will convert [[PageName]], #PageName, and #[[PageName]] to plain text.
 */
async function unlinkAllReferencesToPage(pageName: string) {
  // Query all blocks that reference this page
  const query = `
    [:find (pull ?b [:block/uuid :block/content])
     :where
     [?p :block/name "${pageName.toLowerCase()}"]
     [?b :block/refs ?p]]
  `;

  try {
    const results = await logseq.DB.datascriptQuery(query);
    if (!results || results.length === 0) {
      logseq.App.showMsg(`No references to "${pageName}" found`, "warning");
      return;
    }

    let updatedCount = 0;
    for (const result of results) {
      const block = result[0];
      if (!block || !block.content) continue;

      let content = block.content;
      const originalContent = content;

      // Create regex patterns to match different link formats (case-insensitive)
      const escapedPageName = pageName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

      // Match [[PageName]] - wiki link format
      const wikiLinkRegex = new RegExp(`\\[\\[${escapedPageName}\\]\\]`, "gi");
      content = content.replace(wikiLinkRegex, pageName);

      // Match #[[PageName]] - tag with brackets format
      const tagBracketRegex = new RegExp(`#\\[\\[${escapedPageName}\\]\\]`, "gi");
      content = content.replace(tagBracketRegex, pageName);

      // Match #PageName - simple tag format (only if not followed by [[)
      // Need to be careful not to match partial words
      const tagRegex = new RegExp(`#${escapedPageName}(?![\\[\\w])`, "gi");
      content = content.replace(tagRegex, pageName);

      if (content !== originalContent) {
        await logseq.Editor.updateBlock(block.uuid, content);
        updatedCount++;
      }
    }

    logseq.App.showMsg(
      `Unlinked "${pageName}" from ${updatedCount} block(s)`,
      "success"
    );
    console.log({
      LogseqAutomaticLinker: "unlinkAllReferencesToPage",
      pageName,
      updatedCount,
    });
  } catch (error) {
    console.error({ LogseqAutomaticLinker: "unlinkAllReferencesToPage error", error });
    logseq.App.showMsg(`Error unlinking references: ${error}`, "error");
  }
}

/**
 * Navigate to today's journal page (single page, not journal stream).
 */
async function goToTodayJournal() {
  try {
    // Use configured date format, default to yyyy/MM/dd
    const journalDateFormat = logseq.settings?.journalDateFormat || "yyyy/MM/dd";
    // getDateForPage returns format like "[[2025/12/14]]", we need to strip the brackets
    let todayPageName = getDateForPage(new Date(), journalDateFormat);
    if (todayPageName) {
      // Remove [[ and ]] if present
      todayPageName = todayPageName.replace(/^\[\[/, "").replace(/\]\]$/, "");
      // Navigate to today's journal page
      logseq.App.pushState("page", { name: todayPageName });
      console.log({ LogseqAutomaticLinker: "goToTodayJournal", todayPageName, journalDateFormat });
    } else {
      logseq.App.showMsg("Could not determine today's journal page", "warning");
    }
  } catch (error) {
    console.error({ LogseqAutomaticLinker: "goToTodayJournal error", error });
    logseq.App.showMsg(`Error navigating to today's journal: ${error}`, "error");
  }
}

/**
 * Split a block into multiple blocks based on newlines.
 * Preserves indentation hierarchy.
 */
async function splitBlockAction(blockId: string) {
  const block = await logseq.Editor.getBlock(blockId);
  if (!block) {
    return;
  }
  
  const newBlocks = splitBlock(block.content).map((b) => {
    return {
      ...b,
      children: b.children && b.children.length ? b.children : undefined,
    };
  });
  
  if (newBlocks.length === 0) {
    return;
  }
  
  await logseq.Editor.insertBatchBlock(block.uuid, newBlocks, {
    sibling: true,
  });
  await logseq.Editor.removeBlock(block.uuid);
  
  console.log({ LogseqAutomaticLinker: "splitBlockAction", blockId, newBlocksCount: newBlocks.length });
}

/**
 * Split all blocks in a page that contain multiple lines.
 * @param pageName The name of the page to process
 */
async function splitAllBlocksInPage(pageName: string) {
  logseq.App.showMsg(`Scanning blocks in "${pageName}"...`, "info");

  try {
    // Get all blocks in the page
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);
    if (!pageBlocksTree || pageBlocksTree.length === 0) {
      logseq.App.showMsg("No blocks found in this page", "warning");
      return;
    }

    // Collect all block UUIDs that need splitting (blocks with multiple lines)
    const blocksToSplit: string[] = [];
    
    function collectBlocksToSplit(blocks: any[]) {
      for (const block of blocks) {
        if (block.content && block.content.includes("\n")) {
          blocksToSplit.push(block.uuid);
        }
        if (block.children && block.children.length > 0) {
          collectBlocksToSplit(block.children);
        }
      }
    }
    
    collectBlocksToSplit(pageBlocksTree);

    if (blocksToSplit.length === 0) {
      logseq.App.showMsg("No multi-line blocks found to split", "info");
      return;
    }

    console.log({
      LogseqAutomaticLinker: "splitAllBlocksInPage",
      pageName,
      blocksToSplitCount: blocksToSplit.length,
    });

    // Split each block (process in reverse order to avoid position shifts)
    let splitCount = 0;
    for (const blockUuid of blocksToSplit.reverse()) {
      await splitBlockAction(blockUuid);
      splitCount++;
    }

    logseq.App.showMsg(
      `Split ${splitCount} blocks in "${pageName}"`,
      "success"
    );

  } catch (error) {
    console.error({ LogseqAutomaticLinker: "splitAllBlocksInPage error", error });
    logseq.App.showMsg(`Error: ${error}`, "error");
  }
}

async function parseBlockForLink(d: string) {
  console.log({ 
    LogseqAutomaticLinker: "parseBlockForLink called", 
    blockId: d,
    blockIdType: typeof d,
    pageListLength: pageList.length,
    aliasToOriginalMapSize: aliasToOriginalMap.size,
  });
  
  if (d != null) {
    let block = await logseq.Editor.getBlock(d);
    if (block == null) {
      console.log({ LogseqAutomaticLinker: "parseBlockForLink block not found", blockId: d });
      return;
    }

    console.log({ 
      LogseqAutomaticLinker: "parseBlockForLink processing", 
      blockContent: block.content,
      pageListLength: pageList.length,
      pageListSample: pageList.slice(0, 20),
      aliasToOriginalMapSize: aliasToOriginalMap.size,
      aliasToOriginalMapEntries: Array.from(aliasToOriginalMap.entries()),
    });

    let content = block.content.replaceAll(/{.*}/g, (match) => {
      return getDateForPage(
        Sherlock.parse(match.slice(1, -1)).startDate,
        dateFormat
      );
    });

    let needsUpdate = false;
    [content, needsUpdate] = replaceContentWithPageLinks(
      pageList,
      content,
      logseq.settings?.parseAsTags,
      logseq.settings?.parseSingleWordAsTag,
      aliasToOriginalMap
    );
    console.log({
      LogseqAutomaticLinker: "parseBlockForLink result",
      originalContent: block.content,
      newContent: content,
      needsUpdate,
    });
    if (needsUpdate) {
      logseq.Editor.updateBlock(block.uuid, `${content}`);
    }
  }
}

// ============== Prompt Template Feature ==============

const PROMPT_UI_KEY = "prompt-template-selector";

/**
 * Fetch all pages under the prompt namespace (e.g., prompt/xxx)
 */
async function fetchPromptPages(): Promise<string[]> {
  const namespace = logseq.settings?.promptNamespace || "prompt";
  const query = `
    [:find (pull ?p [:block/name :block/original-name])
     :where
     [?p :block/name ?name]
     [(clojure.string/starts-with? ?name "${namespace.toLowerCase()}/")]]
  `;
  
  try {
    const results = await logseq.DB.datascriptQuery(query);
    const pages = results
      .map((r: any) => r[0]?.["original-name"] || r[0]?.["name"])
      .filter((name: string) => name);
    
    console.log({ LogseqAutomaticLinker: "fetchPromptPages", namespace, pages });
    return pages;
  } catch (error) {
    console.error({ LogseqAutomaticLinker: "fetchPromptPages error", error });
    return [];
  }
}

/**
 * Get block content with all children, preserving indentation
 */
async function getBlockContentWithChildren(
  blockId: string,
  indentLevel: number = 0
): Promise<string> {
  const block = await logseq.Editor.getBlock(blockId, { includeChildren: true });
  if (!block) return "";

  const indent = "  ".repeat(indentLevel);
  let content = indent + block.content;

  if (block.children && block.children.length > 0) {
    for (const child of block.children) {
      const childId = typeof child === "object" ? (child as any).uuid : child;
      const childContent = await getBlockContentWithChildren(childId, indentLevel + 1);
      if (childContent) {
        content += "\n" + childContent;
      }
    }
  }

  return content;
}

/**
 * Get the content of a page (all blocks concatenated)
 */
async function getPageContent(pageName: string): Promise<string> {
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (!blocks || blocks.length === 0) return "";

  const contents: string[] = [];
  
  async function processBlock(block: any, indentLevel: number = 0): Promise<void> {
    const indent = "  ".repeat(indentLevel);
    contents.push(indent + block.content);
    
    if (block.children && block.children.length > 0) {
      for (const child of block.children) {
        await processBlock(child, indentLevel + 1);
      }
    }
  }

  for (const block of blocks) {
    await processBlock(block, 0);
  }

  return contents.join("\n");
}

/**
 * Get block content by UUID
 */
async function getBlockContentByUuid(uuid: string): Promise<string> {
  try {
    const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (!block) return "";
    
    const contents: string[] = [];
    
    async function processBlock(b: any, indentLevel: number = 0): Promise<void> {
      const indent = "  ".repeat(indentLevel);
      contents.push(indent + b.content);
      
      if (b.children && b.children.length > 0) {
        for (const child of b.children) {
          const childBlock = typeof child === "object" ? child : await logseq.Editor.getBlock(child);
          if (childBlock) {
            await processBlock(childBlock, indentLevel + 1);
          }
        }
      }
    }
    
    await processBlock(block, 0);
    return contents.join("\n");
  } catch (error) {
    console.error({ LogseqAutomaticLinker: "getBlockContentByUuid error", uuid, error });
    return "";
  }
}

/**
 * Recursively expand all embeds in content.
 * Handles:
 * - {{embed [[PageName]]}} - embed a page
 * - {{embed ((block-uuid))}} - embed a block
 * 
 * @param content - The content to process
 * @param depth - Current recursion depth (to prevent infinite loops)
 * @param maxDepth - Maximum recursion depth
 */
async function expandEmbeds(
  content: string,
  depth: number = 0,
  maxDepth: number = 10
): Promise<string> {
  if (depth >= maxDepth) {
    console.warn({ LogseqAutomaticLinker: "expandEmbeds max depth reached", depth });
    return content;
  }

  let result = content;
  let hasChanges = true;

  // Keep processing until no more embeds are found (handles nested embeds)
  while (hasChanges && depth < maxDepth) {
    hasChanges = false;

    // Pattern for {{embed [[PageName]]}}
    const pageEmbedRegex = /\{\{embed\s+\[\[([^\]]+)\]\]\s*\}\}/gi;
    const pageMatches = [...result.matchAll(pageEmbedRegex)];
    
    for (const match of pageMatches) {
      const fullMatch = match[0];
      const pageName = match[1];
      
      console.log({ LogseqAutomaticLinker: "expandEmbeds page", pageName, depth });
      
      const pageContent = await getPageContent(pageName);
      if (pageContent) {
        result = result.replace(fullMatch, pageContent);
        hasChanges = true;
      }
    }

    // Pattern for {{embed ((block-uuid))}}
    const blockEmbedRegex = /\{\{embed\s+\(\(([a-f0-9-]+)\)\)\s*\}\}/gi;
    const blockMatches = [...result.matchAll(blockEmbedRegex)];
    
    for (const match of blockMatches) {
      const fullMatch = match[0];
      const blockUuid = match[1];
      
      console.log({ LogseqAutomaticLinker: "expandEmbeds block", blockUuid, depth });
      
      const blockContent = await getBlockContentByUuid(blockUuid);
      if (blockContent) {
        result = result.replace(fullMatch, blockContent);
        hasChanges = true;
      }
    }

    depth++;
  }

  return result;
}

/**
 * Get formatted current date with day of week
 */
function getCurrentDateString(): string {
  const now = new Date();
  
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdaysCN = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const weekday = weekdays[now.getDay()];
  const weekdayCN = weekdaysCN[now.getDay()];
  
  // Format: 2025-01-15 14:30:25 Wednesday (星期三)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${weekday} (${weekdayCN})`;
}

/**
 * Process the template: 
 * 1. Expand all embeds recursively
 * 2. Replace {{date}} with current date/time
 * 3. Replace {{block-content}} with actual content
 */
async function processTemplate(template: string, blockContent: string): Promise<string> {
  // First, expand all embeds in the template
  let processed = await expandEmbeds(template);
  
  // Replace {{date}} with current date/time (replace all occurrences)
  const dateString = getCurrentDateString();
  processed = processed.replace(/\{\{date\}\}/gi, dateString);
  
  // Then replace the first {{block-content}} placeholder
  processed = processed.replace("{{block-content}}", blockContent);
  
  return processed;
}

/**
 * Copy text to clipboard using multiple fallback methods
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // Method 1: Try navigator.clipboard (modern API)
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      console.log({ LogseqAutomaticLinker: "copyToClipboard success via navigator.clipboard" });
      return true;
    }
  } catch (error) {
    console.log({ LogseqAutomaticLinker: "navigator.clipboard failed, trying fallback", error });
  }

  // Method 2: Try using parent window's clipboard (for iframe context)
  try {
    if (top?.navigator?.clipboard?.writeText) {
      await top.navigator.clipboard.writeText(text);
      console.log({ LogseqAutomaticLinker: "copyToClipboard success via top.navigator.clipboard" });
      return true;
    }
  } catch (error) {
    console.log({ LogseqAutomaticLinker: "top.navigator.clipboard failed, trying fallback", error });
  }

  // Method 3: Fallback to execCommand (deprecated but works in more contexts)
  try {
    const textArea = top?.document.createElement("textarea") || document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    (top?.document.body || document.body).appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const success = (top?.document || document).execCommand("copy");
    textArea.remove();
    
    if (success) {
      console.log({ LogseqAutomaticLinker: "copyToClipboard success via execCommand" });
      return true;
    }
  } catch (error) {
    console.error({ LogseqAutomaticLinker: "execCommand copy failed", error });
  }

  console.error({ LogseqAutomaticLinker: "All clipboard methods failed" });
  return false;
}

/**
 * Hide the prompt template UI
 */
function hidePromptUI() {
  logseq.provideUI({
    key: PROMPT_UI_KEY,
    template: "",
  });
}

/**
 * Show the prompt template selector UI
 */
async function showPromptTemplateSelector(blockUuid: string) {
  const pages = await fetchPromptPages();
  
  if (pages.length === 0) {
    const namespace = logseq.settings?.promptNamespace || "prompt";
    logseq.App.showMsg(`No pages found in "${namespace}/" namespace`, "warning");
    return;
  }

  // Get block content for preview
  const blockContent = await getBlockContentWithChildren(blockUuid);
  
  // Build the UI HTML
  const buttonStyle = `
    padding: 4px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  `.replace(/\n/g, "");

  const listItems = pages
    .map((page, index) => {
      const displayName = page.replace(/^prompt\//i, "");
      return `
        <div class="prompt-item" data-page="${page}" data-index="${index}"
             style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
          <span style="flex: 1; font-weight: 500;">${displayName}</span>
          <div style="display: flex; gap: 6px;">
            <button class="prompt-btn-invoke" data-page="${page}" style="${buttonStyle}"
                    onmouseover="this.style.background='#e8f4ff';this.style.borderColor='#4a9eff'"
                    onmouseout="this.style.background='#fff';this.style.borderColor='#ddd'">
              调用
            </button>
            <button class="prompt-btn-copy" data-page="${page}" style="${buttonStyle}"
                    onmouseover="this.style.background='#e8fff4';this.style.borderColor='#4aff9e'"
                    onmouseout="this.style.background='#fff';this.style.borderColor='#ddd'">
              复制
            </button>
            <button class="prompt-btn-edit" data-page="${page}" style="${buttonStyle}"
                    onmouseover="this.style.background='#fff4e8';this.style.borderColor='#ffae4a'"
                    onmouseout="this.style.background='#fff';this.style.borderColor='#ddd'">
              编辑模板
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  const uiTemplate = `
    <div id="prompt-selector-container" style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--ls-primary-background-color, white);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      min-width: 450px;
      max-width: 600px;
      max-height: 500px;
      z-index: 9999;
      font-family: var(--ls-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    ">
      <div style="padding: 12px 16px; border-bottom: 1px solid var(--ls-border-color, #e0e0e0); font-weight: 600; display: flex; justify-content: space-between; align-items: center; background: var(--ls-secondary-background-color, #f7f7f7);">
        <span>Select Prompt Template</span>
        <span id="prompt-close-btn" style="cursor: pointer; font-size: 18px; color: #666;">&times;</span>
      </div>
      <div style="max-height: 400px; overflow-y: auto;">
        ${listItems}
      </div>
    </div>
    <div id="prompt-backdrop" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 9998;
    "></div>
  `;

  logseq.provideUI({
    key: PROMPT_UI_KEY,
    template: uiTemplate,
    style: {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      zIndex: 9998,
    },
  });

  // Store block UUID for later use
  (window as any).__promptBlockUuid = blockUuid;
  (window as any).__promptBlockContent = blockContent;

  // Set up event listeners after UI is rendered
  setTimeout(() => {
    const container = top?.document.getElementById("prompt-selector-container");
    const backdrop = top?.document.getElementById("prompt-backdrop");
    const closeBtn = top?.document.getElementById("prompt-close-btn");

    if (backdrop) {
      backdrop.onclick = () => hidePromptUI();
    }

    if (closeBtn) {
      closeBtn.onclick = () => hidePromptUI();
    }

    if (container) {
      // Handle "调用" (Invoke) button - send to LLM
      const invokeButtons = container.querySelectorAll(".prompt-btn-invoke");
      invokeButtons.forEach((btn) => {
        (btn as HTMLElement).onclick = async (e) => {
          e.stopPropagation();
          const pageName = btn.getAttribute("data-page");
          if (pageName) {
            await handlePromptAction(pageName, "invoke");
          }
        };
      });

      // Handle "复制" (Copy) button - copy to clipboard
      const copyButtons = container.querySelectorAll(".prompt-btn-copy");
      copyButtons.forEach((btn) => {
        (btn as HTMLElement).onclick = async (e) => {
          e.stopPropagation();
          const pageName = btn.getAttribute("data-page");
          if (pageName) {
            await handlePromptAction(pageName, "copy");
          }
        };
      });

      // Handle "编辑模板" (Edit) button - navigate to template page
      const editButtons = container.querySelectorAll(".prompt-btn-edit");
      editButtons.forEach((btn) => {
        (btn as HTMLElement).onclick = async (e) => {
          e.stopPropagation();
          const pageName = btn.getAttribute("data-page");
          if (pageName) {
            await handlePromptAction(pageName, "edit");
          }
        };
      });
    }
  }, 100);
}

/**
 * Handle prompt template action
 * @param pageName The template page name
 * @param action The action to perform: "invoke" | "copy" | "edit"
 */
async function handlePromptAction(pageName: string, action: "invoke" | "copy" | "edit") {
  // For edit action, just navigate to the page
  if (action === "edit") {
    hidePromptUI();
    logseq.App.pushState("page", { name: pageName });
    // Cleanup
    delete (window as any).__promptBlockUuid;
    delete (window as any).__promptBlockContent;
    return;
  }

  hidePromptUI();

  const blockUuid = (window as any).__promptBlockUuid;
  const blockContent = (window as any).__promptBlockContent;
  console.log({
    LogseqAutomaticLinker: "handlePromptAction start",
    pageName,
    action,
    blockUuid,
    blockContent,
    blockContentLength: blockContent?.length,
  });

  if (!blockContent) {
    logseq.App.showMsg("No block content available", "error");
    return;
  }

  // Get page-specific model override (gpt-model:: property)
  const templatePage = await logseq.Editor.getPage(pageName);
  const pageModel = templatePage?.properties?.["gpt-model"] || templatePage?.properties?.gptModel;

  console.log({
    LogseqAutomaticLinker: "handlePromptAction page properties",
    pageName,
    action,
    pageModel,
    properties: templatePage?.properties,
  });

  // Get the template content
  const templateContent = await getPageContent(pageName);
  console.log({
    LogseqAutomaticLinker: "handlePromptAction templateContent",
    pageName,
    templateContent,
    templateContentLength: templateContent?.length,
  });

  if (!templateContent) {
    logseq.App.showMsg(`Failed to read template: ${pageName}`, "error");
    return;
  }

  // Process the template (expand embeds and replace placeholders)
  const result = await processTemplate(templateContent, blockContent);
  console.log({
    LogseqAutomaticLinker: "handlePromptAction result",
    resultLength: result?.length,
    resultPreview: result?.substring(0, 200),
  });

  if (action === "invoke") {
    // Send to LLM and insert response as child block
    await sendToLLMAndInsertResponse(blockUuid, result, pageModel);
  } else if (action === "copy") {
    // Copy to clipboard
    const success = await copyToClipboard(result);
    if (success) {
      logseq.App.showMsg("Copied to clipboard!", "success");
    } else {
      logseq.App.showMsg("Failed to copy to clipboard", "error");
    }
  }

  console.log({
    LogseqAutomaticLinker: "handlePromptAction complete",
    action,
    pageName,
    blockContentLength: blockContent?.length,
    templateContentLength: templateContent?.length,
    resultLength: result?.length,
  });

  // Cleanup
  delete (window as any).__promptBlockUuid;
  delete (window as any).__promptBlockContent;
}

/**
 * Send prompt to LLM API and insert response as child block
 * @param blockUuid The UUID of the block to insert response under
 * @param prompt The prompt to send to LLM
 * @param pageModel Optional model override from page property (gpt-model::)
 */
async function sendToLLMAndInsertResponse(blockUuid: string, prompt: string, pageModel?: string) {
  const apiUrl = logseq.settings?.llmApiUrl;
  const apiKey = logseq.settings?.llmApiKey;
  // Use page-specific model if provided, otherwise use settings default
  const model = pageModel || logseq.settings?.llmModel || "gpt-4";

  if (!apiUrl || !apiKey) {
    logseq.App.showMsg("Please configure LLM API URL and API Key in settings", "error");
    return;
  }

  logseq.App.showMsg("Sending to LLM...", "info");

  console.log({
    LogseqAutomaticLinker: "sendToLLMAndInsertResponse",
    blockUuid,
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 200),
    apiUrl,
    model,
  });

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({
        LogseqAutomaticLinker: "LLM API error",
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      logseq.App.showMsg(`LLM API error: ${response.status} ${response.statusText}`, "error");
      return;
    }

    const data = await response.json();
    const llmResponse = data.choices?.[0]?.message?.content;

    console.log({
      LogseqAutomaticLinker: "LLM response received",
      responseLength: llmResponse?.length,
      responsePreview: llmResponse?.substring(0, 200),
    });

    if (!llmResponse) {
      logseq.App.showMsg("Empty response from LLM", "warning");
      return;
    }

    // Insert response as child block
    await logseq.Editor.insertBlock(blockUuid, llmResponse, {
      sibling: false, // Insert as child
    });

    logseq.App.showMsg("LLM response inserted!", "success");

  } catch (error) {
    console.error({
      LogseqAutomaticLinker: "sendToLLMAndInsertResponse error",
      error,
    });
    logseq.App.showMsg(`Error calling LLM: ${error}`, "error");
  }
}

// ============== End Prompt Template Feature ==============

const main = async () => {
  getPages();
  dateFormat = (await logseq.App.getUserConfigs()).preferredDateFormat;
  logseq.DB.onChanged((e) => {
    if (
      e.txMeta?.outlinerOp == "insert-blocks" ||
      e.txMeta?.outlinerOp == "insertBlocks"
    ) {
      if (logseq.settings?.enableAutoParse) {
        blockArray?.forEach(parseBlockForLink);
      }
      console.debug({ LogseqAutomaticLinker: "Enter pressed" });
      blockArray = [];
    } else {
      console.debug({ LogseqAutomaticLinker: "Something changed" });
      //if blocks array doesn't already contain the block uuid, push to it
      const block = e.blocks[0].uuid;
      if (!blockArray.includes(block)) {
        blockArray.push(block);
      }
    }
  });
  logseq.App.onCurrentGraphChanged(getPages);
  logseq.Editor.registerBlockContextMenuItem("Parse Block for Links", (e) => {
    return parseBlockForLink(e.uuid);
  });

  // Register Split Block functionality
  logseq.Editor.registerBlockContextMenuItem("Split Block", (e) => {
    return splitBlockAction(e.uuid);
  });

  logseq.Editor.registerSlashCommand("Split Block", (e) => {
    return splitBlockAction(e.uuid);
  });

  // Register page menu item to split all blocks in the page
  logseq.App.registerPageMenuItem(
    "Split all blocks in this page",
    async (e) => {
      const page = await logseq.Editor.getPage(e.page);
      if (page) {
        await splitAllBlocksInPage(page.originalName || page.name);
      }
    }
  );

  // Register page menu item to convert alias links to original
  logseq.App.registerPageMenuItem(
    "Convert alias links to original",
    async (e) => {
      const page = await logseq.Editor.getPage(e.page);
      if (page) {
        await convertAliasLinksInPage(page.originalName || page.name);
      }
    }
  );

  // Register page menu item to unlink all references to the current page
  logseq.Editor.registerPageMenuItem(
    "Unlink all references to this page",
    async (e) => {
      const page = await logseq.Editor.getPage(e.page);
      if (page) {
        const pageName = page.originalName || page.name;
        unlinkAllReferencesToPage(pageName);
      }
    }
  );

  // Register slash command to unlink all references to the current page
  logseq.Editor.registerSlashCommand(
    "Unlink all references to this page",
    async () => {
      const currentPage = await logseq.Editor.getCurrentPage();
      if (currentPage) {
        const pageName = currentPage.originalName || currentPage.name;
        unlinkAllReferencesToPage(pageName);
      } else {
        logseq.App.showMsg("Please run this command on a page", "warning");
      }
    }
  );
  logseq.App.registerCommandShortcut(
    { binding: logseq.settings?.stateKeybinding },
    () => {
      getPages();
      blockArray = [];
      const enabledText = logseq.settings?.enableAutoParse
        ? "disabled"
        : "enabled";
      logseq.App.showMsg(`Auto Parse Links ${enabledText}`);
      logseq.updateSettings({
        enableAutoParse: !logseq.settings?.enableAutoParse,
      });
    }
  );
  logseq.App.registerCommandShortcut(
    { binding: logseq.settings?.parseSingleBlockKeybinding },
    (e) => {
      getPages();
      parseBlockForLink(e.uuid);
    }
  );

  // Register shortcut to go to today's journal page
  logseq.App.registerCommandShortcut(
    { binding: logseq.settings?.goToTodayKeybinding },
    () => {
      goToTodayJournal();
    }
  );

  // Register shortcut for prompt template selector
  logseq.App.registerCommandShortcut(
    { binding: logseq.settings?.promptTemplateKeybinding },
    async (e) => {
      if (e.uuid) {
        await showPromptTemplateSelector(e.uuid);
      } else {
        logseq.App.showMsg("Please focus on a block first", "warning");
      }
    }
  );

  // Register shortcut for split block
  logseq.App.registerCommandShortcut(
    { binding: logseq.settings?.splitBlockKeybinding },
    async (e) => {
      let blockUuid = e.uuid;
      // Fallback: try to get current block if not in editing mode
      if (!blockUuid) {
        const currentBlock = await logseq.Editor.getCurrentBlock();
        blockUuid = currentBlock?.uuid;
      }
      if (blockUuid) {
        await splitBlockAction(blockUuid);
      } else {
        logseq.App.showMsg("Please focus on a block first", "warning");
      }
    }
  );

  // Register slash command for prompt template
  logseq.Editor.registerSlashCommand("Apply Prompt Template", async (e) => {
    if (e.uuid) {
      await showPromptTemplateSelector(e.uuid);
    }
  });
};

// ============== Alias Link Conversion Feature ==============

/**
 * Convert alias links to original page links in a specific page.
 * Only affects pages with auto-link-to-original:: true property.
 */
async function convertAliasLinksInPage(pageName: string) {
  logseq.App.showMsg(`Scanning blocks in "${pageName}"...`, "info");

  try {
    // Ensure we have the latest alias mapping
    const aliasMap = await fetchAliasToOriginalMap();
    
    if (aliasMap.size === 0) {
      logseq.App.showMsg("No pages with auto-link-to-original:: true found", "warning");
      return;
    }

    // Get all blocks in the page
    const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);
    if (!pageBlocksTree || pageBlocksTree.length === 0) {
      logseq.App.showMsg("No blocks found in this page", "warning");
      return;
    }

    // Collect all blocks recursively
    const allBlocks: any[] = [];
    function collectBlocks(blocks: any[]) {
      for (const block of blocks) {
        if (block.uuid && block.content) {
          allBlocks.push(block);
        }
        if (block.children && block.children.length > 0) {
          collectBlocks(block.children);
        }
      }
    }
    collectBlocks(pageBlocksTree);

    console.log({
      LogseqAutomaticLinker: "convertAliasLinksInPage",
      pageName,
      blockCount: allBlocks.length,
      aliasMapSize: aliasMap.size,
    });

    let updatedBlocksCount = 0;
    let totalLinksConverted = 0;

    // Process each block
    for (const block of allBlocks) {
      let content = block.content;
      let modified = false;
      let linksInBlock = 0;

      // Check for each alias
      for (const [aliasLower, originalName] of aliasMap.entries()) {
        // Match [[alias]] or #[[alias]] (case-insensitive for the alias part)
        const linkRegex = new RegExp(
          `(#?)\\[\\[(${escapeRegex(aliasLower)})\\]\\]`,
          "gi"
        );

        const newContent = content.replace(linkRegex, (match: string, prefix: string, linkTarget: string) => {
          // Only replace if it's actually the alias (case-insensitive)
          if (linkTarget.toLowerCase() === aliasLower) {
            linksInBlock++;
            return `${prefix}[[${originalName}]]`;
          }
          return match;
        });

        if (newContent !== content) {
          content = newContent;
          modified = true;
        }
      }

      // Update block if modified
      if (modified) {
        await logseq.Editor.updateBlock(block.uuid, content);
        updatedBlocksCount++;
        totalLinksConverted += linksInBlock;
      }
    }

    // Show result
    if (updatedBlocksCount > 0) {
      logseq.App.showMsg(
        `Converted ${totalLinksConverted} alias links in ${updatedBlocksCount} blocks`,
        "success"
      );
    } else {
      logseq.App.showMsg("No alias links found to convert in this page", "info");
    }

    console.log({
      LogseqAutomaticLinker: "convertAliasLinksInPage completed",
      pageName,
      updatedBlocksCount,
      totalLinksConverted,
    });

  } catch (error) {
    console.error({ LogseqAutomaticLinker: "convertAliasLinksInPage error", error });
    logseq.App.showMsg(`Error: ${error}`, "error");
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

logseq.ready(main).catch(console.error);
