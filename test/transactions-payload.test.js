import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { copilotRequestSchema } from '../lib/contracts.js';
import { validRequest } from './fixtures.js';

const html = fs.readFileSync(new URL('../app/src/main/assets/index.html', import.meta.url), 'utf8');
const lines = html.split('\n');
const pick = start => {
  const line = lines.find(item => item.startsWith(start));
  assert.ok(line, `${start} not found in index.html`);
  return line;
};

function load(txs) {
  const context = { txs, esc: v => String(v), INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) };
  vm.createContext(context);
  vm.runInContext([
    pick('function merchantKey('),
    pick('function payeeName('),
    pick('function tidyName('),
    pick('function transactionPayload('),
    pick('function payeeStats('),
    pick('function topMerchantAnswer('),
    pick('function payeeCategoryPayload('),
    pick('function payeeBreakdown('),
    pick('function cleanLlm('),
    pick('function llmSafe('),
    pick('function topCategoryAnswer('),
  ].join('\n'), context);
  return context;
}

const plain = value => JSON.parse(JSON.stringify(value));

const vadapav = [
  { date: '2026-10-05', description: 'UPI/DR/412345678901/RENUKA/YESB/9876543210@ybl/Payment from PhonePe', amount: -40, category: 'Other' },
  { date: '2026-10-07', description: 'UPI-RENUKA-renuka@okaxis-HDFC0001234-427777777777-UPI', amount: -60, category: 'Other' },
  { date: '2026-10-11', description: 'UPI/DR/412345678999/Renuka/YESB/9876543210@ybl', amount: -20, category: 'Other' },
  { date: '2026-10-12', description: 'UPI/DR/412345679000/ZOMATO/YESB/zomato@icici', amount: -300, category: 'Dining' },
  { date: '2026-09-30', description: 'UPI/DR/412345679001/D MART/YESB/dmart@ybl', amount: -90, category: 'Groceries' },
  { date: '2026-10-06', description: 'Salary October', amount: 50000, category: 'Income' },
];

test('reads the payee name from common Indian bank description formats', () => {
  const { payeeName } = load([]);
  assert.equal(payeeName('UPI/DR/412345678901/RENUKA/YESB/9876543210@ybl/Payment from PhonePe'), 'RENUKA');
  assert.equal(payeeName('UPI-SINHGAD PRINTING PRESS-sinhgad@okaxis-HDFC0001234-427777777777-UPI'), 'SINHGAD PRINTING PRESS');
  assert.equal(payeeName('Paid to Renuka Vadapav'), 'Renuka Vadapav');
  assert.equal(payeeName('POS 4567XXXXXXXX1234 D MART PUNE'), 'D MART PUNE');
  assert.equal(payeeName('Salary October'), 'Salary October');
});

test('tidyName only rewrites all-capital names', () => {
  const { tidyName } = load([]);
  assert.equal(tidyName('RENUKA'), 'Renuka');
  assert.equal(tidyName('SINHGAD PRINTING PRESS'), 'Sinhgad Printing Press');
  assert.equal(tidyName('Renuka Vadapav'), 'Renuka Vadapav');
});

test('returns nothing when there are no usable transactions', () => {
  assert.deepEqual(plain(load([]).transactionPayload()), {});
});

test('daily, weekly, and monthly totals are exact and weeks start on Monday', () => {
  const { transactions } = plain(load(vadapav).transactionPayload());
  assert.equal(transactions.totalCount, 6);
  assert.equal(transactions.includedRows, 6);
  assert.equal(transactions.windowStart, '2026-09-30');
  assert.equal(transactions.windowEnd, '2026-10-12');

  const daily = Object.fromEntries(transactions.periods.daily.map(item => [item.period, item]));
  assert.equal(daily['2026-10-07'].spent, 60);
  assert.equal(daily['2026-10-06'].received, 50000);
  assert.equal(daily['2026-10-07'].topPayees[0].name, 'RENUKA');

  const weekly = Object.fromEntries(transactions.periods.weekly.map(item => [item.period, item]));
  assert.equal(weekly['2026-10-05'].spent, 120);
  assert.equal(weekly['2026-10-05'].count, 4);
  assert.equal(weekly['2026-10-12'].spent, 300);
  assert.equal(weekly['2026-09-28'].spent, 90);

  const monthly = Object.fromEntries(transactions.periods.monthly.map(item => [item.period, item]));
  assert.equal(monthly['2026-10'].spent, 420);
  assert.equal(monthly['2026-10'].received, 50000);
  assert.equal(monthly['2026-10'].topPayees[0].name, 'ZOMATO');
  assert.equal(monthly['2026-09'].spent, 90);
});

