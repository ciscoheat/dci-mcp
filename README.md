# dci-mcp

An MCP server that generates code adhering to the [DCI architecture](https://en.wikipedia.org/wiki/Data,_context_and_interaction) when generating or refactoring code. It loads language-specific rules and examples, then instructs the LLM to apply them immediately — no back-and-forth.

## Tools

| Tool                             | When to use                                                                |
| -------------------------------- | -------------------------------------------------------------------------- |
| `prepare_dci_refactor`           | User wants to refactor existing code into DCI                              |
| `scaffold_dci_from_mental_model` | User describes a mental model / user story and wants DCI code from scratch |

Both tools accept a `language` argument (e.g. `"typescript"`, `"javascript"`) and return the full DCI ruleset for that language as context.

## Supported languages

Add a folder under `docs/` with `instructions.md` (required) and `examples.md` (optional):

```
docs/
  core.md              # DCI rules shared across all languages
  typescript/
    instructions.md
    examples.md
  javascript/
    instructions.md
    examples.md
```

## Usage in mcp.json (stdio)

```jsonc
"dci": {
  "command": "pnpx",
  "args": ["dci-mcp"]
}
```

Or with npx:

```jsonc
"dci": {
  "command": "npx",
  "args": ["-y", "dci-mcp"]
}
```

## Development

```sh
pnpm install
pnpm dev          # build + pnpm link (makes dci-mcp available globally)
pnpm inspector    # open MCP Inspector connected to the local server
```

After `pnpm dev`, the server is available as `dci-mcp` in your PATH and can be used in `mcp.json` outside this project while you iterate:

```jsonc
"dci": {
  "command": "dci-mcp"
}
```
