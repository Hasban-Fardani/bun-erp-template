/** Build-time environment read once; the API origin must have a single definition per app. */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
