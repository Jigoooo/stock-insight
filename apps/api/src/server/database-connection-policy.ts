export type DatabaseConnectionEnvironment = Readonly<{
  databaseUrl?: string;
  databaseReadUrl?: string;
  databaseWriteUrl?: string;
}>;

export type DatabaseConnectionStrings = Readonly<{
  read: string | undefined;
  write: string | undefined;
}>;

export function resolveDatabaseConnectionStrings(
  env: DatabaseConnectionEnvironment,
): DatabaseConnectionStrings {
  return {
    read: env.databaseReadUrl ?? env.databaseUrl,
    write: env.databaseWriteUrl,
  };
}
