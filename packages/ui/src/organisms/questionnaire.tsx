import { Button } from "@bun-erp/ui/atoms/button-primitives";
import { cn } from "@bun-erp/ui/lib/cn.ts";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useState } from "react";

export type QuestionnaireStep = {
  id: string;
  title: string;
  description?: string;
  type?: "text" | "single" | "multiple";
  options?: readonly { value: string; label: string }[];
  required?: boolean;
};

export type QuestionnaireAnswers = Record<string, string | string[]>;

export function Questionnaire({
  items,
  onSubmit,
  children,
  className,
}: {
  items: readonly QuestionnaireStep[];
  onSubmit: (answers: QuestionnaireAnswers) => void;
  children?: ReactNode;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const item = items[step];
  if (!item) return null;

  const setAnswer = (answer: string | string[]) => setAnswers((current) => ({ ...current, [item.id]: answer }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < items.length - 1) setStep((current) => current + 1);
    else onSubmit(answers);
  };

  return (
    <form className={cn("grid gap-5", className)} onSubmit={handleSubmit}>
      <QuestionnaireProgress value={step + 1} max={items.length} />
      <QuestionnaireItemView item={item} value={answers[item.id]} onChange={setAnswer} />
      {children ?? (
        <QuestionnaireActions>
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>
            Previous
          </Button>
          <Button type="submit">{step === items.length - 1 ? "Submit" : "Next"}</Button>
        </QuestionnaireActions>
      )}
    </form>
  );
}

function QuestionnaireItemView({
  item,
  value,
  onChange,
}: {
  item: QuestionnaireStep;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const inputType = item.type ?? "text";
  return (
    <fieldset className="grid gap-3">
      <legend className="text-base font-semibold">{item.title}</legend>
      {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
      {inputType === "text" ? (
        <textarea
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          required={item.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <div className="grid gap-2">
          {item.options?.map((option) => {
            const checked = Array.isArray(value) ? value.includes(option.value) : value === option.value;
            return (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type={inputType === "single" ? "radio" : "checkbox"}
                  name={item.id}
                  value={option.value}
                  checked={checked}
                  required={item.required && inputType === "single"}
                  onChange={(event) => {
                    if (inputType === "single") onChange(option.value);
                    else {
                      const current = Array.isArray(value) ? value : [];
                      onChange(
                        event.currentTarget.checked
                          ? [...current, option.value]
                          : current.filter((entry) => entry !== option.value),
                      );
                    }
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function QuestionnaireActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex justify-between gap-2", className)}>{children}</div>;
}

export function QuestionnaireItem({ children, className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset className={cn("grid gap-3", className)} {...props}>
      {children}
    </fieldset>
  );
}

export function QuestionnaireTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}

export function QuestionnaireDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function QuestionnaireError({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" className={cn("text-sm text-destructive", className)} {...props} />;
}

export function QuestionnaireInput({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export function QuestionnaireChoices({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-2", className)} {...props} />;
}

export function QuestionnaireChoice({
  label,
  checked,
  type = "radio",
  onChange,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type" | "checked" | "onChange"> & {
  label: ReactNode;
  checked: boolean;
  type?: "radio" | "checkbox";
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-sm", className)}>
      <input {...props} type={type} checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      {label}
    </label>
  );
}

export function QuestionnaireNext(props: ComponentProps<"button">) {
  return <Button type="submit" {...props} />;
}

export function QuestionnairePrevious(props: ComponentProps<"button">) {
  return <Button type="button" variant="ghost" {...props} />;
}

export function QuestionnaireSkip({ onSkip, ...props }: ComponentProps<"button"> & { onSkip: () => void }) {
  return <Button type="button" variant="ghost" onClick={onSkip} {...props} />;
}

export function QuestionnaireSubmit(props: ComponentProps<"button">) {
  return <Button type="submit" {...props} />;
}

export function QuestionnaireProgress({ value, max }: { value: number; max: number }) {
  const progress = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="grid gap-2"
      role="progressbar"
      aria-label={`Question ${value} of ${max}`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Question {value} of {max}
      </p>
    </div>
  );
}
