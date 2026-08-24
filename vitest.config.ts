import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
