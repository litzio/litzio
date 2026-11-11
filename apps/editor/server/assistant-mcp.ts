import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export type HostToolCall = { threadId: string; turnId: string; callId: string; tool: string; arguments: any; namespace?: string };
export type HostToolResult = { success: boolean | null; contentItems: { type: string; text?: string; imageUrl?: string }[] };
type Tool = { name: string; description: string; inputSchema: object };
type Lease = { token: string; name: string; conversationId?: string; turnId?: string; servers: { type: "http"; name: string; url: string; headers: [] }[] };

/** HTTP is owned by the existing Host listener. Tokens are turn capabilities, not daemon authentication. */
export class AssistantMcp {
  base?: string;
  private leases = new Map<string, Lease>();
  constructor(private tools: () => Tool[], private execute: (call: HostToolCall) => Promise<HostToolResult>) {}
  create() {
    const token = randomUUID(), name = "litzio_host";
    const lease: Lease = { token, name, servers: this.base ? [{ type: "http", name, url: `${this.base}/api/assistant/mcp/${token}`, headers: [] }] : [] };
    this.leases.set(token, lease); return lease;
  }
  bind(lease: Lease, id: string) { lease.conversationId = id; }
  servers(id: string) {
    this.revokeConversation(id);
    const lease = this.create(); this.bind(lease, id); return lease.servers;
  }
  lease(id: string) { const lease = [...this.leases.values()].find(lease => lease.conversationId === id); if (!lease) throw new Error("Missing Copilot MCP connection."); return lease; }
  revokeConversation(id: string) { for (const lease of this.leases.values()) if (lease.conversationId === id) this.revoke(lease); }
  revoke(lease: Lease) { this.leases.delete(lease.token); }
  close() { this.leases.clear(); }
  permission(id: string, raw: unknown, title?: string | null) {
    // ACP metadata is only a provider approval hint. Every execution independently checks Host scope.
    const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return [...this.leases.values()].some(lease => lease.conversationId === id && lease.turnId && this.tools().some(tool => input.serverName === lease.name && (input.toolName === tool.name || input.toolName === `${lease.name}-${tool.name}`) || title === `${lease.name}-${tool.name}`));
  }
  async handle(req: IncomingMessage, res: ServerResponse) {
    const token = new URL(req.url!, "http://localhost").pathname.split("/").at(-1)!;
    const lease = this.leases.get(token);
    if (!lease) { res.writeHead(403).end(); return; }
    const server = new Server({ name: "litzio-host", version: "1" }, { capabilities: { tools: {} } });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools().map(({ name, description, inputSchema }) => ({ name, description, inputSchema: inputSchema as any })) }));
    server.setRequestHandler(CallToolRequestSchema, async request => {
      if (this.leases.get(token) !== lease || !lease.conversationId || !lease.turnId) throw new Error("No authorized active turn for this tool call.");
      if (!this.tools().some(tool => tool.name === request.params.name)) throw new Error("Unknown Host tool.");
      let result: HostToolResult;
      try { result = await this.execute({ threadId: lease.conversationId, turnId: lease.turnId, callId: randomUUID(), tool: request.params.name, arguments: request.params.arguments ?? {} }); }
      catch (error) { return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Host tool failed." }] }; }
      return { isError: !result.success, content: result.contentItems.map(item => {
        if (item.type === "inputImage" && item.imageUrl?.startsWith("data:")) {
          const [header, data] = item.imageUrl.split(","); return { type: "image", mimeType: header!.slice(5).split(";")[0], data };
        }
        return { type: "text", text: item.text ?? "" };
      }) };
    });
    try { await server.connect(transport); await transport.handleRequest(req, res); }
    finally { await transport.close(); await server.close(); }
  }
}
