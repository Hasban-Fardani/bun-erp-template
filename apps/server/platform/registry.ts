/**
 * Pluggable driver registry shared by mail and storage: transports are resolved by name from
 * configuration so a project can register its own without editing the core.
 */
export class DriverRegistry<Context, Driver> {
  readonly #factories = new Map<string, (context: Context) => Driver>();

  constructor(private readonly label: string) {}

  register(name: string, factory: (context: Context) => Driver): this {
    const key = name.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(key)) throw new Error(`Invalid ${this.label} name: ${name}`);
    this.#factories.set(key, factory);
    return this;
  }

  has(name: string): boolean {
    return this.#factories.has(name.trim().toLowerCase());
  }

  names(): string[] {
    return [...this.#factories.keys()].sort();
  }

  create(name: string, context: Context): Driver {
    const key = name.trim().toLowerCase();
    const factory = this.#factories.get(key);
    if (!factory) {
      throw new Error(`Unknown ${this.label} "${name}". Registered: ${this.names().join(", ") || "(none)"}`);
    }
    return factory(context);
  }
}
