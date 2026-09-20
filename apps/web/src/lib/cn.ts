import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Urutan kelas terakhir menang — dipakai semua komponen UI. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
