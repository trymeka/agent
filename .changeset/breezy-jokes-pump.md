---
"@trymeka/computer-provider-e2b": patch
---

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
