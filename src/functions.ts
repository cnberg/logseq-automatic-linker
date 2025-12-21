// Use random UUIDs instead of manually generated strings
const CODE_BLOCK_PLACEHOLDER = "71e46a9e-1150-49c3-a04b-0491ebe05922";
const INLINE_CODE_PLACEHOLDER = "164b97c2-beb7-4204-99b4-6ec2ddc93f9c";
const PROPERTY_PLACEHOLDER = "50220b1c-63f0-4f57-aa73-08c4d936a419";
const MARKDOWN_LINK_PLACEHOLDER = "53c65a4a-137d-44a8-8849-8ec6ca411942";
const EXISTING_LINK_PLACEHOLDER = "a1b2c3d4-5678-90ab-cdef-1234567890ab";
// Temporary placeholder prefix for new links during processing to prevent nested matching
const TEMP_LINK_PLACEHOLDER_PREFIX = "@@TEMPLINK@@";

// Cache for compiled regular expressions to avoid repeated compilation
const regexCache = new Map<string, RegExp>();
const chineseRegexCache = new Map<string, RegExp>();

// Extended CJK Unicode ranges for Chinese character detection
// - \u4e00-\u9fff: CJK Unified Ideographs (basic Chinese characters)
// - \u3400-\u4dbf: CJK Unified Ideographs Extension A (rare characters)
// - \uf900-\ufaff: CJK Compatibility Ideographs
// - \u3000-\u303f: CJK Symbols and Punctuation
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/**
 * Check if a string contains any CJK (Chinese/Japanese/Korean) characters.
 * Used to determine which regex strategy to use for page matching.
 */
function containsCJK(s: string): boolean {
  return CJK_REGEX.test(s);
}

// CJK character ranges for boundary detection (same as CJK_REGEX but as string for use in regex)
const CJK_BOUNDARY_CHARS = "\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff";

// Get or create cached regex for a page
function getPageRegex(page: string): RegExp {
  const cacheKey = page;
  if (!regexCache.has(cacheKey)) {
    // Include CJK characters as word boundaries so "中文abc中文" can match "abc"
    const boundaryChars = `[\\s,.:;"'${CJK_BOUNDARY_CHARS}]`;
    const regex = new RegExp(
      `(\\w*(?<!\\[{2}[^[\\]]*)\\w*(?<!\\#)\\w*(?<!\\w+:\\/\\/\\S*))(?<=${boundaryChars}|^)(${parseForRegex(
        page
      )})(?![^[\\]]*\\]{2})(?=${boundaryChars}|$)`,
      "gi"
    );
    regexCache.set(cacheKey, regex);
  }
  return regexCache.get(cacheKey)!;
}

function getChineseRegex(page: string): RegExp {
  if (!chineseRegexCache.has(page)) {
    const regex = new RegExp(
      `(?<!\\[)${parseForRegex(page)}(?!\\])`,
      "gm"
    );
    chineseRegexCache.set(page, regex);
  }
  return chineseRegexCache.get(page)!;
}

// Clear regex cache (call when page list changes significantly)
export function clearRegexCache(): void {
  regexCache.clear();
  chineseRegexCache.clear();
}

const MARKER_PLACEHOLDERS = {
  NOW: "2f112da4-9248-4e2d-84d5-d9488291799f",
  LATER: "be8228a3-8d31-4592-b0a5-aa43ce1cab05",
  DOING: "36080c19-b7d7-4397-8ecf-2bcf670d0204",
  DONE: "8d03ffae-c539-48da-891a-3020a18812f1",
  CANCELED: "774f1b24-7533-4c86-93b2-ab4c2cd43b7d",
  CANCELLED: "7b6a5608-b554-489b-97a3-f9043e436903",
  "IN-PROGRESS": "842916b9-3f8e-4fd7-8490-6015a30a1dce",
  TODO: "1f5dc7a6-9479-4692-9f67-8034088395b5",
  WAIT: "d7a8bdf1-1336-4538-b35b-14459e50046e",
  WAITING: "d9c67fde-12ae-41e5-9f70-9959c172154b",
};
const CUSTOM_QUERY_PLACEHOLDER = "3cf737a1-1a29-4dd1-8db5-45effa23c810";

