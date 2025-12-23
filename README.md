> If this plugin helps you, I'd really appreciate your support. You can [buy me a coffee here. ](https://www.buymeacoffee.com/sawhney17)

# Automatic Linker for Logseq

![GitHub all releases](https://img.shields.io/github/downloads/sawhney17/logseq-automatic-linker/total) ![version](https://img.shields.io/github/package-json/v/sawhney17/logseq-automatic-linker)

A plugin to automatically create links while typing, with additional features for prompt templates, LLM integration, and block management.

Requires logseq version 0.67 and above to function properly.

![Screen Recording 2022-05-11 at 8 03 24 AM](https://user-images.githubusercontent.com/80150109/167770331-a89d9939-888f-466c-9738-29daa263e724.gif)

## Features

### Auto Linking
- Automatically converts page names and aliases to links while typing
- Supports CJK (Chinese, Japanese, Korean) characters
- Converts `#tag` and `#[[tag]]` to `[[tag]]` format
- Smart space handling: removes spaces around links only when adjacent to CJK characters

### Prompt Templates with LLM Integration
- Create prompt templates in the `prompt/` namespace
- Press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> to open the template selector
- Three actions per template:
  - **调用 (Invoke)**: Send to LLM and insert response as child block
  - **复制 (Copy)**: Copy processed prompt to clipboard
  - **编辑模板 (Edit)**: Navigate to template page
- Supported placeholders:
  - `{{block-content}}`: Replaced with current block and children content
  - `{{date}}`: Replaced with current date and time (e.g., `2025-01-15 14:30:25 Wednesday (星期三)`)
  - `{{embed [[PageName]]}}`: Expands to page content
  - `{{embed ((block-uuid))}}`: Expands to block content

### Split Block
- Split multi-line blocks into separate blocks
- Preserves indentation hierarchy
- Keyboard shortcut: <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>
- Also available via slash command and right-click menu

### Page Menu Actions
Available in the page menu (`...` button):
- **Split all blocks in this page**: Split all multi-line blocks
- **Convert alias links to original**: Replace `[[alias]]` with `[[original]]` for pages with `auto-link-to-original:: true`
- **Unlink all references to this page**: Convert all links to this page into plain text

## Instructions

1. Install the plugin from the marketplace
2. Use <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> to enable automatic mode
3. Or use <kbd>Cmd</kbd>+<kbd>P</kbd> to parse the current block
4. Or right-click the bullet and click "Parse Block for Links"

## Configuration

### Page Properties

| Property | Description |
|----------|-------------|
| `auto-link-ignore:: true` | Ignore this page and its aliases from auto linking |
| `auto-link-to-original:: true` | When alias is matched, link to original page name instead |
| `askgpt:: true` | (For prompt templates) Enable LLM integration |
| `gpt-model:: model-name` | (For prompt templates) Override default LLM model |

### Plugin Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Keybinding for Automatic Parsing | `mod+alt+shift+l` | Toggle automatic parsing |
| Keybinding for Parsing a Single Block | `mod+shift+l` | Parse current block |
| Keybinding for Split Block | `mod+shift+s` | Split current block |
| Keybinding for Prompt Template | `mod+shift+g` | Open prompt template selector |
| Keybinding for Go to Today's Journal | `mod+shift+t` | Navigate to today's journal |
| Pages to Ignore | (empty) | Comma-separated list of pages to ignore |
| Prompt Template Namespace | `prompt` | Namespace for prompt templates |
| LLM API URL | `https://api.openai.com/v1/chat/completions` | API endpoint |
| LLM API Key | (empty) | Your API key |
| LLM Model | `gpt-4` | Default model name |

## LLM Integration Setup

1. Go to plugin settings
2. Set your **LLM API URL** (OpenAI compatible endpoints work)
3. Enter your **LLM API Key**
4. Set your preferred **LLM Model** (e.g., `gpt-4`, `gpt-4o`, `claude-3-opus`)

### Creating a Prompt Template

1. Create a page under `prompt/` namespace (e.g., `prompt/translate`)
2. Add the page content as your prompt template
3. Use `{{block-content}}` where you want the selected block content inserted
4. Optionally add `gpt-model:: your-model` to override the default model

Example template (`prompt/translate`):
```
gpt-model:: gpt-4o

Please translate the following content to English:

{{block-content}}
```

## Development

1. Fork the repo
2. Install dependencies and build:
   ```bash
   yarn install && yarn run dev
   ```
3. Open Logseq and navigate to plugins dashboard: `t` `p`
4. Click "Load unpacked plugin", then select the repo directory

After making changes:
1. Rebuild: `yarn run dev`
2. Reload the plugin in Logseq

To run tests:
```bash
yarn test
```

## Thank You

Thank you to all contributors to the project!
- @jwoo0122
- @adxsoft
- @falense
- @andreoliwa
- @jjaychen1e
- @trashhalo
- @Laptop765
- @robotii
- @mortein
