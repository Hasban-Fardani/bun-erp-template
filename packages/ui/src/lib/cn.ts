import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Last class in order wins — used by every UI component. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