const parseForRegex = (s: string) => {
  //Remove regex special characters from s
  // s = s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  s = s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

  return s;
  // .replaceAll("[", "\\[")
  // .replaceAll("]", "\\]")
  // .replaceAll(")", "\\)")
  // .replaceAll("(", "\\(")
  // .replaceAll("+", "\\+")
  // .replaceAll("-", "\\-")
  // .replaceAll("{", "\\{")
  // .replaceAll("}", "\\}")
  // .replaceAll("*", "\\*")
  // .replaceAll("?", "\\?")
  // .replaceAll(".", "\\.")
  // .replaceAll("^", "\\^")
  // .replaceAll("$", "\\$")
  // .replaceAll("|", "\\|")
  // .replaceAll("\\", "\\\\")
  // .replaceAll("/", "\\/")
  // .replaceAll(" ", "\\s+");
};

export function replaceContentWithPageLinks(
  allPages: string[],
  content: string,
  parseAsTags: boolean,
  parseSingleWordAsTag: boolean,
  aliasToOriginalMap: Map<string, string> = new Map()
): [string, boolean] {
  // Handle content that should not be automatically linked
  const codeblockReversalTracker = [];
  const inlineCodeReversalTracker = [];
  const propertyTracker = [];
  const markdownLinkTracker = [];
  const customQueryTracker = [];

  content = content.replaceAll(/```[\s\S]*?```/g, (match) => {
    codeblockReversalTracker.push(match);
    console.debug({ LogseqAutomaticLinker: "code block found", match });
    return CODE_BLOCK_PLACEHOLDER;
  });

  content = content.replaceAll(/`[^`]*`/g, (match) => {
    inlineCodeReversalTracker.push(match);
    console.debug({ LogseqAutomaticLinker: "inline code found", match });
    return INLINE_CODE_PLACEHOLDER;
  });

  content = content.replaceAll(/ *[^\s]+:: /g, (match) => {
    propertyTracker.push(match);
    console.debug({ LogseqAutomaticLinker: "property found", match });
    return PROPERTY_PLACEHOLDER;
  });

  // Broken Markdown links with nested pages won't be detected by this regex and have to be fixed manually.
  // Example: [[[page]] This is a broken Markdown link](http://example.com)
  content = content.replaceAll(/\[(([^\[\]]|\\\[|\\\])+)\]\(.*\)/g, (match) => {
    markdownLinkTracker.push(match);
    console.debug({ LogseqAutomaticLinker: "Markdown link found", match });
    return MARKDOWN_LINK_PLACEHOLDER;
  });

  // Replace todo markers with placeholders
  content = content.replaceAll(
    /^(NOW|LATER|DOING|DONE|CANCELED|CANCELLED|IN-PROGRESS|TODO|WAIT|WAITING)/gm,
    (match) => {
      console.debug({ LogseqAutomaticLinker: "To Do marker found", match });
      return MARKER_PLACEHOLDERS[match];
    }
  );

  content = content.replaceAll(
    /#\+BEGIN_QUERY((?!#\+END_QUERY).|\n)*#\+END_QUERY/gim,
    (match) => {
      customQueryTracker.push(match);
      console.debug({ LogseqAutomaticLinker: "Custom query found", match });
      return CUSTOM_QUERY_PLACEHOLDER;
    }
  );

  // Convert tags to links first: #[[tag]] -> [[tag]], #tag -> [[tag]]
  // This allows alias conversion and other processing to work on tags too
  let tagsConverted = false;
  
  // Protect priority markers [#A], [#B], [#C] etc. before tag conversion
  const priorityMarkerRegex = /\[#([A-Za-z])\]/g;
  const priorityMarkers: string[] = [];
  const PRIORITY_PLACEHOLDER = "@@PRIORITY@@";
  content = content.replaceAll(priorityMarkerRegex, (match) => {
    priorityMarkers.push(match);
    return PRIORITY_PLACEHOLDER;
  });
  
  // Convert #[[tag]] to [[tag]]
  const contentBeforeTagConversion = content;
  content = content.replaceAll(/#\[\[([^\[\]]+)\]\]/g, (match, tagName) => {
    console.debug({ LogseqAutomaticLinker: "tag with brackets converted", match, tagName });
    return `[[${tagName}]]`;
  });
  
  // Convert #tag to [[tag]] (simple tags - word characters, CJK, namespace paths, and hyphens)
  // Match # followed by word characters (including CJK) that form a valid tag
  // Supports namespace tags like #ABC/CDE
  // Don't match headers (##), special syntax, or inside brackets
  content = content.replaceAll(/(?<!\[)#([\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff][\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\/-]*)/g, (match, tagName) => {
    console.debug({ LogseqAutomaticLinker: "simple tag converted", match, tagName });
    return `[[${tagName}]]`;
  });
  
  if (content !== contentBeforeTagConversion) {
    tagsConverted = true;
  }
  
  // Restore priority markers
  priorityMarkers.forEach((marker) => {
    content = content.replace(PRIORITY_PLACEHOLDER, marker);
  });

  // Protect existing [[...]] links from being matched inside
  // This prevents "[[一二三四]]" from having "二三" matched inside it
  const existingLinksTracker: string[] = [];
  content = content.replaceAll(/\[\[[^\[\]]+\]\]/g, (match) => {
    existingLinksTracker.push(match);
    console.debug({ LogseqAutomaticLinker: "existing link found", match });
    return EXISTING_LINK_PLACEHOLDER;
  });

  let needsUpdate = tagsConverted;
  // Map to store temporary placeholders and their actual link content
  const tempLinksMap: Map<string, string> = new Map();
  let tempLinkIndex = 0;

  console.log({
    LogseqAutomaticLinker: "replaceContentWithPageLinks after protection",
    originalContentLength: content.length,
    contentAfterProtection: content,
    protectedItems: {
      codeblocks: codeblockReversalTracker.length,
      inlineCodes: inlineCodeReversalTracker.length,
      properties: propertyTracker.length,
      markdownLinks: markdownLinkTracker.length,
      customQueries: customQueryTracker.length,
      existingLinks: existingLinksTracker.length,
      existingLinksContent: existingLinksTracker,
    },
    allPagesCount: allPages.length,
    aliasMapSize: aliasToOriginalMap.size,
    aliasMapEntries: Array.from(aliasToOriginalMap.entries()),
  });

  allPages.forEach((page) => {
    // Skip empty pages
    if (page.length === 0) {
      return;
    }

    // Use CJK regex for pages containing Chinese/Japanese/Korean characters
    // because CJK characters don't have word boundaries like Western languages
    if (containsCJK(page)) {
      // Use cached Chinese regex
      const chineseRegex = getChineseRegex(page);
      // Use temporary placeholder (index-based) to prevent nested matching
      const newContent = content.replaceAll(chineseRegex, () => {
        const placeholder = `${TEMP_LINK_PLACEHOLDER_PREFIX}${tempLinkIndex++}@@`;
        // Check if this page is an alias that should link to original
        const linkTarget = aliasToOriginalMap.get(page.toLowerCase()) || page;
        const actualLink = parseAsTags ? `#${linkTarget}` : `[[${linkTarget}]]`;
        console.log({
          LogseqAutomaticLinker: "CJK page matched",
          page,
          pageLower: page.toLowerCase(),
          aliasLookup: aliasToOriginalMap.get(page.toLowerCase()),
          linkTarget,
          actualLink,
        });
        tempLinksMap.set(placeholder, actualLink);
        return placeholder;
      });
      if (newContent !== content) {
        content = newContent;
        needsUpdate = true;
      }
    } else {
      // Use word-boundary based regex for non-CJK pages
      const pageFoundInContent = content.toUpperCase().includes(page.toUpperCase());
      if (pageFoundInContent) {
        // Use cached regex for non-Chinese pages
        const regex = getPageRegex(page);
        // Test if regex matches before replacement
        const regexMatches = regex.test(content);
        // Reset regex lastIndex since we used test()
        regex.lastIndex = 0;
        
        console.log({
          LogseqAutomaticLinker: "non-CJK page checking",
          page,
          pageLower: page.toLowerCase(),
          pageFoundInContent,
          regexMatches,
          regexSource: regex.source,
          contentSnippet: content.substring(0, 200),
        });
        
        if (!regexMatches) {
          console.log({
            LogseqAutomaticLinker: "non-CJK page NOT matched by regex",
            page,
            reason: "Regex did not match despite page string found in content",
            hint: "Check if page is inside protected content or boundary chars are missing",
          });
        }
        
        const newContent = content.replaceAll(regex, (match) => {
          const hasSpaces = /\s/g.test(match);

          // If page is lowercase, keep the original case of the input (match);
          // Otherwise, use the page case
          let whichCase = page == page.toLowerCase() ? match : page;
          
          // Check if this page is an alias that should link to original
          const linkTarget = aliasToOriginalMap.get(page.toLowerCase()) || whichCase;

          console.log({
            LogseqAutomaticLinker: "non-CJK page matched",
            page,
            match,
            pageLower: page.toLowerCase(),
            aliasLookup: aliasToOriginalMap.get(page.toLowerCase()),
            whichCase,
            linkTarget,
          });

          // Use temporary placeholder (index-based) to prevent nested matching
          const placeholder = `${TEMP_LINK_PLACEHOLDER_PREFIX}${tempLinkIndex++}@@`;
          let actualLink: string;
          if (parseAsTags || (parseSingleWordAsTag && !hasSpaces)) {
            actualLink = hasSpaces ? `#[[${linkTarget}]]` : `#${linkTarget}`;
          } else {
            actualLink = `[[${linkTarget}]]`;
          }
          tempLinksMap.set(placeholder, actualLink);
          return placeholder;
        });
        if (newContent !== content) {
          content = newContent;
          needsUpdate = true;
        }
      }
    }
  });

  // Convert temporary placeholders to actual links
  tempLinksMap.forEach((actualLink, placeholder) => {
    content = content.replace(placeholder, actualLink);
  });

  // Restore existing links before space cleanup so they are also processed
  // Also convert alias links to original page names if auto-link-to-original is set
  existingLinksTracker.forEach((value) => {
    let restoredValue = value;
    
    // Check if this is a link that should be converted to original page name
    // Match [[PageName]] or #[[PageName]] format
    const linkMatch = value.match(/^(#?)\[\[([^\[\]]+)\]\]$/);
    if (linkMatch && aliasToOriginalMap.size > 0) {
      const prefix = linkMatch[1]; // "#" or ""
      const linkTarget = linkMatch[2];
      const originalName = aliasToOriginalMap.get(linkTarget.toLowerCase());
      
      if (originalName && originalName.toLowerCase() !== linkTarget.toLowerCase()) {
        // Convert alias link to original page name
        restoredValue = `${prefix}[[${originalName}]]`;
        needsUpdate = true;
        console.log({
          LogseqAutomaticLinker: "existing link converted to original",
          original: value,
          converted: restoredValue,
          aliasLower: linkTarget.toLowerCase(),
          originalName,
        });
      }
    }
    
    content = content.replace(EXISTING_LINK_PLACEHOLDER, restoredValue);
  });

  // Remove spaces around links only when adjacent to CJK characters
  // This preserves English spacing like "word [[link]] word" 
  // but removes unnecessary spaces in Chinese like "中文 [[link]] 中文" → "中文[[link]]中文"
  const contentBeforeSpaceCleanup = content;
  // CJK character class for lookbehind/lookahead
  const cjkPattern = `[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff]`;
  
  // Remove space before [[ when preceded by CJK character
  content = content.replace(new RegExp(`(?<=${cjkPattern}) +\\[\\[`, "g"), "[[");
  // Remove space after ]] when followed by CJK character
  content = content.replace(new RegExp(`\\]\\] +(?=${cjkPattern})`, "g"), "]]");
  // Remove space before #[[ when preceded by CJK character
  content = content.replace(new RegExp(`(?<=${cjkPattern}) +#\\[\\[`, "g"), "#[[");
  // Remove space before # tags when preceded by CJK character
  content = content.replace(new RegExp(`(?<=${cjkPattern}) +#(?=[^\\s\\[#])`, "g"), "#");
  // Remove space after ]] when followed by CJK punctuation
  content = content.replace(/\]\] +(?=[，。！？；：])/g, "]]");
  
  if (content !== contentBeforeSpaceCleanup) {
    needsUpdate = true;
  }

  // Restore content that should not be automatically linked
  codeblockReversalTracker?.forEach((value, index) => {
    content = content.replace(CODE_BLOCK_PLACEHOLDER, value);
  });
  inlineCodeReversalTracker?.forEach((value, index) => {
    content = content.replace(INLINE_CODE_PLACEHOLDER, value);
  });
  propertyTracker?.forEach((value, index) => {
    content = content.replace(PROPERTY_PLACEHOLDER, value);
  });
  markdownLinkTracker?.forEach((value, index) => {
    content = content.replace(MARKDOWN_LINK_PLACEHOLDER, value);
  });
  Object.entries(MARKER_PLACEHOLDERS).forEach(([marker, markerPlaceholder]) => {
    content = content.replaceAll(markerPlaceholder, marker);
  });

  customQueryTracker?.forEach((value, index) => {
    content = content.replace(CUSTOM_QUERY_PLACEHOLDER, value);
  });

  return [content, needsUpdate];
}
