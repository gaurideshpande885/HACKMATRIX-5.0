import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../app/src/main/assets/index.html', import.meta.url), 'utf8');
const match = html.match(/<script>\s*const INR=([\s\S]*?)<\/script>/);
if (!match) throw new Error('FIN application script was not found.');

const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.99;
const source = `const INR=${match[1]}`
  .replace(/if\(typeof window\.addEventListener[\s\S]*$/, '')
  + `\n;globalThis.__learningTest={run(actions,m){learningPolicy=defaultLearningPolicy();learningDecisionCache=null;model=m;return rankRecommendations(actions,m)},display(){ensureDecisionDisplayed()},feedback(action,status){recordRecommendationFeedback(action,status)},policy(){return learningPolicy},decision(){return lastRecommendationDecision}};`;

const context = vm.createContext({
  console,
  localStorage,
  sessionStorage: localStorage,
  Intl,
  Date,
  Math: deterministicMath,
  URLSearchParams,
  crypto: { randomUUID: () => 'test-id' },
  window: {},
  location: { protocol: 'file:', hostname: '', search: '', origin: 'null' },
  setTimeout: () => 0,
  clearTimeout: () => {},
});
let compiled;
try {
  compiled = new vm.Script(source, { filename: 'app/src/main/assets/index.html' });
} catch (error) {
  console.error(source.split(/\r?\n/).slice(31, 38).map((line, index) => `${index + 32}: ${line}`).join('\n'));
  throw error;
}
compiled.runInContext(context);

const model = {
  analysisVersion: '2.0', score: 70, safe: 5000, income90: 60000, expense90: 47000,
  debtPressure: 35, runway: 1.5, dataQuality: { quality: 82 },
  prediction: { gapProbability: 24 },
  categoryMonthly: { Dining: 3000, Shopping: 2500, Subscriptions: 900, Other: 600 },
  financialHistory: { totalDebt: 78000 },
};
const actions = ['buffer', 'spend', 'debt', 'bills'].map((id, index) => ({ id, priority: index ? 'MEDIUM' : 'HIGH' }));
const ranked = context.__learningTest.run(actions, model);
if (ranked.length !== 4 || !actions.some(action => action.id === ranked[0].id)) throw new Error('LinUCB did not return the safe action set.');
context.__learningTest.display();
context.__learningTest.feedback(ranked[0].id, 'Accepted');
const policy = context.__learningTest.policy();
if (policy.interactions !== 1 || policy.arms[ranked[0].id].n !== 1) throw new Error('Accepted feedback did not update the selected arm.');
const events = JSON.parse(localStorage.getItem('finLearningEvents'));
if (events.length !== 2 || events.some(event => 'transactions' in event.context || 'identity' in event.context)) throw new Error('Learning events violated the bounded context contract.');

console.log('Validated embedded LinUCB ranking, propensity logging, and bounded feedback update.');
