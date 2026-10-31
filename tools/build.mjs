// Build: bundle the TypeScript engine and put it into the page, producing
//   index.html          the hosted page (GitHub Pages)
//   dist/preview.html   the same page content for the claude.ai preview
//   dist/core.mjs       the engine as an ES module, for unit tests
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(ROOT, "src/core/index.ts");
mkdirSync(path.join(ROOT, "dist"), { recursive: true });

const iife = await build({ entryPoints: [entry], bundle: true, format: "iife", globalName: "CommuteCore", target: "es2019", write: false, legalComments: "none" });
await build({ entryPoints: [entry], bundle: true, format: "esm", target: "es2020", outfile: path.join(ROOT, "dist/core.mjs"), legalComments: "none" });
const core = iife.outputFiles[0].text;

const stamp = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }).replace(",", "") + " UTC";
let page = readFileSync(path.join(ROOT, "src/page.html"), "utf8").replace("__BUILD__", stamp);
if (!page.includes('/*__SIGNAL_STYLES__*/') || !page.includes('/*__PRESENTATION_BLOCKS__*/') || !page.includes('/*__FOLLOW_TRANSPORT__*/') || !page.includes('/*__JOURNEY_UI__*/')) throw new Error('Missing journey presentation build insertion point');
page = page.replace('/*__SIGNAL_STYLES__*/', readFileSync(path.join(ROOT, 'src/signal.css'), 'utf8'))
  .replace('/*__PRESENTATION_BLOCKS__*/', readFileSync(path.join(ROOT, 'src/presentation-blocks.js'), 'utf8'))
  .replace('/*__FOLLOW_TRANSPORT__*/', readFileSync(path.join(ROOT, 'src/follow-transport.js'), 'utf8'))
  .replace('/*__JOURNEY_UI__*/', ['journey-progress.js', 'journey-ui.js'].map(file => readFileSync(path.join(ROOT, 'src', file), 'utf8')).join('\n'));
// Embed the development simulator from its own source module and panel asset.
// The web app is a static single-file GitHub Pages deployment.
const simController = ["scenarios.js", "gps.js", "catalog.js", "verification.js", "report.js", "controller.js", "session.js", "journey-ui.js"].map(file => readFileSync(path.join(ROOT, "src/simulator", file), "utf8")).join("\n");
const simFeeds = readFileSync(path.join(ROOT, "src/simulator/feeds.js"), "utf8");
const simClock = readFileSync(path.join(ROOT, "src/simulator/clock.js"), "utf8");
const simPanel = readFileSync(path.join(ROOT, "src/simulator/panel.html"), "utf8");
if (!page.includes("/*__SIMULATION_CLOCK__*/") || !page.includes("/*__SIMULATED_FEEDS__*/") || !page.includes("/*__SIMULATOR_CONTROLLER__*/") || !page.includes("<!--__SIMULATOR_PANEL__-->")) throw new Error("Missing simulator build insertion point");
page = page.replace("/*__SIMULATION_CLOCK__*/", simClock).replace("/*__SIMULATED_FEEDS__*/", simFeeds).replace("/*__SIMULATOR_CONTROLLER__*/", simController).replace("<!--__SIMULATOR_PANEL__-->", simPanel);
// The engine goes in its own script, just before the page's script.
const at = page.indexOf("<script>");
if (at < 0) throw new Error("src/page.html has no <script>");
page = page.slice(0, at) + `<script>/* engine (src/core) */\n${core}</script>\n` + page.slice(at);

writeFileSync(path.join(ROOT, "dist/preview.html"), page);

const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#17201B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Commute">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
`;
// Title, metas, fonts and styles go in <head>; everything after the first </style> goes in <body>.
const split = page.indexOf("</style>\n") + "</style>\n".length;
writeFileSync(path.join(ROOT, "index.html"), head + page.slice(0, split) + "</head>\n<body>\n" + page.slice(split) + "\n</body>\n</html>\n");
console.log(`built ${stamp}: engine ${(core.length / 1024).toFixed(1)} KB`);
