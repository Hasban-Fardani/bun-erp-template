import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";

/** Run migration SQL inside the caller's migration transaction. */
export async function runSqlMigration(db: Pick<Database, "execute">, source: string): Promise<void> {
  for (const statement of splitSqlStatements(source)) await db.execute(sql.raw(statement));
}

/** Dollar-quoted functions and quoted literals can contain semicolons. */
export function splitSqlStatements(source: string): string[] {
  const tokens =
    /\$([a-zA-Z_][a-zA-Z_0-9]*|)\$[\s\S]*?\$\1\$|'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|;/g;
  const statements: string[] = [];
  let start = 0;
  for (const token of source.matchAll(tokens)) {
    if (token[0] !== ";") continue;
    const statement = source.slice(start, token.index).trim();
    if (statement) statements.push(statement);
    start = token.index + 1;
  }
  const last = source.slice(start).trim();
  if (last) statements.push(last);
  return statements;
}
