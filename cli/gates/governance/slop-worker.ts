import { checkSlop } from "./slop-validator.ts";

/**
 * Worker entry for the vendored governance slop validator (the one file under `governance/` that
 * is ours). The validator stays verbatim because upstream re-sync matters, so its sync IO runs on
 * this worker thread instead of blocking the gate's shared event loop. The message contract mirrors
 * `validator-cli.ts`: the first directory is checked, the rest are consumer roots for the
 * unused-export scan, and each finding prints as `RULE file:line detail`.
 */
self.onmessage = (event: MessageEvent<{ dirs: string[] }>) => {
  const [dir, ...consumers] = event.data.dirs;
  try {
    const findings = checkSlop(dir ?? ".", { consumers });
    self.postMessage({ findings: findings.map((f) => `${f.rule} ${f.file}:${f.line} ${f.detail}`) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
