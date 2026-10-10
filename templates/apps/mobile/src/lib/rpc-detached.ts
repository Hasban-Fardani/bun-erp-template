/**
 * Detached mobile shell (docs/api-contract.md, detached mode): the server app is not installed, so there is no typed RPC contract.
 * `bun loom init --apps server,mobile --yes` re-fits the real `hc<AppType>` client and removes the
 * detached marker. Re-fit marker: detached-shell.
 */
export const rpc = {};
