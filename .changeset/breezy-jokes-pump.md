---
"@trymeka/computer-provider-scrapybara": patch
"@trymeka/computer-provider-e2b": patch
"@trymeka/core": patch
---

feat(core): add support for getting current url from `ComputerProvider`
feat(E2B): add support for E2B `ComputerProvider`

Usage is similar to Scapybara` today:

```typescript
const computerProvider = createE2BComputerProvider({
  apiKey: process.env.E2B_API_KEY,
  initialUrl: "https://news.ycombinator.com/news",
});
const agent = createAgent({
  aiProvider: createVercelAIProvider({...}),
  computerProvider,
});
```
