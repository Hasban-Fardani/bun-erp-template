import { Button } from "@bun-erp/ui/atoms/button-primitives";
import { Calendar } from "@bun-erp/ui/molecules/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@bun-erp/ui/molecules/popover-primitives";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  disabled,
}: {
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          {date ? date.toLocaleDateString() : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={onDateChange} />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({
  value,
  onValueChange,
  placeholder = "Pick a date range",
}: {
  value?: DateRange;
  onValueChange: (range: DateRange | undefined) => void;
  placeholder?: string;
}) {
  const label = value?.from
    ? value.to
      ? `${value.from.toLocaleDateString()} – ${value.to.toLocaleDateString()}`
      : value.from.toLocaleDateString()
    : placeholder;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="range" selected={value} onSelect={onValueChange} />
      </PopoverContent>
    </Popover>
  );
}

export function UncontrolledDatePicker({ defaultValue }: { defaultValue?: Date }) {
  const [date, setDate] = useState<Date | undefined>(defaultValue);
  return <DatePicker date={date} onDateChange={setDate} />;
}
