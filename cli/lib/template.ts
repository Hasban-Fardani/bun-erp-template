/**
 * Tiny `{{name}}` substitution for the generator templates under `templates/generators/`.
 *
 * The replacer function is deliberate: a replacement string would expand `$&`/`$1` from the
 * substituted value, so a `$&` in a feature name or option must stay literal. An unknown
 * placeholder is a template bug, not an empty value.
 */
export function renderTemplate(source: string, values: Readonly<Record<string, string>>, label = "template"): string {
  return source.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`${label} has no value for {{${key}}}`);
    return value;
  });
}
