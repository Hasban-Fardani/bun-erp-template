const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Accept ordinary web, email, telephone, fragment, and relative links; reject script/data URLs. */
export function isSafeLinkUrl(value: string): boolean {
  if (!value.trim() || containsControlCharacters(value)) return false;
  const url = value.trim();

  try {
    const parsed = new URL(url, "https://editor.invalid");
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
