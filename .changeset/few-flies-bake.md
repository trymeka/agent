---
"@trymeka/computer-provider-scrapybara": patch
"@trymeka/core": patch
---

feat(core): add function to expose underlying computer provider

```typescript
const computerProvider = createScrapybaraComputerProvider({
  apiKey: process.env.SCRAPYBARA_API_KEY,
});
const sessionId = randomUUID(); // make sure this is valid
const instance = await computer.getInstance(sessionId)
```
