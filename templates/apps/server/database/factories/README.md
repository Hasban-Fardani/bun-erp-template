# Factories

A factory builds deterministic rows for tests and seeders. `bun erp make:factory <feature>` writes
`database/factories/<feature>.ts`; `make:feature` emits one for every new table.

```ts
import { defineFactory } from "./define.ts";

export const invoiceFactory = defineFactory(invoices, (n) => ({ code: `INV-${n}` }));

await invoiceFactory.create(db, { code: "INV-OVERRIDE" });
await invoiceFactory.createMany(db, 5);
invoiceFactory.make(); // values only, no insert
```

Sequences start at 1 per factory and restart with `reset()`. There is no faker dependency by design.
