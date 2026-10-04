/** TanStack validators may return field maps or individual messages. Keep one accessible summary. */
export function FormErrors({ errors }: { errors: readonly unknown[] }) {
  const messages = errors.flatMap(function collect(error): string[] {
    if (typeof error === "string") return [error];
    if (Array.isArray(error)) return error.flatMap(collect);
    if (error && typeof error === "object") return Object.values(error).flatMap(collect);
    return [];
  });
  if (!messages.length) return null;
  return (
    <ul role="alert" className="space-y-1 text-sm text-danger">
      {[...new Set(messages)].map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
