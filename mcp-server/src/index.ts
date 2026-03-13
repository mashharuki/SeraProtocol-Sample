#!/usr/bin/env node
/**
 * SeraProtocol MCP Server
 *
 * Provides natural language access to SeraProtocol's decentralized order book
 * trading protocol on Ethereum Sepolia testnet.
 *
 * Transports:
 *   - stdio (default): For Claude Code / Claude Desktop
 *   - http:            For remote access / ChatGPT / web clients
 *     Set TRANSPORT=http and PORT=3000 (default) to enable.
 *
 * Read-only tools (no PRIVATE_KEY required):
 *   sera_get_market, sera_list_markets, sera_get_orderbook,
 *   sera_get_orders, sera_get_token_balance
 *
 * Write tools (PRIVATE_KEY required):
 *   sera_place_order, sera_claim_order, sera_approve_token
 *
 * Environment variables:
 *   TRANSPORT   - "stdio" (default) or "http"
 *   PORT        - HTTP port (default: 3000, only used with TRANSPORT=http)
 *   PRIVATE_KEY - 0x-prefixed private key for write operations (optional)
 *   SEPOLIA_RPC_URL - Custom RPC URL (optional)
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerReadTools } from "./tools/read-tools.js";
import { registerWriteTools } from "./tools/write-tools.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "sera-mcp-server",
    version: "1.0.0",
  });

  registerReadTools(server);
  registerWriteTools(server);

  return server;
}

// ────────────────────────────────────────────
// stdio transport (default)
// ────────────────────────────────────────────
async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SeraProtocol MCP server running via stdio");
}

// ────────────────────────────────────────────
// Streamable HTTP transport
// ────────────────────────────────────────────
async function runHttp(): Promise<void> {
  // Dynamic import to avoid requiring express when using stdio
  const { default: express } = await import("express");

  const app = express();
  app.use(express.json());

  // Session management
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "sera-mcp-server",
      version: "1.0.0",
      transport: "streamable-http",
    });
  });

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (id) => {
            transports[id] = transport;
            console.error(`Session initialized: ${id}`);
          },
        });

        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              "Bad Request: No valid session ID provided. Send an initialize request first.",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Spec: GET /mcp returns 405
  app.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  // Delete session
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].close();
      delete transports[sessionId];
      console.error(`Session closed: ${sessionId}`);
      res.status(200).json({ status: "session closed" });
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`SeraProtocol MCP server running on http://localhost:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
  });

  process.on("SIGINT", () => {
    console.error("Shutting down...");
    for (const transport of Object.values(transports)) {
      transport.close();
    }
    process.exit(0);
  });
}

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────
const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHttp().catch((error) => {
    console.error("HTTP server startup failed:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("stdio server startup failed:", error);
    process.exit(1);
  });
}
