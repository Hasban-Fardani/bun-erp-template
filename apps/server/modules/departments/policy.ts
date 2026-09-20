import { ApiError } from "../../http/errors.ts";

/**
 * Policy placeholder Phase 1: masih menerima semua aksi yang sudah lolos auth.
 * Phase 2 menggantinya dengan permission `departments.view` / `departments.update`.
 */
export type DepartmentAction = "view" | "create" | "update" | "delete";

export function authorizeDepartment(action: DepartmentAction): void {
  void action;
}

/**
 * Guard deny-by-default untuk aksi yang belum punya policy: dipakai modul baru
 * supaya lupa menulis authorization menjadi error, bukan lubang terbuka.
 */
export function denyByDefault(reason = "Authorization policy not implemented for this action"): never {
  throw new ApiError("FORBIDDEN", 403, reason);
}
