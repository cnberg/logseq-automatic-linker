import "@logseq/libs";
import { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
// @ts-ignore
import Sherlock from "sherlockjs";
import { getDateForPage } from "logseq-dateutils";
import { replaceContentWithPageLinks, clearRegexCache } from "./src/functions";

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
  
  result
    .filter(
      (item) =>
        item[0]["name"] && item[0].properties["auto-link-to-original"] && item[0].properties.alias
    )
    .forEach((item) => {
      const originalName = item[0]["name"];
      const aliases = item[0].properties.alias;
      if (Array.isArray(aliases)) {
        aliases.forEach((alias: string) => {
          // Store lowercase alias -> original name mapping
          map.set(alias.toLowerCase(), originalName);
        });
      } else if (typeof aliases === "string") {
        map.set(aliases.toLowerCase(), originalName);
      }
    });
  
  console.log({ LogseqAutomaticLinker: "fetchAliasToOriginalMap", map });
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
    pageList = pageList.concat((await fetchAliases()).flat());
    //Reverse sort pagelist on the basis of length so that longer page names are matched first
    pageList.sort((a, b) => b.length - a.length);
    // Clear regex cache when page list is refreshed
    clearRegexCache();
    console.log({ LogseqAutomaticLinker: "getPages", results, pageList });
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
    // getDateForPage returns format like "[[2025/12/14]]", we need to strip the brackets
    let todayPageName = getDateForPage(new Date(), dateFormat);
    if (todayPageName) {
      // Remove [[ and ]] if present
      todayPageName = todayPageName.replace(/^\[\[/, "").replace(/\]\]$/, "");
      // Navigate to today's journal page
      logseq.App.pushState("page", { name: todayPageName });
      console.log({ LogseqAutomaticLinker: "goToTodayJournal", todayPageName });
    } else {
      logseq.App.showMsg("Could not determine today's journal page", "warning");
    }
  } catch (error) {
    console.error({ LogseqAutomaticLinker: "goToTodayJournal error", error });
    logseq.App.showMsg(`Error navigating to today's journal: ${error}`, "error");
  }
}

async function parseBlockForLink(d: string) {
  if (d != null) {
    let block = await logseq.Editor.getBlock(d);
    if (block == null) {
      return;
    }

    console.log({ LogseqAutomaticLinker: "parseBlockForLink", block });

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
    if (needsUpdate) {
      logseq.Editor.updateBlock(block.uuid, `${content}`);
    }
  }
}

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
};
logseq.ready(main).catch(console.error);
