import { useEffect, useState } from "react";
import { cn } from "../lib/cn.ts";

export type ToastMessage = {
  id: number;
  title: string;
  description?: string;
  type?: "success" | "info" | "warning" | "error" | "loading";
};

const subscribers = new Set<(messages: ToastMessage[]) => void>();
let messages: ToastMessage[] = [];
let nextId = 0;

function publish() {
  for (const subscriber of subscribers) subscriber(messages);
}

function add({ title, description, type = "info" }: Omit<ToastMessage, "id">) {
  const id = ++nextId;
  messages = [...messages, { id, title, description, type }];
  publish();
  setTimeout(() => dismiss(id), type === "error" ? 7000 : 4000);
  return id;
}

function dismiss(id: number) {
  messages = messages.filter((message) => message.id !== id);
  publish();
}

export const toast = {
  add,
  success: (title: string, description?: string) => add({ title, description, type: "success" }),
  info: (title: string, description?: string) => add({ title, description, type: "info" }),
  warning: (title: string, description?: string) => add({ title, description, type: "warning" }),
  error: (title: string, description?: string) => add({ title, description, type: "error" }),
  dismiss,
  promise: async <T,>(promise: Promise<T>, options: { loading: string; success: string; error: string }) => {
    const id = add({ title: options.loading, type: "loading" });
    try {
      const result = await promise;
      dismiss(id);
      add({ title: options.success, type: "success" });
      return result;
    } catch (error) {
      dismiss(id);
      add({ title: options.error, type: "error" });
      throw error;
    }
  },
};

export function Toaster({ className }: { className?: string }) {
  const [items, setItems] = useState(messages);
  useEffect(() => {
    subscribers.add(setItems);
    return () => {
      subscribers.delete(setItems);
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4",
        className,
      )}
      aria-live="polite"
    >
      {items.map((message) => (
        <div
          key={message.id}
          role={message.type === "error" ? "alert" : "status"}
          data-type={message.type}
          className="pointer-events-auto rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-sm font-medium">{message.title}</p>
              {message.description ? <p className="text-sm text-muted-foreground">{message.description}</p> : null}
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => dismiss(message.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
