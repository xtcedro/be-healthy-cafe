// The root package.json is `"type": "module"`, which would make the compiled
// dist-electron/*.js files load as ES modules. Electron's main process and its
// sandboxed preload need CommonJS, so drop a package.json marker that scopes the
// compiled output back to CommonJS.
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist-electron", { recursive: true });
writeFileSync("dist-electron/package.json", JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
console.log("wrote dist-electron/package.json (type: commonjs)");
