export type AppConfig = {
  databaseUrl: string | undefined;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return { databaseUrl: env.DATABASE_URL };
}
