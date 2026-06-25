# shopify-ai-agent

AI shopping agent for Shopify stores — powered by [AINative Gateway](https://ainative.studio) with ZeroMemory for persistent shopper context.

[![npm](https://img.shields.io/npm/v/shopify-ai-agent)](https://www.npmjs.com/package/shopify-ai-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Every Shopify store already has an MCP endpoint at `/api/mcp`. This package connects your AI agent to it — with multi-provider LLM failover and persistent shopper memory that no other Shopify chatbot has.

| Feature | Other Shopify Chatbots | shopify-ai-agent |
|---------|----------------------|------------------|
| LLM Provider | Single (usually GPT) | Multi-provider failover (Claude, GPT, Meta, Cerebras) |
| Shopper Memory | None | ZeroMemory — remembers preferences across sessions |
| MCP Integration | Custom API wrappers | Native Shopify MCP (standard protocol) |
| Setup Time | 30-60 min | 2 minutes |

## Quick Start

```bash
npm install shopify-ai-agent
```

### As a Library

```typescript
import { ShopifyAIAgent } from 'shopify-ai-agent';

const agent = new ShopifyAIAgent({
  apiKey: process.env.AINATIVE_API_KEY!, // or CLAUDE_API_KEY
  shopDomain: 'my-store.myshopify.com',
});

// Simple chat
const response = await agent.chat('Show me winter jackets under $200');
console.log(response.text);       // "Here are some great options..."
console.log(response.products);   // [{ title, price, imageUrl, url }]

// With memory (remembers shopper across sessions)
const r = await agent.chat('I prefer blue, size medium', 'shopper-123');
// Next time shopper-123 visits, agent remembers their preferences
```

### As a CLI

```bash
# With env var
export AINATIVE_API_KEY=your-key
npx shopify-ai-agent --shop my-store.myshopify.com

# With explicit key
npx shopify-ai-agent --shop my-store.myshopify.com --api-key sk_...
```

### Streaming (for real-time UI)

```typescript
await agent.stream('Find me running shoes', {
  onText: (text) => updateUI(text),
  onProduct: (product) => showProductCard(product),
  onComplete: (response) => console.log('Done', response.usage),
  onError: (error) => console.error(error),
}, 'shopper-123');
```

## Shopify MCP Tools

The agent automatically connects to your store's MCP endpoint and uses these tools:

| Tool | What it does |
|------|-------------|
| `search_catalog` | Natural language product search |
| `update_cart` | Add/remove/update cart items |
| `get_cart` | View current cart contents |
| `search_shop_policies_and_faqs` | Store policies, shipping, returns |
| `get_order_status` | Look up a specific order |
| `get_most_recent_order_status` | Check latest order |

## ZeroMemory (Persistent Shopper Context)

The killer feature. When `enableMemory: true` (default), the agent:

1. **Recalls** shopper preferences from previous sessions before responding
2. **Stores** meaningful interactions (product searches, size preferences, style choices)
3. **Personalizes** future responses based on accumulated context

```typescript
// Session 1: Shopper tells agent their preferences
await agent.chat("I'm looking for men's shoes, size 11, prefer Nike", 'shopper-456');

// Session 2 (days later): Agent remembers
const r = await agent.chat("What's new?", 'shopper-456');
// Agent knows to show men's Nike shoes in size 11
```

## Configuration

```typescript
const agent = new ShopifyAIAgent({
  // Required
  apiKey: 'your-ainative-or-claude-key',
  shopDomain: 'store.myshopify.com',

  // Optional
  model: 'claude-sonnet-4-20250514',  // any model via AINative Gateway
  maxTokens: 2000,
  enableMemory: true,                  // ZeroMemory (default: true)
  systemPrompt: 'Custom instructions', // Override default prompt
  apiBaseUrl: 'https://api.ainative.studio', // AINative Gateway URL
});
```

## Get Your API Key

1. Go to [ainative.studio](https://ainative.studio)
2. Sign up (free tier available)
3. Create a project → get your API key
4. Provision takes < 60 seconds

## Links

- [AINative Studio](https://ainative.studio) — Multi-provider AI gateway
- [ZeroMemory](https://docs.ainative.studio) — Persistent agent memory
- [Shopify MCP Docs](https://shopify.dev/docs/apps/build/storefront-mcp)
- [GitHub](https://github.com/AINative-Studio/shop-chat-agent)

## License

MIT

Built by [AINative Studio](https://ainative.studio)
