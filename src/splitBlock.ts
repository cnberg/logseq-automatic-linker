import { IBatchBlock } from "@logseq/libs/dist/LSPlugin.user";

const isEmptyLine = (str: string) => /^\s*$/.test(str);

/**
 * Split a block's content into multiple blocks based on newlines.
 * Preserves indentation hierarchy - indented lines become children of the previous line.
 * 
 * @param blockContent - The content of the block to split
 * @returns Array of batch blocks with proper parent-child relationships
 */
export function splitBlock(blockContent: string): IBatchBlock[] {
  const lines = blockContent.split("\n").filter((line) => !isEmptyLine(line));
  if (lines.length <= 1) {
    return [];
  }

  const batchBlock: IBatchBlock[] = [];
  const stack: {
    indent: number;
    block: IBatchBlock;
    parent?: IBatchBlock;
  }[] = [];

  lines.forEach((l) => {
    const content = l.trimStart();
    const indent = l.length - content.length;

    const nextBlock: IBatchBlock = {
      content,
      children: [],
    };

    if (!stack.length) {
      batchBlock.push(nextBlock);
      stack.push({
        indent,
        block: nextBlock,
      });
      return;
    }

    let top = stack[stack.length - 1];
    const indentDiff = indent - top.indent;

    if (indentDiff === 0) {
      // Same level - add to parent's children
      if (top.parent) {
        top.parent.children!.push(nextBlock);
      } else {
        batchBlock.push(nextBlock);
      }
      top.block = nextBlock;
    } else if (indentDiff > 0) {
      // Increased indent - add as child
      top.block.children!.push(nextBlock);
      stack.push({
        indent,
        block: nextBlock,
        parent: top.block,
      });
    } else if (indentDiff < 0) {
      // Decreased indent - find the matching level
      while (top.indent > indent) {
        stack.pop();
        if (stack.length === 0) {
          return;
        }
        top = stack[stack.length - 1];
      }

      if (top.indent === indent) {
        console.log(top, nextBlock);
        if (top.parent) {
          top.parent.children!.push(nextBlock);
        } else {
          batchBlock.push(nextBlock);
        }
        top.block = nextBlock;
      } else {
        // Misaligned indent case
        console.log(JSON.stringify(top));
        top.block.children!.push(nextBlock);
        stack.push({
          indent,
          block: nextBlock,
          parent: top.block,
        });
      }
    }
  });

  console.log({ LogseqAutomaticLinker: "splitBlock result", batchBlock: JSON.stringify(batchBlock) });
  return batchBlock;
}
