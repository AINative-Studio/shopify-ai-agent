/**
 * Core types for shopify-ai-agent
 */

export interface AgentConfig {
  /** AINative API key (recommended) or Claude API key (fallback) */
  apiKey: string;
  /** Shopify store domain (e.g., 'my-store.myshopify.com') */
  shopDomain: string;
  /** LLM model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** AINative API base URL (default: https://api.ainative.studio) */
  apiBaseUrl?: string;
  /** Enable ZeroMemory for persistent shopper context (default: true) */
  enableMemory?: boolean;
  /** System prompt override */
  systemPrompt?: string;
  /** Max tokens for LLM response (default: 2000) */
  maxTokens?: number;
}

export interface ChatResponse {
  /** The agent's text response */
  text: string;
  /** Products found (if product search was triggered) */
  products: Product[];
  /** Cart state (if cart was modified) */
  cart?: CartItem[];
  /** Checkout URL (if checkout was initiated) */
  checkoutUrl?: string;
  /** Tools that were called */
  toolsCalled: string[];
  /** Token usage */
  usage: { inputTokens: number; outputTokens: number };
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  url: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  title: string;
  price: string;
  available: boolean;
}

export interface CartItem {
  productId: string;
  variantId: string;
  title: string;
  quantity: number;
  price: string;
}

export interface ShopperMemory {
  preferences: string[];
  recentProducts: string[];
  sizes?: Record<string, string>;
  style?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolUse?: (tool: { name: string; input: Record<string, unknown> }) => void;
  onProduct?: (product: Product) => void;
  onComplete?: (response: ChatResponse) => void;
  onError?: (error: Error) => void;
}
