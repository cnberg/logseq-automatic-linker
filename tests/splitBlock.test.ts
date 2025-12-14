import { splitBlock } from "../src/splitBlock";

describe("splitBlock()", () => {
  it("should return empty array for single line content", () => {
    const result = splitBlock("single line");
    expect(result).toEqual([]);
  });

  it("should return empty array for single line with trailing newline", () => {
    const result = splitBlock("single line\n");
    expect(result).toEqual([]);
  });

  it("should split two lines into two blocks", () => {
    const result = splitBlock("line 1\nline 2");
    expect(result).toEqual([
      { content: "line 1", children: [] },
      { content: "line 2", children: [] },
    ]);
  });

  it("should create child block for indented line", () => {
    const result = splitBlock("parent\n  child");
    expect(result).toEqual([
      {
        content: "parent",
        children: [{ content: "child", children: [] }],
      },
    ]);
  });

  it("should handle multiple levels of indentation", () => {
    const result = splitBlock("level 0\n  level 1\n    level 2");
    expect(result).toEqual([
      {
        content: "level 0",
        children: [
          {
            content: "level 1",
            children: [{ content: "level 2", children: [] }],
          },
        ],
      },
    ]);
  });

  it("should handle siblings at same indent level", () => {
    const result = splitBlock("parent\n  child 1\n  child 2");
    expect(result).toEqual([
      {
        content: "parent",
        children: [
          { content: "child 1", children: [] },
          { content: "child 2", children: [] },
        ],
      },
    ]);
  });

  it("should handle decrease in indent level", () => {
    const result = splitBlock("line 1\n  child\nline 2");
    expect(result).toEqual([
      {
        content: "line 1",
        children: [{ content: "child", children: [] }],
      },
      { content: "line 2", children: [] },
    ]);
  });

  it("should skip empty lines", () => {
    const result = splitBlock("line 1\n\nline 2");
    expect(result).toEqual([
      { content: "line 1", children: [] },
      { content: "line 2", children: [] },
    ]);
  });

  it("should skip lines with only whitespace", () => {
    const result = splitBlock("line 1\n   \nline 2");
    expect(result).toEqual([
      { content: "line 1", children: [] },
      { content: "line 2", children: [] },
    ]);
  });

  it("should handle complex nested structure", () => {
    const content = `parent 1
  child 1.1
    grandchild 1.1.1
  child 1.2
parent 2
  child 2.1`;
    const result = splitBlock(content);
    expect(result).toEqual([
      {
        content: "parent 1",
        children: [
          {
            content: "child 1.1",
            children: [{ content: "grandchild 1.1.1", children: [] }],
          },
          { content: "child 1.2", children: [] },
        ],
      },
      {
        content: "parent 2",
        children: [{ content: "child 2.1", children: [] }],
      },
    ]);
  });

  it("should handle tabs as indentation", () => {
    const result = splitBlock("parent\n\tchild");
    expect(result).toEqual([
      {
        content: "parent",
        children: [{ content: "child", children: [] }],
      },
    ]);
  });

  it("should handle mixed content with bullet points", () => {
    const result = splitBlock("- item 1\n- item 2");
    expect(result).toEqual([
      { content: "- item 1", children: [] },
      { content: "- item 2", children: [] },
    ]);
  });

  it("should preserve content with special characters", () => {
    const result = splitBlock("[[page link]]\n#tag");
    expect(result).toEqual([
      { content: "[[page link]]", children: [] },
      { content: "#tag", children: [] },
    ]);
  });
});
