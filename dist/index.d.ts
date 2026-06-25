/**
 * Core types for shopify-ai-agent
 */
interface AgentConfig {
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
interface ChatResponse {
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
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}
interface Product {
    id: string;
    title: string;
    description: string;
    price: string;
    imageUrl: string;
    url: string;
    variants?: ProductVariant[];
}
interface ProductVariant {
    id: string;
    title: string;
    price: string;
    available: boolean;
}
interface CartItem {
    productId: string;
    variantId: string;
    title: string;
    quantity: number;
    price: string;
}
interface ShopperMemory {
    preferences: string[];
    recentProducts: string[];
    sizes?: Record<string, string>;
    style?: string;
}
interface MCPTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
interface MCPToolResult {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
}
interface StreamCallbacks {
    onText?: (text: string) => void;
    onToolUse?: (tool: {
        name: string;
        input: Record<string, unknown>;
    }) => void;
    onProduct?: (product: Product) => void;
    onComplete?: (response: ChatResponse) => void;
    onError?: (error: Error) => void;
}

/**
 * ShopifyAIAgent — The main agent class
 *
 * Orchestrates: LLM (via AINative Gateway) + Shopify MCP + ZeroMemory
 *
 * @example
 * ```typescript
 * const agent = new ShopifyAIAgent({
 *   apiKey: 'your-ainative-key',
 *   shopDomain: 'my-store.myshopify.com',
 * });
 *
 * const response = await agent.chat('Show me snowboards');
 * ```
 */

declare class ShopifyAIAgent {
    private config;
    private anthropic;
    private memory;
    private mcp;
    private conversationHistory;
    private connected;
    constructor(config: AgentConfig);
    /**
     * Connect to Shopify MCP and discover available tools.
     * Called automatically on first chat() if not called manually.
     */
    connect(): Promise<void>;
    /**
     * Send a message and get a response.
     * Handles tool calling, memory, and product extraction automatically.
     */
    chat(message: string, conversationId?: string): Promise<ChatResponse>;
    /**
     * Stream a response with callbacks for real-time UI updates.
     */
    stream(message: string, callbacks: StreamCallbacks, conversationId?: string): Promise<void>;
    /**
     * Reset conversation history (start a new conversation).
     */
    reset(): void;
}

/**
 * ZeroMemory Client — Persistent shopper context across sessions
 *
 * Remembers: preferences, sizes, past products viewed, style patterns.
 * This is the key differentiator — no other Shopify AI agent has memory.
 */
declare class ZeroMemoryClient {
    private apiKey;
    private baseUrl;
    private shopDomain;
    constructor(apiKey: string, shopDomain: string, baseUrl?: string);
    /**
     * Recall shopper context from previous sessions.
     * Returns preferences, past products, sizing info.
     */
    recall(conversationId: string): Promise<string | null>;
    /**
     * Store interaction context for future personalization.
     * Only stores meaningful interactions (not greetings).
     */
    store(conversationId: string, userMessage: string, agentResponse: string): Promise<void>;
}

/**
 * Shopify MCP Client — Connects to Shopify's native MCP endpoints
 *
 * Every Shopify store exposes /api/mcp by default (5.6M stores).
 * This client handles tool discovery and invocation via JSON-RPC.
 */

declare class ShopifyMCPClient {
    private storefrontEndpoint;
    private customerEndpoint;
    private tools;
    constructor(shopDomain: string);
    /**
     * Connect to the storefront MCP server and discover available tools.
     */
    connect(): Promise<MCPTool[]>;
    /**
     * Call a tool on the storefront MCP server.
     */
    callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
    /**
     * Get the list of discovered tools.
     */
    getTools(): MCPTool[];
    private jsonRpc;
}

export { type AgentConfig, type CartItem, type ChatResponse, type MCPTool, type Product, ShopifyAIAgent, ShopifyMCPClient, type ShopperMemory, ZeroMemoryClient };
