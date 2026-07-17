// DI tokens.
// Discipline: this server never relies on emitDecoratorMetadata. Every injection
// uses an explicit @Inject(TOKEN) so the esbuild/tsup bundle stays metadata-free.
export const API_SERVER_ENV = 'API_SERVER_ENV';
export const API_SERVER_DB = 'API_SERVER_DB';
