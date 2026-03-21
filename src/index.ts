#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

// Register the Tools
const languageSchema = z.object({
  language: z
    .string()
    .describe(
      "The target programming language, matching a folder name under docs/ (e.g. 'typescript', 'javascript')",
    ),
});

// Initialize the MCP Server
const server = new McpServer({
  name: "dci-mcp",
  version,
});

// Calculate paths to the docs directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "docs");

/**
 * Helper function to read, concatenate, and append action-specific directives.
 */
async function getDciInstructions(
  language: string,
  action: "refactor" | "scaffold",
): Promise<string> {
  const corePath = path.join(DOCS_DIR, "core.md");
  const langPath = path.join(DOCS_DIR, language, "instructions.md");
  const examplesPath = path.join(DOCS_DIR, language, "examples.md");

  try {
    // Read core and language instructions concurrently; examples are optional
    const [coreContent, langContent] = await Promise.all([
      fs.readFile(corePath, "utf-8"),
      fs.readFile(langPath, "utf-8"),
    ]);

    let examplesContent = "";
    try {
      examplesContent = await fs.readFile(examplesPath, "utf-8");
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }

    let response = `${coreContent}\n\n${langContent}`;
    if (examplesContent) {
      response += `\n\n${examplesContent}`;
    }
    response += "\n\n";

    // Append the action-specific LLM directive
    if (action === "refactor") {
      response += `
---
**CRITICAL INSTRUCTION FOR YOUR NEXT RESPONSE:**
You now have the strict DCI rules. Do not ask for confirmation. Immediately analyze the user's legacy code, silently plan the Data/Roles/Context, and generate the refactored DCI code in your next response.
`;
    } else if (action === "scaffold") {
      response += `
---
**CRITICAL INSTRUCTION FOR YOUR NEXT RESPONSE:**
You now have the strict DCI rules. Do not ask for confirmation. Read the user's mental model/user story from the chat history and immediately translate it into a DCI Context. 

As you generate the code, ensure:
1. **Roles map to the actors/concepts** in their mental model.
2. **RoleMethods express the exact steps** described in their story.
3. You strictly separate the dumb Data ("what the system is") from the Context ("what the system does").
`;
    }

    return response;
  } catch (error: any) {
    throw new Error(
      `Failed to load DCI instructions for '${language}'. Ensure the language folder exists in the docs/ directory. Error details: ${error.message}`,
    );
  }
}

server.registerTool(
  "prepare_dci_refactor",
  {
    title: "Prepare DCI Refactor",
    description:
      "Call this tool when the user asks to refactor code into the DCI paradigm. Pass the target language. The tool will return the strict DCI architectural rules you need to follow before generating the final code.",
    inputSchema: languageSchema,
  },
  async ({ language }) => {
    try {
      const content = await getDciInstructions(
        language.toLowerCase(),
        "refactor",
      );
      return { content: [{ type: "text" as const, text: content }] };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error executing tool: ${error.message}. Please inform the user that this language might not be supported in the DCI server yet.`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "scaffold_dci_from_mental_model",
  {
    title: "Scaffold DCI from Mental Model",
    description:
      "Call this tool when the user provides a mental model or user story and wants you to write a new DCI Context from scratch. The tool will return the strict DCI architectural rules required to translate their mental model into code.",
    inputSchema: languageSchema,
  },
  async ({ language }) => {
    try {
      const content = await getDciInstructions(
        language.toLowerCase(),
        "scaffold",
      );
      return { content: [{ type: "text" as const, text: content }] };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error executing tool: ${error.message}. Please inform the user that this language might not be supported in the DCI server yet.`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Start the server using stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DCI Architect MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
