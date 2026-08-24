import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __tsClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __tsDb: Db | undefined;
}

function connect(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL environment variable. Copy .env.example to .env and fill in the Postgres connection string.",
    );
  }
  const client =
    global.__tsClient ??
    postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      prepare: false, // an toàn với connection pooler (Supabase pgBouncer)
    });
  if (process.env.NODE_ENV !== "production") global.__tsClient = client;
  return drizzle(client, { schema });
}

/**
 * Kết nối được tạo ở lần truy cập đầu tiên, không phải lúc import module —
 * nhờ vậy `next build` chạy được mà không cần DATABASE_URL.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    if (!global.__tsDb) global.__tsDb = connect();
    return Reflect.get(global.__tsDb as object, prop, receiver);
  },
});

export { schema };
