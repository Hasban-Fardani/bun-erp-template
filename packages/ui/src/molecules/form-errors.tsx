import { FieldError } from "./field-primitives.tsx";

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

/**
 * Field-level errors for a single control: TanStack Form hands back strings, `Error` instances, or
 * unknown values, so normalize them here once instead of in every form.
 */
export function FormFieldError({ id, errors }: { id: string; errors: readonly unknown[] }) {
  const messages = errors.flatMap((error) => {
    if (error == null) return [];
    if (typeof error === "string") return [{ message: error }];
    if (error instanceof Error) return [{ message: error.message }];
    return [{ message: String(error) }];
  });

  return <FieldError id={id} className="text-xs" errors={messages} />;
}
