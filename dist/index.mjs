// src/agent.ts
import Anthropic from "@anthropic-ai/sdk";

// src/memory.ts
var DEFAULT_MEMORY_URL = "https://api.ainative.studio/api/v1/public/memory/v2";
var ZeroMemoryClient = class {
  constructor(apiKey, shopDomain, baseUrl) {
    this.apiKey = apiKey;
    this.shopDomain = shopDomain;
    this.baseUrl = baseUrl || DEFAULT_MEMORY_URL;
  }
  /**
   * Recall shopper context from previous sessions.
   * Returns preferences, past products, sizing info.
   */
  async recall(conversationId) {
    if (!this.apiKey) return null;
    try {
      const resp = await fetch(`${this.baseUrl}/recall`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          query: "shopper preferences, past orders, sizing, style",
          namespace: `shopify:${this.shopDomain}`,
          limit: 5
        })
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const memories = data.results || data.memories || [];
      if (memories.length === 0) return null;
      return memories.map((m) => m.content || m.text || "").filter(Boolean).join("\n");
    } catch {
      return null;
    }
  }
  /**
   * Store interaction context for future personalization.
   * Only stores meaningful interactions (not greetings).
   */
  async store(conversationId, userMessage, agentResponse) {
    if (!this.apiKey) return;
    if (userMessage.length < 10) return;
    try {
      await fetch(`${this.baseUrl}/remember`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          content: `[${this.shopDomain}] Shopper: "${userMessage.slice(0, 200)}" \u2014 Agent: ${agentResponse.slice(0, 300)}`,
          memory_type: "episodic",
          importance: 0.6,
          namespace: `shopify:${this.shopDomain}`,
          tags: ["shopify", this.shopDomain, "shopper-interaction"]
        })
      });
    } catch {
    }
  }
};

// src/shopify-mcp.ts
var ShopifyMCPClient = class {
  constructor(shopDomain) {
    this.tools = [];
    const baseUrl = shopDomain.startsWith("http") ? shopDomain : `https://${shopDomain}`;
    this.storefrontEndpoint = `${baseUrl}/api/mcp`;
    const accountUrl = baseUrl.replace(
      /\.myshopify\.com$/,
      ".account.myshopify.com"
    );
    this.customerEndpoint = `${accountUrl}/customer/api/mcp`;
  }
  /**
   * Connect to the storefront MCP server and discover available tools.
   */
  async connect() {
    try {
      const response = await this.jsonRpc(
        this.storefrontEndpoint,
        "tools/list",
        {}
      );
      const result = response.result;
      const toolsData = result?.tools || [];
      this.tools = toolsData.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema || t.input_schema || {}
      }));
      return this.tools;
    } catch (e) {
      console.error("Failed to connect to Shopify MCP:", e);
      return [];
    }
  }
  /**
   * Call a tool on the storefront MCP server.
   */
  async callTool(toolName, args) {
    const response = await this.jsonRpc(
      this.storefrontEndpoint,
      "tools/call",
      { name: toolName, arguments: args }
    );
    return response.result || response;
  }
  /**
   * Get the list of discovered tools.
   */
  getTools() {
    return this.tools;
  }
  async jsonRpc(endpoint, method, params, headers) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers || {}
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        id: 1,
        params
      })
    });
    if (!resp.ok) {
      const text = await resp.text();
      const error = new Error(
        `MCP request failed: ${resp.status} ${text}`
      );
      error.status = resp.status;
      throw error;
    }
    return await resp.json();
  }
};

