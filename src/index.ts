/**
 * shopify-ai-agent — AI shopping agent for Shopify stores
 *
 * Powered by AINative Gateway with ZeroMemory for persistent shopper context.
 * Multi-provider LLM failover, Shopify MCP integration, product search,
 * cart management, and checkout.
 *
 * @example
 * ```typescript
 * import { ShopifyAIAgent } from 'shopify-ai-agent';
 *
 * const agent = new ShopifyAIAgent({
 *   apiKey: process.env.AINATIVE_API_KEY,
 *   shopDomain: 'my-store.myshopify.com',
 * });
 *
 * const response = await agent.chat('Show me winter jackets under $200');
 * console.log(response.text);
 * console.log(response.products); // Product cards if found
 * ```
 */

export { ShopifyAIAgent } from './agent';
export { ZeroMemoryClient } from './memory';
export { ShopifyMCPClient } from './shopify-mcp';
export type {
  AgentConfig,
  ChatResponse,
  Product,
  CartItem,
  ShopperMemory,
  MCPTool,
} from './types';
