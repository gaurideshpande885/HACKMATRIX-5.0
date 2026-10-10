import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../app/src/main/assets/index.html', import.meta.url), 'utf8');
const reliability = fs.readFileSync(new URL('../app/src/main/assets/forecast-reliability.js', import.meta.url), 'utf8');
const planner = fs.readFileSync(new URL('../app/src/main/assets/financial-action-planner.js', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

if (!scripts.length) throw new Error('Embedded application scripts were not found.');
scripts.forEach((match, index) => new vm.Script(match[1], { filename: `app/src/main/assets/index.html#script-${index + 1}` }));
new vm.Script(reliability, { filename: 'app/src/main/assets/forecast-reliability.js' });
new vm.Script(planner, { filename: 'app/src/main/assets/financial-action-planner.js' });
if (!html.includes('src="forecast-reliability.js"')) throw new Error('Forecast reliability module is not loaded by the WebView.');
if (!html.includes('src="financial-action-planner.js"')) throw new Error('Financial action planner module is not loaded by the WebView.');

const forbidden = [
  'openrouter.ai/api',
  "localStorage.setItem('orKey'",
  'Authorization\':\'Bearer',
];

for (const value of forbidden) {
  if (html.includes(value)) throw new Error(`Forbidden client-side AI credential path remains: ${value}`);
}

for (const required of ['buildCopilotPayload', '/api/v1/copilot', 'formatCopilotResponse', 'Managed Copilot service']) {
  if (!html.includes(required)) throw new Error(`Required managed-Copilot integration is missing: ${required}`);
}

for (const required of ['Stable glass system', 'scheduleDrawCharts', '#sheetOverlay:not(.hidden)', 'prefers-reduced-motion:reduce', 'sheetEnter']) {
  if (!html.includes(required)) throw new Error(`Required smooth-UI optimization is missing: ${required}`);
}
if (html.includes('backdrop-filter:blur(22px)')) throw new Error('Expensive per-card backdrop blur was reintroduced.');
for (const forbiddenUiPattern of ['content-visibility:auto', 'contain-intrinsic-size', '#sheetOverlay.hidden{display:grid!important}', 'navbtn:after']) {
  if (html.includes(forbiddenUiPattern)) throw new Error(`Unstable WebView UI pattern was reintroduced: ${forbiddenUiPattern}`);
}

console.log('Validated embedded app syntax and managed-Copilot boundary.');
