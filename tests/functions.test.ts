import { replaceContentWithPageLinks } from "../src/functions";

describe("replaceContentWithPageLinks()", () => {
  it("should preserve code blocks", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page"],
      "page before ```\npage within code block\n```\npage between\n```\nanother page within code block```\nand finally\n```\nwith `single` backticks and page within\n```\npage after",
      false,
      false
    );
    // Spaces around links are preserved for English text
    expect(content).toBe(
      "[[page]] before ```\npage within code block\n```\n[[page]] between\n```\nanother page within code block```\nand finally\n```\nwith `single` backticks and page within\n```\n[[page]] after"
    );
    expect(update).toBe(true);
  });

  it("should preserve inline code", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page"],
      "Page before\n`page inside inline code`\npage between\n`another page inline`\n`but not page if inline\nblock is split between newlines`\npage after",
      false,
      false
    );
    // Spaces around links are preserved for English text
    expect(content).toBe(
      "[[Page]] before\n`page inside inline code`\n[[page]] between\n`another page inline`\n`but not page if inline\nblock is split between newlines`\n[[page]] after"
    );
    expect(update).toBe(true);
  });

  it("should preserve properties", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page", "price"],
      `Some page here with price
        price:: 123
        page:: this is a property`,
      false,
      false
    );
    // Spaces around links are preserved for English text
    expect(content).toBe(
      `Some [[page]] here with [[price]]
        price:: 123
        page:: this is a property`
    );
    expect(update).toBe(true);
  });

  it("should preserve Markdown links", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page", "link", "Logseq"],
      `This page has a link: [page link will not be touched](http://a.com)
      [another page](http://b.com) also with a link
      [\\[This\\] is a Logseq page](https://logseq.com)`,
      false,
      false
    );
    // Spaces around links are preserved for English text
    expect(content).toBe(
      `This [[page]] has a [[link]]: [page link will not be touched](http://a.com)
      [another page](http://b.com) also with a [[link]]
      [\\[This\\] is a Logseq page](https://logseq.com)`
    );
    expect(update).toBe(true);
  });

  it("should preserve custom query scripts", () => {
    const customQueries = [
      `#+BEGIN_QUERY
    {
      :title [:h2 "In Progress"]
      :query [
        :find (pull ?b [*])
        :where
          [?b :block/uuid]
          [?b :block/marker ?marker]
           [(contains? #{"NOW", "DOING", "IN PROGRESS", "IN-PROGRESS"} ?marker)]
      ]
      :result-transform (
        fn [result] ( sort-by ( 
          fn [item] ( get item :block/priority "Z" )
        )
        result)
      )
      :remove-block-children? false
      :group-by-page? false
      :breadcrumb-show? false
      :collapsed? false
    }
    #+END_QUERY`,
      `#+BEGIN_QUERY
    {
      :title [:h2 "TO DO"]
      :query [
        :find (pull ?b [*])
        :where
          [?b :block/uuid]
          [?b :block/marker ?marker]
           [(contains? #{"TO DO", "LATER"} ?marker)]
      ]
      :result-transform (
        fn [result] ( sort-by ( 
          fn [item] ( get item :block/priority "Z" )
        )
        result)
      )
      :remove-block-children? false
      :group-by-page? false
      :breadcrumb-show? false
      :collapsed? false
    }
    #+END_QUERY`,
    ];

    const [content, update] = replaceContentWithPageLinks(
      ["In Progress", "find", "link"],
      `${customQueries[0]}
      
      Ths sentence contains a link
      
      ${customQueries[1]}`,
      false,
      false
    );

    // Spaces around links are preserved for English text
    expect(content).toEqual(
      `${customQueries[0]}
      
      Ths sentence contains a [[link]]
      
      ${customQueries[1]}`
    );
    expect(update).toBe(true);
  });

  // Spaces around links are preserved for English text
  it.each([
    {
      input: "NOW [#A] A started todo",
      expected: "NOW [#A] A started [[todo]]",
    },
    {
      input: "LATER [#B] A todo for later",
      expected: "LATER [#B] A [[todo]] for [[Later]]",
    },
    {
      input: "DOING [#A] Fix the todo marker issue",
      expected: "DOING [#A] Fix the [[todo]] marker issue",
    },
    { input: "DONE A done todo", expected: "DONE A [[Done]] [[todo]]" },
    {
      input: "CANCELED A canceled todo",
      expected: "CANCELED A [[Canceled]] [[todo]]",
    },
    {
      input: "CANCELLED A cancelled todo",
      expected: "CANCELLED A [[Cancelled]] [[todo]]",
    },
    {
      input: "IN-PROGRESS An in progress To Do",
      expected: "IN-PROGRESS An [[In Progress]] [[To Do]]",
    },
    { input: "TODO A todo", expected: "TODO A [[todo]]" },
    {
      input: "WAIT [#C] A todo waiting to be unblocked",
      expected: "WAIT [#C] A [[todo]] [[Waiting]] to be unblocked",
    },
    {
      input: "WAITING A waiting todo",
      expected: "WAITING A [[Waiting]] [[todo]]",
    },
  ])("should preserve the to do marker for $input", ({ input, expected }) => {
    let [content, update] = replaceContentWithPageLinks(
      [
        "Now",
        "Later",
        "Doing",
        "Done",
        "Canceled",
        "Cancelled",
        "In Progress",
        "In-Progress",
        "To Do",
        "todo",
        "Wait",
        "Waiting",
      ],
      input,
      false,
      false
    );
    expect(content).toBe(expected);
    expect(update).toBe(true);
  });

  it("should output tags when parseAsTags is configured", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page", "multiple words"],
      "This page has multiple words",
      true,
      false
    );
    // Spaces around tags are preserved for English text
    expect(content).toBe("This #page has #[[multiple words]]");
    expect(update).toBe(true);
  });

  it("should output tags when parseSingleWordAsTag is configured", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["one", "multiple words"],
      "This one becomes a tag but multiple words get brackets",
      false,
      true
    );
    // Spaces around links/tags are preserved for English text
    expect(content).toBe(
      "This #one becomes a tag but [[multiple words]] get brackets"
    );
    expect(update).toBe(true);
  });

  it("should return the same content if nothing was parsed", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page"],
      "This text doesn't have any links to be parsed",
      false,
      false
    );
    expect(content).toBe("This text doesn't have any links to be parsed");
    expect(update).toBe(false);
  });

  it("should keep the original input case for lowercase pages", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["when", "for pages", "because", "links", "logseq"],
      `When creating links, the original case that was typed should be preserved
      for PAGES that only have lowercase words.
      Because logSEQ LINKS are case-insensitive anyway.`,
      false,
      false
    );
    // Spaces around links are preserved for English text
    expect(content).toBe(
      `[[When]] creating [[links]], the original case that was typed should be preserved
      [[for PAGES]] that only have lowercase words.
      [[Because]] [[logSEQ]] [[LINKS]] are case-insensitive anyway.`
    );
    expect(update).toBe(true);
  });

  it("should disregard the input case and use the page case for uppercase, title case and mixed case pages", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["John Doe", "Mary Doe", "ANYWAY", "Logseq", "But"],
      `When creating links, the page case should be used when it's not lowercase.
      So things like names are properly capitalised even when typed in lowercase: john doe, mary doe.
      logseq LINKS are case-insensitive anyway.
      but LOGSEQ will keep the case of pages that are uppercase or title case when displaying,
      even if you type them in lowercase`,
      false,
      false
    );
    // Spaces around links are preserved for English text
    expect(content).toBe(
      `When creating links, the page case should be used when it's not lowercase.
      So things like names are properly capitalised even when typed in lowercase: [[John Doe]], [[Mary Doe]].
      [[Logseq]] LINKS are case-insensitive [[ANYWAY]].
      [[But]] [[Logseq]] will keep the case of pages that are uppercase or title case when displaying,
      even if you type them in lowercase`
    );
    expect(update).toBe(true);
  });

  it("should detect Unicode links", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["가나다"],
      `This block implicitly contains unicode words like 가나다.`,
      false,
      false
    );
    // Spaces are preserved for English text (Korean is CJK but adjacent to English)
    expect(content).toBe(
      `This block implicitly contains unicode words like [[가나다]].`
    );
  });

  // Chinese character detection tests
  describe("Chinese character handling", () => {
    it("should link pure Chinese page names", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["测试", "笔记"],
        "这是一个测试，用于验证笔记功能。",
        false,
        false
      );
      expect(content).toBe("这是一个[[测试]]，用于验证[[笔记]]功能。");
      expect(update).toBe(true);
    });

    it("should link mixed Chinese-English page names", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["测试Test", "Logseq笔记"],
        "这是测试Test的内容，还有Logseq笔记的链接。",
        false,
        false
      );
      expect(content).toBe(
        "这是[[测试Test]]的内容，还有[[Logseq笔记]]的链接。"
      );
      expect(update).toBe(true);
    });

    it("should not double-link already linked Chinese pages", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["测试"],
        "这是[[测试]]和测试的内容。",
        false,
        false
      );
      expect(content).toBe("这是[[测试]]和[[测试]]的内容。");
      expect(update).toBe(true);
    });

    it("should handle Chinese pages with tags", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["中文标签"],
        "这是一个中文标签的测试。",
        true,
        false
      );
      expect(content).toBe("这是一个#中文标签的测试。");
      expect(update).toBe(true);
    });

    it("should handle CJK Extension A characters (rare Chinese characters)", () => {
      // 㐀 is U+3400, first character in CJK Extension A
      let [content, update] = replaceContentWithPageLinks(
        ["㐀"],
        "This contains a rare character: 㐀",
        false,
        false
      );
      // Spaces preserved for English text
      expect(content).toBe("This contains a rare character: [[㐀]]");
      expect(update).toBe(true);
    });

    it("should handle multiple Chinese pages in the same content", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["项目管理", "知识管理", "日程安排"],
        "今天的项目管理会议讨论了知识管理和日程安排的问题。",
        false,
        false
      );
      expect(content).toBe(
        "今天的[[项目管理]]会议讨论了[[知识管理]]和[[日程安排]]的问题。"
      );
      expect(update).toBe(true);
    });

    it("should not process empty page names", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["", "测试"],
        "这是测试内容。",
        false,
        false
      );
      expect(content).toBe("这是[[测试]]内容。");
      expect(update).toBe(true);
    });

    it("should handle Chinese page names with numbers", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["第1章", "版本2.0"],
        "请阅读第1章，这是版本2.0的内容。",
        false,
        false
      );
      expect(content).toBe("请阅读[[第1章]]，这是[[版本2.0]]的内容。");
      expect(update).toBe(true);
    });

    it("should handle Chinese content in code blocks without linking", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["测试"],
        "这是测试 ```\n代码中的测试\n``` 代码后的测试",
        false,
        false
      );
      // Space before ``` is preserved (not adjacent to CJK)
      expect(content).toBe(
        "这是[[测试]] ```\n代码中的测试\n``` 代码后的[[测试]]"
      );
      expect(update).toBe(true);
    });

    it("should handle Chinese page names with special characters", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["C++编程", "Node.js开发"],
        "学习C++编程和Node.js开发的技巧。",
        false,
        false
      );
      expect(content).toBe("学习[[C++编程]]和[[Node.js开发]]的技巧。");
      expect(update).toBe(true);
    });
  });

  // Space handling around links tests - spaces only removed around CJK characters
  describe("Space handling around links", () => {
    it("should preserve spaces around links in English text", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["test"],
        "This is a test word",
        false,
        false
      );
      // Spaces preserved for English
      expect(content).toBe("This is a [[test]] word");
      expect(update).toBe(true);
    });

    it("should preserve spaces around multiple links in English", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["foo", "bar"],
        "This foo and bar here",
        false,
        false
      );
      // Spaces preserved for English
      expect(content).toBe("This [[foo]] and [[bar]] here");
      expect(update).toBe(true);
    });

    it("should preserve line-start indentation", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["test"],
        "  test at start with indent",
        false,
        false
      );
      // Line-start spaces are preserved
      expect(content).toBe("  [[test]] at start with indent");
      expect(update).toBe(true);
    });

    it("should preserve spaces around tags in English", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["tag"],
        "This tag here",
        true,
        false
      );
      // Spaces preserved for English
      expect(content).toBe("This #tag here");
      expect(update).toBe(true);
    });

    it("should preserve spaces around existing links in English", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["other"],
        "Text with [[existing]] link and other word",
        false,
        false
      );
      // Spaces preserved for English
      expect(content).toBe("Text with [[existing]] link and [[other]] word");
      expect(update).toBe(true);
    });
    
    it("should remove spaces around links adjacent to CJK characters", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["test"],
        "中文 [[test]] 中文",
        false,
        false
      );
      // Spaces removed when adjacent to CJK
      expect(content).toBe("中文[[test]]中文");
      expect(update).toBe(true);
    });

    it("should not match inside existing links (longer match first)", () => {
      // Bug fix: "一二三四" should not become "[[一[[二三]]四]]"
      // when both "一二三四" and "二三" are pages
      let [content, update] = replaceContentWithPageLinks(
        ["一二三四", "二三"], // sorted by length desc
        "这是一二三四的内容",
        false,
        false
      );
      expect(content).toBe("这是[[一二三四]]的内容");
      expect(update).toBe(true);
    });

    it("should not match shorter page inside already linked longer page", () => {
      // If content already has [[一二三四]], "二三" should not be linked inside it
      let [content, update] = replaceContentWithPageLinks(
        ["二三"],
        "这是[[一二三四]]的内容",
        false,
        false
      );
      expect(content).toBe("这是[[一二三四]]的内容");
      expect(update).toBe(false);
    });

    it("should link shorter page outside of existing links", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["一二三四", "二三"],
        "这是一二三四和二三的内容",
        false,
        false
      );
      expect(content).toBe("这是[[一二三四]]和[[二三]]的内容");
      expect(update).toBe(true);
    });

    it("should link English page surrounded by Chinese characters", () => {
      // Bug fix: "中文abc中文" should link to [[abc]]
      let [content, update] = replaceContentWithPageLinks(
        ["abc"],
        "中文abc中文",
        false,
        false
      );
      expect(content).toBe("中文[[abc]]中文");
      expect(update).toBe(true);
    });

    it("should link English page at various positions in Chinese text", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["test", "hello"],
        "开始test中间hello结束",
        false,
        false
      );
      expect(content).toBe("开始[[test]]中间[[hello]]结束");
      expect(update).toBe(true);
    });
  });

  // auto-link-to-original tests
  describe("Alias to original page linking", () => {
    it("should link alias to original page when mapping is provided", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("bbb", "aaa");
      
      let [content, update] = replaceContentWithPageLinks(
        ["bbb"],
        "bbb ccc",
        false,
        false,
        aliasMap
      );
      // Spaces preserved for English
      expect(content).toBe("[[aaa]] ccc");
      expect(update).toBe(true);
    });

    it("should link Chinese alias to original page", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("别名", "原始页面");
      
      let [content, update] = replaceContentWithPageLinks(
        ["别名"],
        "这是别名的内容",
        false,
        false,
        aliasMap
      );
      expect(content).toBe("这是[[原始页面]]的内容");
      expect(update).toBe(true);
    });

    it("should not affect pages without alias mapping", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("bbb", "aaa");
      
      let [content, update] = replaceContentWithPageLinks(
        ["ccc", "bbb"],
        "ccc and bbb here",
        false,
        false,
        aliasMap
      );
      // ccc links to itself, bbb links to aaa; spaces preserved for English
      expect(content).toBe("[[ccc]] and [[aaa]] here");
      expect(update).toBe(true);
    });

    it("should handle alias mapping with tags", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("alias", "original");
      
      let [content, update] = replaceContentWithPageLinks(
        ["alias"],
        "this is alias here",
        true,
        false,
        aliasMap
      );
      // Spaces preserved for English
      expect(content).toBe("this is #original here");
      expect(update).toBe(true);
    });

    it("should handle case-insensitive alias matching", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("bbb", "aaa"); // lowercase key
      
      let [content, update] = replaceContentWithPageLinks(
        ["BBB"], // uppercase in page list
        "BBB here",
        false,
        false,
        aliasMap
      );
      // Should link to original "aaa"; spaces preserved
      expect(content).toBe("[[aaa]] here");
      expect(update).toBe(true);
    });
  });

  // CJK boundary tests for English pages
  describe("CJK boundary for English pages", () => {
    it("should link AAA in '中文AAA'", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["AAA"],
        "中文AAA",
        false,
        false
      );
      expect(content).toBe("中文[[AAA]]");
      expect(update).toBe(true);
    });

    it("should link AAA in 'AAA中文'", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["AAA"],
        "AAA中文",
        false,
        false
      );
      expect(content).toBe("[[AAA]]中文");
      expect(update).toBe(true);
    });

    it("should link AAA in '中文AAA中文'", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["AAA"],
        "中文AAA中文",
        false,
        false
      );
      expect(content).toBe("中文[[AAA]]中文");
      expect(update).toBe(true);
    });

    it("should link AAA in '中文AAA。' (with Chinese period)", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["AAA"],
        "中文AAA。",
        false,
        false
      );
      expect(content).toBe("中文[[AAA]]。");
      expect(update).toBe(true);
    });

    it("should link AAA in '中文AAA，BBB' (with Chinese comma)", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["AAA", "BBB"],
        "中文AAA，BBB",
        false,
        false
      );
      expect(content).toBe("中文[[AAA]]，[[BBB]]");
      expect(update).toBe(true);
    });

    it("should link AAA in '中文AAA！' (with Chinese exclamation)", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["AAA"],
        "中文AAA！",
        false,
        false
      );
      expect(content).toBe("中文[[AAA]]！");
      expect(update).toBe(true);
    });
  });

  // CJK boundary tests with alias
  describe("CJK boundary with alias", () => {
    it("should link alias AAA to original page in '中文AAA'", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("aaa", "OriginalPage");
      
      let [content, update] = replaceContentWithPageLinks(
        ["AAA"],
        "中文AAA",
        false,
        false,
        aliasMap
      );
      expect(content).toBe("中文[[OriginalPage]]");
      expect(update).toBe(true);
    });

    it("should link Chinese alias to original page surrounded by Chinese", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("别名", "原始页面");
      
      let [content, update] = replaceContentWithPageLinks(
        ["别名"],
        "这是别名测试",
        false,
        false,
        aliasMap
      );
      expect(content).toBe("这是[[原始页面]]测试");
      expect(update).toBe(true);
    });

    it("should link alias in mixed CJK-English context", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("test", "TestPage");
      
      let [content, update] = replaceContentWithPageLinks(
        ["test"],
        "中文test中文",
        false,
        false,
        aliasMap
      );
      expect(content).toBe("中文[[TestPage]]中文");
      expect(update).toBe(true);
    });
  });

  // Test converting existing alias links to original page names
  describe("Convert existing alias links to original", () => {
    it("should convert [[alias]] to [[original]] when auto-link-to-original is set", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("bbb", "aaa");
      
      let [content, update] = replaceContentWithPageLinks(
        [],  // no pages to link, just convert existing
        "This has [[bbb]] link",
        false,
        false,
        aliasMap
      );
      // Spaces preserved for English
      expect(content).toBe("This has [[aaa]] link");
      expect(update).toBe(true);
    });

    it("should convert #[[alias]] to [[original]] (tag converted to link)", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("alias", "original");
      
      let [content, update] = replaceContentWithPageLinks(
        [],
        "Tagged with #[[alias]] here",
        false,
        false,
        aliasMap
      );
      // Tags are converted to links, then alias is resolved
      expect(content).toBe("Tagged with [[original]] here");
      expect(update).toBe(true);
    });

    it("should not convert if link is already original page name", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("alias", "original");
      
      let [content, update] = replaceContentWithPageLinks(
        [],
        "This has [[original]] link",
        false,
        false,
        aliasMap
      );
      // Spaces preserved for English, no conversion needed
      expect(content).toBe("This has [[original]] link");
      expect(update).toBe(false);
    });

    it("should convert Chinese alias links", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("别名", "原始页面");
      
      let [content, update] = replaceContentWithPageLinks(
        [],
        "这里有[[别名]]链接",
        false,
        false,
        aliasMap
      );
      expect(content).toBe("这里有[[原始页面]]链接");
      expect(update).toBe(true);
    });

    it("should handle multiple alias links in same content", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("a1", "original1");
      aliasMap.set("a2", "original2");
      
      let [content, update] = replaceContentWithPageLinks(
        [],
        "First [[a1]] and second [[a2]]",
        false,
        false,
        aliasMap
      );
      // Spaces preserved for English
      expect(content).toBe("First [[original1]] and second [[original2]]");
      expect(update).toBe(true);
    });
  });

  // Tag to link conversion tests
  describe("Tag to link conversion", () => {
    it("should convert #tag to [[tag]]", () => {
      let [content, update] = replaceContentWithPageLinks(
        [],
        "This has #mytag here",
        false,
        false
      );
      expect(content).toBe("This has [[mytag]] here");
      expect(update).toBe(true);
    });

    it("should convert #[[tag]] to [[tag]]", () => {
      let [content, update] = replaceContentWithPageLinks(
        [],
        "This has #[[my tag]] here",
        false,
        false
      );
      expect(content).toBe("This has [[my tag]] here");
      expect(update).toBe(true);
    });

    it("should preserve priority markers [#A]", () => {
      let [content, update] = replaceContentWithPageLinks(
        [],
        "TODO [#A] This is important",
        false,
        false
      );
      expect(content).toBe("TODO [#A] This is important");
      expect(update).toBe(false);
    });

    it("should convert Chinese tags with delimiter", () => {
      let [content, update] = replaceContentWithPageLinks(
        [],
        "这是#中文标签 测试",
        false,
        false
      );
      // Space delimits the tag, then space is removed (CJK adjacent)
      expect(content).toBe("这是[[中文标签]]测试");
      expect(update).toBe(true);
    });

    it("should convert Chinese tags with punctuation delimiter", () => {
      let [content, update] = replaceContentWithPageLinks(
        [],
        "这是#中文标签，测试",
        false,
        false
      );
      // Comma delimits the tag - but comma is not a word char so it stops
      expect(content).toBe("这是[[中文标签]]，测试");
      expect(update).toBe(true);
    });

    it("should convert tag and then apply alias mapping", () => {
      const aliasMap = new Map<string, string>();
      aliasMap.set("alias", "original");
      
      let [content, update] = replaceContentWithPageLinks(
        [],
        "This has #alias tag",
        false,
        false,
        aliasMap
      );
      // Tag converted to link, then alias resolved
      expect(content).toBe("This has [[original]] tag");
      expect(update).toBe(true);
    });

    it("should convert namespace tags with slash", () => {
      let [content, update] = replaceContentWithPageLinks(
        [],
        "This has #ABC/CDE tag",
        false,
        false
      );
      expect(content).toBe("This has [[ABC/CDE]] tag");
      expect(update).toBe(true);
    });
  });
});
