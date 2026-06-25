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

import Anthropic from '@anthropic-ai/sdk';
import { ZeroMemoryClient } from './memory';
import { ShopifyMCPClient } from './shopify-mcp';
import type {
  AgentConfig,
  ChatResponse,
  Product,
  StreamCallbacks,
} from './types';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI shopping assistant for this store. You can search for products, manage the shopping cart, check order status, and answer questions about store policies.

Be concise, friendly, and helpful. When showing products, highlight key features and pricing. When the shopper seems ready to buy, guide them to checkout.`;

export class ShopifyAIAgent {
  private config: Required<
    Pick<AgentConfig, 'apiKey' | 'shopDomain' | 'model' | 'maxTokens'>
  > &
    AgentConfig;
  private anthropic: Anthropic;
  private memory: ZeroMemoryClient | null;
  private mcp: ShopifyMCPClient;
  private conversationHistory: Anthropic.MessageParam[] = [];
  private connected = false;

  constructor(config: AgentConfig) {
    this.config = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 2000,
      enableMemory: true,
      ...config,
    };

    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.apiBaseUrl
        ? `${this.config.apiBaseUrl}/v1`
        : undefined,
    });

    this.memory =
      this.config.enableMemory
        ? new ZeroMemoryClient(this.config.apiKey, this.config.shopDomain)
        : null;

    this.mcp = new ShopifyMCPClient(this.config.shopDomain);
  }

  /**
   * Connect to Shopify MCP and discover available tools.
   * Called automatically on first chat() if not called manually.
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    await this.mcp.connect();
    this.connected = true;
  }

  /**
   * Send a message and get a response.
   * Handles tool calling, memory, and product extraction automatically.
   */
  async chat(
    message: string,
    conversationId?: string,
  ): Promise<ChatResponse> {
    await this.connect();

    // Recall shopper memory
    let systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    if (this.memory && conversationId) {
      const context = await this.memory.recall(conversationId);
      if (context) {
        systemPrompt += `\n\n## Shopper Context (from memory)\n${context}`;
      }
    }

    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: message });

    const mcpTools = this.mcp.getTools();
    // Cast to Anthropic's tool format
    const tools: Anthropic.Tool[] | undefined = mcpTools.length > 0
      ? mcpTools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        }))
      : undefined;
    const products: Product[] = [];
    const toolsCalled: string[] = [];
    let checkoutUrl: string | undefined;

    // Run conversation loop (handles multi-turn tool use)
    let response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: this.conversationHistory,
      tools,
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const assistantContent = response.content;
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantContent,
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          toolsCalled.push(block.name);
          try {
            const result = await this.mcp.callTool(
              block.name,
              block.input as Record<string, unknown>,
            );
            const resultText =
              result.content
                ?.map(
                  (c: { type: string; text: string }) => c.text,
                )
                .join('\n') || JSON.stringify(result);

            // Extract products from search results
            if (
              block.name === 'search_catalog' ||
              block.name === 'search_shop_catalog'
            ) {
              try {
                const parsed = JSON.parse(resultText);
                if (parsed.products) {
                  products.push(
                    ...parsed.products.slice(0, 3).map(formatProduct),
                  );
                }
              } catch {
                // Not JSON, skip product extraction
              }
            }

            // Extract checkout URL
            if (resultText.includes('checkout')) {
              const urlMatch = resultText.match(
                /https?:\/\/[^\s"]+checkout[^\s"]*/,
              );
              if (urlMatch) checkoutUrl = urlMatch[0];
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: resultText,
            });
          } catch (e) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error: ${(e as Error).message}`,
              is_error: true,
            });
          }
        }
      }

      this.conversationHistory.push({
        role: 'user',
        content: toolResults,
      });

      response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: this.conversationHistory,
        tools,
      });
    }

    // Extract text from final response
    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: response.content,
    });

    // Store interaction in memory
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
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Stream a response with callbacks for real-time UI updates.
   */
  async stream(
    message: string,
    callbacks: StreamCallbacks,
    conversationId?: string,
  ): Promise<void> {
    try {
      const response = await this.chat(message, conversationId);
      if (callbacks.onText) callbacks.onText(response.text);
      for (const p of response.products) {
        if (callbacks.onProduct) callbacks.onProduct(p);
      }
      if (callbacks.onComplete) callbacks.onComplete(response);
    } catch (e) {
      if (callbacks.onError) callbacks.onError(e as Error);
    }
  }

  /**
   * Reset conversation history (start a new conversation).
   */
  reset(): void {
    this.conversationHistory = [];
  }
}

function formatProduct(p: Record<string, unknown>): Product {
  const priceRange = p.price_range as
    | { currency: string; min: string }
    | undefined;
  const variants = p.variants as
    | Array<{ currency: string; price: string }>
    | undefined;
  const price = priceRange
    ? `${priceRange.currency} ${priceRange.min}`
    : variants && variants.length > 0
      ? `${variants[0].currency} ${variants[0].price}`
      : 'Price not available';

  return {
    id: (p.product_id as string) || `product-${Math.random().toString(36).slice(2, 9)}`,
    title: (p.title as string) || 'Product',
    description: (p.description as string) || '',
    price,
    imageUrl: (p.image_url as string) || '',
    url: (p.url as string) || '',
  };
}
