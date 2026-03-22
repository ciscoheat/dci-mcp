#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const supportedLanguages = ["typescript", "javascript"];

// Register the Tools
const languageSchema = z.object({
  language: z
    .string()
    .describe(
      "The target programming language. Supported languages: " +
        supportedLanguages.join(", "),
    ),
});

// Initialize the MCP Server
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const server = new McpServer({
  name: "dci-mcp",
  version,
});

// Calculate paths to the docs directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "docs");

function languageNotFound() {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error executing tool. Please inform the user that the following languages are supported by the DCI MCP server: ${supportedLanguages.join(", ")}.`,
      },
    ],
    isError: true,
  };
}

/**
 * Loads and composes complete DCI instruction content for a language and action.
 * @DCI-context
 */
async function ServeInstructions(
  Settings: { language: string; action: "refactor" | "scaffold" },
  Docs: { dir: string },
): Promise<string> {
  //#region Settings Role //////////////////

  function Settings_language() {
    return Settings.language.toLowerCase();
  }

  function Settings_applyDirective() {
    const directive =
      Settings.action === "refactor"
        ? `\n---\n**CRITICAL INSTRUCTION FOR YOUR NEXT RESPONSE:**\nYou now have the strict DCI rules. Do not ask for confirmation. \nImmediately analyze the user's legacy code, silently plan the Data/Roles/Context, and generate the refactored DCI code in your next response.\n`
        : `\n---\n**CRITICAL INSTRUCTION FOR YOUR NEXT RESPONSE:**\nYou now have the strict DCI rules. Do not ask for confirmation. \nRead the user's mental model/user story from the chat history and immediately translate it into a DCI Context. \n`;
    Response_append(directive);
  }

  //#endregion

  //#region Docs Role //////////////////

  async function Docs_loadBaseInstructions() {
    const lang = Settings_language();
    const [core, instructions] = await Promise.all([
      fs.readFile(path.join(Docs.dir, "core.md"), "utf-8"),
      fs.readFile(path.join(Docs.dir, lang, "instructions.md"), "utf-8"),
    ]);
    Response_setBaseInstructions(core, instructions);
    await Docs_appendExamples(lang);
  }

  async function Docs_appendExamples(lang: string) {
    try {
      const examples = await fs.readFile(
        path.join(Docs.dir, lang, "examples.md"),
        "utf-8",
      );
      Response_append(examples);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  //#endregion

  //#region Response Role //////////////////

  const Response: { text: string } = { text: "" };

  function Response_setBaseInstructions(core: string, instructions: string) {
    Response.text = `${core}\n\n${instructions}`;
  }

  function Response_append(content: string) {
    Response.text += `\n\n${content}`;
  }

  function Response_getText() {
    return Response.text;
  }

  //#endregion

  // System operation
  await Docs_loadBaseInstructions();
  Settings_applyDirective();
  return Response_getText();
}

server.registerTool(
  "prepare_dci_refactor",
  {
    title: "Prepare DCI Refactor",
    description:
      `Call this tool when the user asks to refactor code into the DCI paradigm. Pass the target language. ` +
      `The tool will return the strict DCI architectural rules you need to follow before generating the final code.`,
    inputSchema: languageSchema,
  },
  async ({ language }) => {
    try {
      const content = await ServeInstructions(
        { language, action: "refactor" },
        { dir: DOCS_DIR },
      );
      return { content: [{ type: "text" as const, text: content }] };
    } catch {
      return languageNotFound();
    }
  },
);

server.registerTool(
  "scaffold_dci_from_mental_model",
  {
    title: "Scaffold DCI from Mental Model",
    description:
      `Call this tool when the user provides a mental model or user story and wants you to write a new DCI Context from scratch. ` +
      `The tool will return the strict DCI architectural rules required to translate their mental model into code.`,
    inputSchema: languageSchema,
  },
  async ({ language }) => {
    try {
      const content = await ServeInstructions(
        { language, action: "scaffold" },
        { dir: DOCS_DIR },
      );
      return { content: [{ type: "text" as const, text: content }] };
    } catch {
      return languageNotFound();
    }
  },
);

// Start the server using stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DCI MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
