#!/usr/bin/env node
/**
 * CLI for shopify-ai-agent
 *
 * Usage:
 *   npx shopify-ai-agent --shop my-store.myshopify.com --api-key sk_...
 *   npx shopify-ai-agent --shop my-store.myshopify.com  # uses AINATIVE_API_KEY env
 */

import { ShopifyAIAgent } from './agent';
import * as readline from 'readline';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const shopDomain = getArg('shop') || getArg('domain');
const apiKey =
  getArg('api-key') ||
  process.env.AINATIVE_API_KEY ||
  process.env.CLAUDE_API_KEY;
const model = getArg('model');

if (!shopDomain) {
  console.error(
    'Usage: shopify-ai-agent --shop <store>.myshopify.com [--api-key <key>] [--model <model>]',
  );
  console.error(
    '\nOr set AINATIVE_API_KEY env var for the API key.',
  );
  process.exit(1);
}

if (!apiKey) {
  console.error(
    'Error: No API key found. Set AINATIVE_API_KEY or use --api-key',
  );
  process.exit(1);
}

async function main() {
  const agent = new ShopifyAIAgent({
    apiKey: apiKey!,
    shopDomain: shopDomain!,
    model: model || undefined,
  });

  console.log(`\n🛍️  Shopify AI Agent — Connected to ${shopDomain}`);
  console.log('   Powered by AINative Gateway + ZeroMemory');
  console.log('   Type your message or "quit" to exit.\n');

  await agent.connect();
  const tools = agent['mcp'].getTools();
  console.log(`   ${tools.length} MCP tools available\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: ',
  });

  const conversationId = `cli-${Date.now()}`;

  rl.prompt();
  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === 'quit' || input === 'exit') {
      console.log('\nGoodbye! 👋');
      rl.close();
      process.exit(0);
    }

    try {
      const response = await agent.chat(input, conversationId);
      console.log(`\nAgent: ${response.text}`);
      if (response.products.length > 0) {
        console.log('\n📦 Products:');
        for (const p of response.products) {
          console.log(`   ${p.title} — ${p.price}`);
          if (p.url) console.log(`   ${p.url}`);
        }
      }
      if (response.checkoutUrl) {
        console.log(`\n🛒 Checkout: ${response.checkoutUrl}`);
      }
      if (response.toolsCalled.length > 0) {
        console.log(
          `   [Tools: ${response.toolsCalled.join(', ')}]`,
        );
      }
      console.log(
        `   [Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out]\n`,
      );
    } catch (e) {
      console.error(`\nError: ${(e as Error).message}\n`);
    }
    rl.prompt();
  });
}

main().catch(console.error);
