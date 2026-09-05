// Cross-platform launcher for the offline demo (`npm run demo`).
//
// Setting env vars inline (`DEMO_MODE=1 node server/index.js`) does not work in
// cmd.exe / PowerShell, and this project is developed on Windows — so the flags
// are set here and the normal server entry point is imported unchanged.
process.env.DEMO_MODE = process.env.DEMO_MODE || "1";
// A demo must never reach the network: force the offline web_search mock even
// if a .env in the working copy points at a real provider.
process.env.WEB_SEARCH_PROVIDER = "mock";

await import("../server/index.js");
