import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["double-tap.test.ts"], root: import.meta.dirname },
  server: { fs: { allow: ["/home/user/deca-mark/mobile", import.meta.dirname, "/home/user/deca-mark/contracts"] } },
});
