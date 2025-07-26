---
"@trymeka/computer-provider-anchor-browser": patch
"@trymeka/computer-provider-scrapybara": patch
"@trymeka/core": patch
---

fix(core): Update `computer_action` tool to support fixing missing fields in JSON object
fix(computer-provider-scrapybara): Prevent scrolling by 0 from throwing errors
feat(computer-provider-anchor-browser): Add support for anchor browser as underlying computer provider. See `examples/src/anchor-browser.ts` for a full example.

```typescript
const aiProvider = createVercelAIProvider({
  model: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-4-sonnet-20250514"),
});
const computerProvider = createAnchorBrowserComputerProvider({
  apiKey: process.env.ANCHOR_BROWSER_API_KEY,
});
const agent = createAgent({
  aiProvider,
  computerProvider,
});
// initialize session and run task
```
