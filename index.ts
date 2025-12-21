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
  const listItems = pages
    .map((page, index) => {
      const displayName = page.replace(/^prompt\//i, "");
      return `
        <div class="prompt-item" data-page="${page}" data-index="${index}"
             style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #e0e0e0;"
             onmouseover="this.style.backgroundColor='#f0f0f0'"
             onmouseout="this.style.backgroundColor='transparent'">
          ${displayName}
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      min-width: 300px;
      max-width: 500px;
      max-height: 400px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="padding: 12px 16px; border-bottom: 1px solid #e0e0e0; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
        <span>Select Prompt Template</span>
        <span id="prompt-close-btn" style="cursor: pointer; font-size: 18px; color: #666;">&times;</span>
      </div>
      <div style="max-height: 300px; overflow-y: auto;">
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
      const items = container.querySelectorAll(".prompt-item");
      items.forEach((item) => {
        (item as HTMLElement).onclick = async () => {
          const pageName = item.getAttribute("data-page");
          if (pageName) {
            await handlePromptSelection(pageName);
          }
        };
      });
    }
  }, 100);
}

/**
 * Handle prompt template selection
 */
async function handlePromptSelection(pageName: string) {
  hidePromptUI();

  const blockContent = (window as any).__promptBlockContent;
  console.log({
    LogseqAutomaticLinker: "handlePromptSelection start",
    pageName,
    blockContent,
    blockContentLength: blockContent?.length,
  });

  if (!blockContent) {
    logseq.App.showMsg("No block content available", "error");
    return;
  }

  // Get the template content
  const templateContent = await getPageContent(pageName);
  console.log({
    LogseqAutomaticLinker: "handlePromptSelection templateContent",
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
    LogseqAutomaticLinker: "handlePromptSelection result",
    resultLength: result?.length,
    resultPreview: result?.substring(0, 200),
  });

  // Copy to clipboard
  const success = await copyToClipboard(result);
  if (success) {
    logseq.App.showMsg("Copied to clipboard!", "success");
  } else {
    logseq.App.showMsg("Failed to copy to clipboard", "error");
  }

  console.log({
    LogseqAutomaticLinker: "handlePromptSelection complete",
    success,
    pageName,
    blockContentLength: blockContent?.length,
    templateContentLength: templateContent?.length,
    resultLength: result?.length,
  });

  // Cleanup
  delete (window as any).__promptBlockUuid;
  delete (window as any).__promptBlockContent;
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

  // Register slash command for prompt template
  logseq.Editor.registerSlashCommand("Apply Prompt Template", async (e) => {
    if (e.uuid) {
      await showPromptTemplateSelector(e.uuid);
    }
  });

  // Register toolbar button to show alias pages
  logseq.App.registerUIItem("toolbar", {
    key: "show-alias-pages",
    template: `
      <a class="button" data-on-click="showAliasPages" title="Show Auto-Link-to-Original Pages">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </a>
    `,
  });

  // Handle toolbar button click
  logseq.provideModel({
    async showAliasPages() {
      await showAliasPagesSidebar();
    },
  });
};

// ============== Alias Pages Sidebar Feature ==============

const ALIAS_SIDEBAR_KEY = "alias-pages-sidebar";

/**
 * Show all pages with auto-link-to-original:: true in the right sidebar
 */
async function showAliasPagesSidebar() {
  // Query pages with auto-link-to-original:: true
  const query = `
    [:find (pull ?p [:block/name :block/original-name :block/properties])
     :where
     [?p :block/properties ?props]
     [(get ?props :auto-link-to-original) ?val]
     [(= ?val true)]]
  `;

  try {
    const results = await logseq.DB.datascriptQuery(query);
    
    if (!results || results.length === 0) {
      logseq.App.showMsg("No pages with auto-link-to-original:: true found", "warning");
      return;
    }

    // Extract page info
    const pages = results
      .map((r: any) => ({
        name: r[0]?.["original-name"] || r[0]?.["name"],
        aliases: r[0]?.properties?.alias || [],
      }))
      .filter((p: any) => p.name)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    console.log({ LogseqAutomaticLinker: "showAliasPagesSidebar", pages });

    // Build the sidebar content
    const listItems = pages
      .map((page: any, index: number) => {
        const aliases = Array.isArray(page.aliases) 
          ? page.aliases.join(", ") 
          : page.aliases || "";
        return `
          <div class="alias-page-item" style="
            padding: 10px 12px;
            border-bottom: 1px solid var(--ls-border-color, #e0e0e0);
            cursor: pointer;
          " data-page="${page.name}">
            <div style="font-weight: 500; color: var(--ls-link-text-color, #045591);">
              ${page.name}
            </div>
            ${aliases ? `<div style="font-size: 12px; color: var(--ls-secondary-text-color, #666); margin-top: 4px;">
              Aliases: ${aliases}
            </div>` : ""}
          </div>
        `;
      })
      .join("");

    const sidebarContent = `
      <div id="alias-pages-container" style="
        padding: 0;
        font-family: var(--ls-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      ">
        <div style="
          padding: 12px 16px;
          border-bottom: 1px solid var(--ls-border-color, #e0e0e0);
          font-weight: 600;
          background: var(--ls-secondary-background-color, #f7f7f7);
        ">
          Auto-Link-to-Original Pages (${pages.length})
        </div>
        <div style="max-height: calc(100vh - 150px); overflow-y: auto;">
          ${listItems}
        </div>
      </div>
    `;

    // Show in right sidebar using a custom page
    logseq.provideUI({
      key: ALIAS_SIDEBAR_KEY,
      path: "main-content-container",
      template: `<div></div>`,
    });

    // Use App.pushState to open sidebar, or create a virtual display
    // For now, show as a modal-like panel
    const uiTemplate = `
      <div id="alias-sidebar-panel" style="
        position: fixed;
        top: 48px;
        right: 0;
        width: 320px;
        height: calc(100vh - 48px);
        background: var(--ls-primary-background-color, white);
        border-left: 1px solid var(--ls-border-color, #e0e0e0);
        z-index: 999;
        box-shadow: -2px 0 10px rgba(0,0,0,0.1);
        overflow: hidden;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid var(--ls-border-color, #e0e0e0);
          background: var(--ls-secondary-background-color, #f7f7f7);
        ">
          <span style="font-weight: 600;">Auto-Link Pages (${pages.length})</span>
          <span id="alias-sidebar-close" style="cursor: pointer; font-size: 20px; padding: 4px;">×</span>
        </div>
        <div style="overflow-y: auto; height: calc(100% - 45px);">
          ${listItems}
        </div>
      </div>
    `;

    logseq.provideUI({
      key: ALIAS_SIDEBAR_KEY,
      template: uiTemplate,
      style: {
        position: "fixed",
        top: "0",
        right: "0",
        zIndex: 999,
      },
    });

    // Set up event listeners
    setTimeout(() => {
      const closeBtn = top?.document.getElementById("alias-sidebar-close");
      if (closeBtn) {
        closeBtn.onclick = () => hideAliasSidebar();
      }

      const items = top?.document.querySelectorAll(".alias-page-item");
      items?.forEach((item) => {
        (item as HTMLElement).onclick = async () => {
          const pageName = item.getAttribute("data-page");
          if (pageName) {
            hideAliasSidebar();
            // Navigate to the page
            logseq.App.pushState("page", { name: pageName });
          }
        };
      });
    }, 100);

  } catch (error) {
    console.error({ LogseqAutomaticLinker: "showAliasPagesSidebar error", error });
    logseq.App.showMsg(`Error: ${error}`, "error");
  }
}

/**
 * Hide the alias pages sidebar
 */
function hideAliasSidebar() {
  logseq.provideUI({
    key: ALIAS_SIDEBAR_KEY,
    template: "",
  });
}

// ============== End Alias Pages Sidebar Feature ==============

logseq.ready(main).catch(console.error);