test('payees are grouped across UPI formats and ranked by total', () => {
  const { transactions } = plain(load(vadapav).transactionPayload());
  const renuka = transactions.merchants.find(item => /renuka/i.test(item.name));
  assert.equal(renuka.total, 120);
  assert.equal(renuka.count, 3);
  assert.equal(renuka.firstDate, '2026-10-05');
  assert.equal(renuka.lastDate, '2026-10-11');
  assert.equal(transactions.merchants[0].name, 'ZOMATO');
});

test('"what am I spending the most in" answers with the payee name', () => {
  const { topMerchantAnswer } = load(vadapav);
  const answer = topMerchantAnswer('What am I spending the most in');
  assert.match(answer, /^You spend the most at Renuka: ₹120 over 3 visits/);
  assert.match(answer, /left out one-time or rare payments, such as Zomato \(₹300\)/);
});

test('"where do I spend the least" answers with the smallest payee, not a category', () => {
  const { topMerchantAnswer } = load(vadapav);
  const answer = topMerchantAnswer('Where do I spend the least?');
  assert.match(answer, /^You spend the least at /);
  assert.doesNotMatch(answer, /Other/);
});

test('categories are built from payee names, never "Other"', () => {
  const { categories } = plain(load(vadapav).payeeCategoryPayload());
  assert.equal(categories[0].name, 'Zomato');
  assert.ok(categories.some(c => c.name === 'Renuka'));
  assert.ok(!categories.some(c => /other/i.test(c.name)));
  assert.equal(categories.reduce((a, c) => a + c.sharePercent, 0) >= 99, true);
  assert.deepEqual(plain(load([]).payeeCategoryPayload()), {});
});

test('Home and Insights breakdown ranks payees, not fixed categories', () => {
  const ctx = load(vadapav);
  const { list } = plain(ctx.payeeBreakdown());
  assert.equal(list[0].name, 'Renuka');
  assert.equal(list[0].visits, 3);
  assert.equal(list.find(x => x.name === 'Renuka').total, 120);
  assert.ok(!list.some(x => x.name === 'Zomato'));
  assert.ok(!list.some(x => /other/i.test(x.name)));
  assert.match(ctx.topCategoryAnswer(), /^You spend the most at Renuka/);
});

test('local AI output is cleaned and checked against the verified facts', () => {
  const { cleanLlm, llmSafe } = load([]);
  assert.equal(cleanLlm('You spend the most at Renuka.<|im_end|>\n<|im_start|>user'), 'You spend the most at Renuka.');
  const facts = 'You spend the most at Renuka: ₹1,200 across 3 payments.';
  assert.equal(llmSafe('Renuka is your top shop at ₹1,200.', facts, 'where do I spend most'), true);
  assert.equal(llmSafe('Renuka is your top shop at ₹9,999.', facts, 'where do I spend most'), false);
  assert.equal(llmSafe('', facts, 'q'), false);
});

const row = (date, name, amount) => ({ date, description: `UPI/DR/412345678901/${name}/YESB/9876543210@ybl`, amount, category: 'Other' });

