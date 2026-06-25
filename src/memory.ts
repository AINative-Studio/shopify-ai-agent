/**
 * ZeroMemory Client — Persistent shopper context across sessions
 *
 * Remembers: preferences, sizes, past products viewed, style patterns.
 * This is the key differentiator — no other Shopify AI agent has memory.
 */

const DEFAULT_MEMORY_URL = 'https://api.ainative.studio/api/v1/public/memory/v2';

export class ZeroMemoryClient {
  private apiKey: string;
  private baseUrl: string;
  private shopDomain: string;

  constructor(apiKey: string, shopDomain: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.shopDomain = shopDomain;
    this.baseUrl = baseUrl || DEFAULT_MEMORY_URL;
  }

  /**
   * Recall shopper context from previous sessions.
   * Returns preferences, past products, sizing info.
   */
  async recall(conversationId: string): Promise<string | null> {
    if (!this.apiKey) return null;

    try {
      const resp = await fetch(`${this.baseUrl}/recall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          query: 'shopper preferences, past orders, sizing, style',
          namespace: `shopify:${this.shopDomain}`,
          limit: 5,
        }),
      });

      if (!resp.ok) return null;
      const data = await resp.json();
      const memories = data.results || data.memories || [];
      if (memories.length === 0) return null;

      return memories
        .map((m: Record<string, string>) => m.content || m.text || '')
        .filter(Boolean)
        .join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Store interaction context for future personalization.
   * Only stores meaningful interactions (not greetings).
   */
  async store(
    conversationId: string,
    userMessage: string,
    agentResponse: string,
  ): Promise<void> {
    if (!this.apiKey) return;
    if (userMessage.length < 10) return; // Skip greetings

    try {
      await fetch(`${this.baseUrl}/remember`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          content: `[${this.shopDomain}] Shopper: "${userMessage.slice(0, 200)}" — Agent: ${agentResponse.slice(0, 300)}`,
          memory_type: 'episodic',
          importance: 0.6,
          namespace: `shopify:${this.shopDomain}`,
          tags: ['shopify', this.shopDomain, 'shopper-interaction'],
        }),
      });
    } catch {
      // Memory writes are best-effort — never block the conversation
    }
  }
}
