#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/**
 * Loads and composes complete DCI instruction content for a language and action.
 * @DCI-context
 */
async function ServeInstructions(
  Context: { language: string; action: "refactor" | "scaffold" },
  Docs: { dir: string },
): Promise<string> {
  //#region Context Role //////////////////

  function Context_language() {
    return Context.language.toLowerCase();
  }

  function Context_applyDirective() {
    const instructions = `
---
**CRITICAL INSTRUCTION FOR YOUR NEXT RESPONSE:**
You now have the strict DCI rules. Do not ask for confirmation.
`;

    const directive =
      Context.action === "refactor"
        ? `Immediately analyze the user's legacy code, silently plan the Data/Roles/Context, and generate the refactored DCI code in your next response.`
        : `Read the user's mental model/user story from the chat history and translate it into a DCI Context in your next response.`;

    Response_append(instructions, directive);
  }

  //#endregion

  //#region Docs Role //////////////////

  async function Docs_loadBaseInstructions() {
    const [core, instructions] = await Promise.all([
      fs.readFile(path.join(Docs.dir, "core.md"), "utf-8"),
      fs.readFile(
        path.join(Docs.dir, Context_language(), "instructions.md"),
        "utf-8",
      ),
    ]);
    Response_append(core, instructions);
    await Docs_loadExamples();
  }

  async function Docs_loadExamples() {
    const examples = await fs.readFile(
      path.join(Docs.dir, Context_language(), "examples.md"),
      "utf-8",
    );
    Response_append(examples);
    Context_applyDirective();
  }

  //#endregion

  //#region Response Role //////////////////

  const Response: { parts: string[] } = { parts: [] };

  function Response_append(...contents: string[]) {
    Response.parts.push(...contents);
  }

  function Response_getText() {
    return Response.parts.join("\n\n");
  }

  //#endregion

  // System operation
  {
    await Docs_loadBaseInstructions();
    return Response_getText();
  }
}

class DciMcpServer {
  private readonly server: McpServer;
  private readonly docsDir: string;
  private readonly supportedLanguages: string[] = [];

  constructor(docsDir: string, supportedLanguages: string[]) {
    const { version } = createRequire(import.meta.url)("../package.json") as {
      version: string;
    };
    this.server = new McpServer({ name: "dci-mcp", version });
    this.docsDir = docsDir;
    this.supportedLanguages = supportedLanguages;
  }

  private languageNotFound() {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing tool. Please inform the user that the following languages are supported by the DCI MCP server: ${this.supportedLanguages.join(", ")}.`,
        },
      ],
      isError: true,
    };
  }

  private registerTools() {
    const languageSchema = z.object({
      language: z
        .string()
        .describe(
          "The target programming language. Supported languages: " +
            this.supportedLanguages.join(", "),
        ),
    });

    this.server.registerTool(
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
            { dir: this.docsDir },
          );
          return { content: [{ type: "text" as const, text: content }] };
        } catch {
          return this.languageNotFound();
        }
      },
    );

    this.server.registerTool(
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
            { dir: this.docsDir },
          );
          return { content: [{ type: "text" as const, text: content }] };
        } catch {
          return this.languageNotFound();
        }
      },
    );
  }

  async start() {
    this.registerTools();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("DCI MCP Server running on stdio");
  }
}

///// Config and startup /////

const docsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
);

const entries = await fs.readdir(docsDir, { withFileTypes: true });
const supportedLanguages = entries
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

new DciMcpServer(docsDir, supportedLanguages).start().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
