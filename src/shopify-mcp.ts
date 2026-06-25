/**
 * Shopify MCP Client — Connects to Shopify's native MCP endpoints
 *
 * Every Shopify store exposes /api/mcp by default (5.6M stores).
 * This client handles tool discovery and invocation via JSON-RPC.
 */

import type { MCPTool, MCPToolResult } from './types';

export class ShopifyMCPClient {
  private storefrontEndpoint: string;
  private customerEndpoint: string;
  private tools: MCPTool[] = [];

  constructor(shopDomain: string) {
    // Shopify exposes MCP at /api/mcp on every store
    const baseUrl = shopDomain.startsWith('http')
      ? shopDomain
      : `https://${shopDomain}`;
    this.storefrontEndpoint = `${baseUrl}/api/mcp`;

    // Customer account MCP is on the account subdomain
    const accountUrl = baseUrl.replace(
      /\.myshopify\.com$/,
      '.account.myshopify.com',
    );
    this.customerEndpoint = `${accountUrl}/customer/api/mcp`;
  }

  /**
   * Connect to the storefront MCP server and discover available tools.
   */
  async connect(): Promise<MCPTool[]> {
    try {
      const response = await this.jsonRpc(
        this.storefrontEndpoint,
        'tools/list',
        {},
      );
      const result = response.result as { tools?: Record<string, unknown>[] } | undefined;
      const toolsData = result?.tools || [];
      this.tools = toolsData.map((t: Record<string, unknown>) => ({
        name: t.name as string,
        description: t.description as string,
        input_schema: (t.inputSchema || t.input_schema || {}) as Record<
          string,
          unknown
        >,
      }));
      return this.tools;
    } catch (e) {
      console.error('Failed to connect to Shopify MCP:', e);
      return [];
    }
  }

  /**
   * Call a tool on the storefront MCP server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const response = await this.jsonRpc(
      this.storefrontEndpoint,
      'tools/call',
      { name: toolName, arguments: args },
    );
    return (response.result || response) as MCPToolResult;
  }

  /**
   * Get the list of discovered tools.
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  private async jsonRpc(
    endpoint: string,
    method: string,
    params: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        id: 1,
        params,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const error: Error & { status?: number } = new Error(
        `MCP request failed: ${resp.status} ${text}`,
      );
      error.status = resp.status;
      throw error;
    }

    return (await resp.json()) as Record<string, unknown>;
  }
}
