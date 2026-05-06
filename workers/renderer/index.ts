/**
 * Standalone renderer worker.
 *
 * NOTE: not the default deploy shape anymore. The Next.js web service
 * runs the same loop in-process via instrumentation.ts, and Railway's
 * 1:1 service↔volume model means a single Volume on the web service
 * is what actually works. This file stays as an alternative entrypoint
 * if/when render load justifies splitting it back out into its own
 * service (and an object store like R2 takes over from the Volume).
 */

import { runStandaloneLoop } from "../../lib/render/embedded";

if (require.main === module) {
  runStandaloneLoop().catch((err) => {
    console.error("[renderer] fatal:", err);
    process.exit(1);
  });
}
