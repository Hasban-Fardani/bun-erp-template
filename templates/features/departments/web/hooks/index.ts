import { useQuery } from "@tanstack/react-query";
import { departmentsListQuery } from "../api/queries.ts";

export function useDepartments(query: string) {
  return useQuery(departmentsListQuery(query));
}
