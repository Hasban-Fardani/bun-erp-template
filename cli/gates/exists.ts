/**
 * Bun.file(path).exists() is false for directories, so gates that scan an app tree need stat() to
 * tell "the app is not installed" from "the app is empty". Mobile is a catalog app: the default
 * template ships server + web only, and every gate that touches apps/mobile must skip cleanly
 * instead of throwing ENOENT on the absent directory.
 */
export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
  }
}
