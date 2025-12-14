import { replaceContentWithPageLinks } from "../src/functions";

describe("replaceContentWithPageLinks()", () => {
  it("should preserve code blocks", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["page"],
      "page before ```\npage within code block\n```\npage between\n```\nanother page within code block```\nand finally\n```\nwith `single` backticks and page within\n```\npage after",
      false,
      false
    );
    // Spaces around links are removed
    expect(content).toBe(
      "[[page]]before ```\npage within code block\n```\n[[page]]between\n```\nanother page within code block```\nand finally\n```\nwith `single` backticks and page within\n```\n[[page]]after"
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
    // Spaces around links are removed
    expect(content).toBe(
      "[[Page]]before\n`page inside inline code`\n[[page]]between\n`another page inline`\n`but not page if inline\nblock is split between newlines`\n[[page]]after"
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
    // Spaces around links are removed
    expect(content).toBe(
      `Some[[page]]here with[[price]]
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
    // Spaces around links are removed
    expect(content).toBe(
      `This[[page]]has a[[link]]: [page link will not be touched](http://a.com)
      [another page](http://b.com) also with a[[link]]
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

    // Spaces around links are removed
    expect(content).toEqual(
      `${customQueries[0]}
      
      Ths sentence contains a[[link]]
      
      ${customQueries[1]}`
    );
    expect(update).toBe(true);
  });

  // Spaces around links are removed in all these cases
  it.each([
    {
      input: "NOW [#A] A started todo",
      expected: "NOW [#A] A started[[todo]]",
    },
    {
      input: "LATER [#B] A todo for later",
      expected: "LATER [#B] A[[todo]]for[[Later]]",
    },
    {
      input: "DOING [#A] Fix the todo marker issue",
      expected: "DOING [#A] Fix the[[todo]]marker issue",
    },
    { input: "DONE A done todo", expected: "DONE A[[Done]][[todo]]" },
    {
      input: "CANCELED A canceled todo",
      expected: "CANCELED A[[Canceled]][[todo]]",
    },
    {
      input: "CANCELLED A cancelled todo",
      expected: "CANCELLED A[[Cancelled]][[todo]]",
    },
    {
      input: "IN-PROGRESS An in progress To Do",
      expected: "IN-PROGRESS An[[In Progress]][[To Do]]",
    },
    { input: "TODO A todo", expected: "TODO A[[todo]]" },
    {
      input: "WAIT [#C] A todo waiting to be unblocked",
      expected: "WAIT [#C] A[[todo]][[Waiting]]to be unblocked",
    },
    {
      input: "WAITING A waiting todo",
      expected: "WAITING A[[Waiting]][[todo]]",
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
    // Spaces around tags are removed
    expect(content).toBe("This#page has#[[multiple words]]");
    expect(update).toBe(true);
  });

  it("should output tags when parseSingleWordAsTag is configured", () => {
    let [content, update] = replaceContentWithPageLinks(
      ["one", "multiple words"],
      "This one becomes a tag but multiple words get brackets",
      false,
      true
    );
    // Spaces around links/tags are removed
    expect(content).toBe(
      "This#one becomes a tag but[[multiple words]]get brackets"
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
    // Spaces around links are removed
    expect(content).toBe(
      `[[When]]creating[[links]], the original case that was typed should be preserved
      [[for PAGES]]that only have lowercase words.
      [[Because]][[logSEQ]][[LINKS]]are case-insensitive anyway.`
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
    // Spaces around links are removed
    expect(content).toBe(
      `When creating links, the page case should be used when it's not lowercase.
      So things like names are properly capitalised even when typed in lowercase:[[John Doe]],[[Mary Doe]].
      [[Logseq]]LINKS are case-insensitive[[ANYWAY]].
      [[But]][[Logseq]]will keep the case of pages that are uppercase or title case when displaying,
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
    // Spaces around links are removed
    expect(content).toBe(
      `This block implicitly contains unicode words like[[가나다]].`
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
      // Spaces around links are removed
      expect(content).toBe("This contains a rare character:[[㐀]]");
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
      // Spaces around links are removed (including before ```)
      expect(content).toBe(
        "这是[[测试]]```\n代码中的测试\n``` 代码后的[[测试]]"
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

  // Space removal around links tests
  describe("Space removal around links", () => {
    it("should remove spaces before [[ and after ]]", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["test"],
        "This is a test word",
        false,
        false
      );
      expect(content).toBe("This is a[[test]]word");
      expect(update).toBe(true);
    });

    it("should remove spaces around multiple links", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["foo", "bar"],
        "This foo and bar here",
        false,
        false
      );
      expect(content).toBe("This[[foo]]and[[bar]]here");
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
      expect(content).toBe("  [[test]]at start with indent");
      expect(update).toBe(true);
    });

    it("should remove spaces around tags", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["tag"],
        "This tag here",
        true,
        false
      );
      expect(content).toBe("This#tag here");
      expect(update).toBe(true);
    });

    it("should handle existing links with spaces", () => {
      let [content, update] = replaceContentWithPageLinks(
        ["other"],
        "Text with [[existing]] link and other word",
        false,
        false
      );
      // Spaces around existing and new links are removed
      expect(content).toBe("Text with[[existing]]link and[[other]]word");
      expect(update).toBe(true);
    });
  });
});