test('a shop visited once in two months is not counted, a monthly one is', () => {
  const data = [
    row('2026-08-01', 'RENT HOUSE', -9000), row('2026-09-01', 'RENT HOUSE', -9000), row('2026-10-01', 'RENT HOUSE', -9000),
    row('2026-08-10', 'FEES COLLEGE', -50000),
    row('2026-08-02', 'TEA POINT', -20), row('2026-08-20', 'TEA POINT', -20), row('2026-09-15', 'TEA POINT', -20), row('2026-10-02', 'TEA POINT', -20),
  ];
  const ctx = load(data);
  const st = plain(ctx.payeeStats(data));
  assert.deepEqual(st.regular.map(e => e.name).sort(), ['Rent House', 'Tea Point'].sort().map(n => n.toUpperCase() === n ? n : st.regular.find(e => e.name.toLowerCase() === n.toLowerCase()).name));
  assert.ok(!st.regular.some(e => /fees/i.test(e.name)));
  assert.match(ctx.topMerchantAnswer('Where do I spend the most?'), /^You spend the most at Rent House: ₹27,000 over 3 visits/);
});

test('several payments on one day count as one visit', () => {
  const data = [row('2026-10-05', 'CHAI', -10), row('2026-10-05', 'CHAI', -10), row('2026-10-06', 'CHAI', -10), row('2026-10-07', 'ONCE', -500)];
  const st = plain(load(data).payeeStats(data));
  const chai = st.all.find(e => /chai/i.test(e.name));
  assert.equal(chai.count, 3);
  assert.equal(chai.visits, 2);
  assert.ok(st.regular.some(e => /chai/i.test(e.name)));
  assert.ok(!st.regular.some(e => /once/i.test(e.name)));
});

test('when nobody has repeat visits, every payee is counted and the answer says so', () => {
  const data = [row('2026-10-05', 'AAA', -500), row('2026-10-06', 'BBB', -100)];
  const answer = load(data).topMerchantAnswer('Where do I spend the most?');
  assert.match(answer, /^You spend the most at Aaa: ₹500 over 1 visit/);
  assert.match(answer, /No shop has repeat visits yet/);
});

test('period and category questions are left to the model', () => {
  const { topMerchantAnswer } = load(vadapav);
  assert.equal(topMerchantAnswer('What did I spend the most on this week'), null);
  assert.equal(topMerchantAnswer('Which category do I spend the most on'), null);
  assert.equal(topMerchantAnswer('Top spending last month'), null);
  assert.equal(topMerchantAnswer('Hello'), null);
});

test('a large statement still fits the API schema and body limit', () => {
  const names = ['SINHGAD PRINTING PRESS', 'ZOMATO', 'D MART', 'IRCTC', 'METRO CARD', 'AMAZON PAY', 'RENUKA'];
  const rows = Array.from({ length: 5000 }, (_, i) => ({
    date: `2026-0${1 + (i % 9)}-${String(1 + (i % 27)).padStart(2, '0')}`,
    description: `UPI/DR/${400000000000 + i}/${names[i % names.length]} ${i % 40}/YESB/pay${i}@ybl/Payment from PhonePe`,
    amount: i % 13 === 0 ? 40000 : -(50 + (i * 37) % 900),
    category: 'Other',
  }));
  const { transactions } = plain(load(rows).transactionPayload());
  assert.equal(transactions.includedRows, 300);
  assert.equal(transactions.totalCount, 5000);
  const payload = validRequest();
  payload.financialContext.transactions = transactions;
  payload.conversation = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(1200) }));
  const parsed = copilotRequestSchema.safeParse(payload);
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3)));
  const size = JSON.stringify(payload).length;
  assert.ok(size < 256 * 1024, `payload is ${size} bytes`);
  console.log(`# large payload: ${(size / 1024).toFixed(1)} KiB`);
});

test('the schema rejects malformed transaction data', () => {
  const payload = validRequest();
  payload.financialContext.transactions = { today: 'today', windowStart: '2026-10-01', windowEnd: '2026-10-01', totalCount: 1, includedRows: 0, periods: { daily: [], weekly: [], monthly: [] }, merchants: [], recent: [] };
  assert.equal(copilotRequestSchema.safeParse(payload).success, false);
});