// src/agent.ts
var DEFAULT_SYSTEM_PROMPT = `You are a helpful AI shopping assistant for this store. You can search for products, manage the shopping cart, check order status, and answer questions about store policies.

Be concise, friendly, and helpful. When showing products, highlight key features and pricing. When the shopper seems ready to buy, guide them to checkout.`;
var ShopifyAIAgent = class {
  constructor(config) {
    this.conversationHistory = [];
    this.connected = false;
    this.config = {
      model: "claude-sonnet-4-20250514",
      maxTokens: 2e3,
      enableMemory: true,
      ...config
    };
    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.apiBaseUrl ? `${this.config.apiBaseUrl}/v1` : void 0
    });
    this.memory = this.config.enableMemory ? new ZeroMemoryClient(this.config.apiKey, this.config.shopDomain) : null;
    this.mcp = new ShopifyMCPClient(this.config.shopDomain);
  }
  /**
   * Connect to Shopify MCP and discover available tools.
   * Called automatically on first chat() if not called manually.
   */
  async connect() {
    if (this.connected) return;
    await this.mcp.connect();
    this.connected = true;
  }
  /**
   * Send a message and get a response.
   * Handles tool calling, memory, and product extraction automatically.
   */
  async chat(message, conversationId) {
    await this.connect();
    let systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (this.memory && conversationId) {
      const context = await this.memory.recall(conversationId);
      if (context) {
        systemPrompt += `

## Shopper Context (from memory)
${context}`;
      }
    }
    this.conversationHistory.push({ role: "user", content: message });
    const mcpTools = this.mcp.getTools();
    const tools = mcpTools.length > 0 ? mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    })) : void 0;
    const products = [];
    const toolsCalled = [];
    let checkoutUrl;
    let response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: this.conversationHistory,
      tools
    });
    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      this.conversationHistory.push({
        role: "assistant",
        content: assistantContent
      });
      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          toolsCalled.push(block.name);
          try {
            const result = await this.mcp.callTool(
              block.name,
              block.input
            );
            const resultText = result.content?.map(
              (c) => c.text
            ).join("\n") || JSON.stringify(result);
            if (block.name === "search_catalog" || block.name === "search_shop_catalog") {
              try {
                const parsed = JSON.parse(resultText);
                if (parsed.products) {
                  products.push(
                    ...parsed.products.slice(0, 3).map(formatProduct)
                  );
                }
              } catch {
              }
            }
            if (resultText.includes("checkout")) {
              const urlMatch = resultText.match(
                /https?:\/\/[^\s"]+checkout[^\s"]*/
              );
              if (urlMatch) checkoutUrl = urlMatch[0];
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: resultText
            });
          } catch (e) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${e.message}`,
              is_error: true
            });
          }
        }
      }
      this.conversationHistory.push({
        role: "user",
        content: toolResults
      });
      response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: this.conversationHistory,
        tools
      });
    }
    const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    this.conversationHistory.push({
      role: "assistant",
      content: response.content
    });
    if (this.memory && conversationId) {
      await this.memory.store(conversationId, message, text);
    }
    return {
      text,
      products,
      checkoutUrl,
      toolsCalled,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    };
  }
  /**
   * Stream a response with callbacks for real-time UI updates.
   */
  async stream(message, callbacks, conversationId) {
    try {
      const response = await this.chat(message, conversationId);
      if (callbacks.onText) callbacks.onText(response.text);
      for (const p of response.products) {
        if (callbacks.onProduct) callbacks.onProduct(p);
      }
      if (callbacks.onComplete) callbacks.onComplete(response);
    } catch (e) {
      if (callbacks.onError) callbacks.onError(e);
    }
  }
  /**
   * Reset conversation history (start a new conversation).
   */
  reset() {
    this.conversationHistory = [];
  }
};
function formatProduct(p) {
  const priceRange = p.price_range;
  const variants = p.variants;
  const price = priceRange ? `${priceRange.currency} ${priceRange.min}` : variants && variants.length > 0 ? `${variants[0].currency} ${variants[0].price}` : "Price not available";
  return {
    id: p.product_id || `product-${Math.random().toString(36).slice(2, 9)}`,
    title: p.title || "Product",
    description: p.description || "",
    price,
    imageUrl: p.image_url || "",
    url: p.url || ""
  };
}
export {
  ShopifyAIAgent,
  ShopifyMCPClient,
  ZeroMemoryClient
};
//# sourceMappingURL=index.mjs.map