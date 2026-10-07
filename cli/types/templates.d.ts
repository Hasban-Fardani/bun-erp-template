/** Generator templates are imported as text; Bun inlines them at build time, no runtime IO. */
declare module "*.tmpl" {
  const content: string;
  export default content;
}
