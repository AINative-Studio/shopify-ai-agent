/**
 * MCP Server entry point — for use with Claude Code, Cursor, etc.
 *
 * Usage:
 *   npx shopify-ai-agent --shop my-store.myshopify.com
 *
 * This exposes the ShopifyAIAgent as an MCP server that any AI IDE can connect to.
 */

export { ShopifyMCPClient } from './shopify-mcp';
export { ShopifyAIAgent } from './agent';
export { ZeroMemoryClient } from './memory';
