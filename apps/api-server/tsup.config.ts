import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    index: 'src/app.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Workspace packages export raw .ts sources; absorb them into the bundle.
  // Everything else (nestjs, pg, zod, ...) stays external and resolves from node_modules.
  noExternal: [/^@stock-insight\//],
  tsconfig: 'tsconfig.json',
});
