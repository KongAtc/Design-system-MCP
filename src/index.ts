#!/usr/bin/env node

import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { GitRepository } from "./lib/git.js";
import { DesignSystemTools } from "./lib/tools.js";

const server = new McpServer({
  name: "design-system-mcp",
  version: "0.1.0"
});

const designSystemRepo = process.env.DESIGN_SYSTEM_REPO
  ? resolve(process.env.DESIGN_SYSTEM_REPO)
  : resolve(process.cwd(), "../design-template");

const git = new GitRepository(designSystemRepo);
const tools = new DesignSystemTools(git);

server.registerTool(
  "search_components",
  {
    title: "Search Components",
    description: "Search React/TSX design-system components by intent. Responses are stamped with the resolved Git commit.",
    inputSchema: z.object({
      intent: z.string().min(1),
      ref: z.string().optional()
    })
  },
  async ({ intent, ref }) => jsonResponse(await tools.searchComponents(intent, ref))
);

server.registerTool(
  "get_component",
  {
    title: "Get Component",
    description: "Return component source, generated props contract, variants, usage rules, examples, and accessibility notes.",
    inputSchema: z.object({
      name: z.string().min(1),
      ref: z.string().optional()
    })
  },
  async ({ name, ref }) => jsonResponse(await tools.getComponent(name, ref))
);

server.registerTool(
  "get_design_tokens",
  {
    title: "Get Design Tokens",
    description: "Return the structured design token set from tokens.json at a resolved Git commit.",
    inputSchema: z.object({
      ref: z.string().optional()
    })
  },
  async ({ ref }) => jsonResponse(await tools.getDesignTokens(ref))
);

server.registerTool(
  "list_changes",
  {
    title: "List Changes",
    description: "Return commits and changed files between a prior commit SHA and current latest.",
    inputSchema: z.object({
      since_ref: z.string().min(1)
    })
  },
  async ({ since_ref }) => jsonResponse(await tools.listChanges(since_ref))
);

server.registerTool(
  "validate_usage",
  {
    title: "Validate Usage",
    description: "Compare generated code against current component contracts and tokens to report design-system drift.",
    inputSchema: z.object({
      code: z.string().min(1),
      built_against: z.string().min(1)
    })
  },
  async ({ code, built_against }) => jsonResponse(await tools.validateUsage(code, built_against))
);

function jsonResponse(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Design System MCP server running on stdio. Repo: ${designSystemRepo}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
