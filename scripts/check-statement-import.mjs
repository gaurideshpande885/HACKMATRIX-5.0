import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../app/src/main/assets/index.html', import.meta.url), 'utf8');
const match = html.match(/<script>\s*const INR=([\s\S]*?)<\/script>/);
if (!match) throw new Error('FIN application script was not found.');

const source = `const INR=${match[1]}`
  .replace(/if\(typeof window\.addEventListener[\s\S]*$/, '')
  + '\n;globalThis.__statementTest={parse:parseFinancialStatementText,parsePayload:parseFinancialStatementPayload,statementContext,buildStatementPeriods,summarizeStatement};';
const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
const context = vm.createContext({
  console, localStorage, sessionStorage: localStorage, Intl, Date, Math, URLSearchParams,
  crypto: { randomUUID: () => 'test-id' }, window: {},
  location: { protocol: 'file:', hostname: '', search: '', origin: 'null' },
  setTimeout: () => 0, clearTimeout: () => {},
});
new vm.Script(source, { filename: 'app/src/main/assets/index.html' }).runInContext(context);

const columnStatement = `
Account Statement
Date Narration Debit Credit Balance
01/09/2026 ACME SALARY 0.00 58,000.00 1,00,000.00
02/09/2026 UPI FRESH MART 1,250.00 0.00 98,750.00
03/09/2026 EDUCATION LOAN EMI 6,200.00 0.00 92,550.00
04/09/2026 REFUND CREDIT 0.00 500.00 93,050.00
`;
const parsedColumns = context.__statementTest.parse(columnStatement);
if (parsedColumns.transactions.length !== 4) throw new Error('Debit/credit column statement did not yield four transactions.');
if (parsedColumns.transactions.filter(row => row.amount > 0).length !== 2) throw new Error('Credit columns were not interpreted as income.');
if (!parsedColumns.transactions.some(row => row.amount === -6200 && row.category === 'Debt')) throw new Error('Debt payment was not normalized or categorized.');

const balanceStatement = `
Transaction History
Date Description Amount Balance
01-09-2026 Monthly salary 58,000.00 1,00,000.00
02-09-2026 Grocery market 1,250.00 98,750.00
03-09-2026 Metro recharge 500.00 98,250.00
04-09-2026 Cash refund 750.00 99,000.00
`;
const parsedBalances = context.__statementTest.parse(balanceStatement);
if (parsedBalances.transactions.length !== 4) throw new Error('Balance-delta statement did not yield four transactions.');
if (!parsedBalances.transactions.some(row => row.description.includes('Metro') && row.amount === -500)) throw new Error('Balance-delta debit inference failed.');
if (!parsedBalances.transactions.some(row => row.description.includes('refund') && row.amount === 750)) throw new Error('Balance-delta credit inference failed.');
if (parsedBalances.confidence < 70) throw new Error('Structured statement confidence was unexpectedly low.');

const gpayStatement = `
Transaction statement period 01 April 2026 - 30 September 2026
04Apr,2026
PaidtoExampleCafe ₹123.45
11:59AM
UPITransactionID:111111111111
PaidbyStateBankofIndia6711
10Apr,2026
ReceivedfromGooglePayrewards ₹1
12:36PM
UPITransactionID:222222222222
PaidtoStateBankofIndia6711
12Apr,2026
ReceivedfromFriend ₹30
08:29AM
UPITransactionID:333333333333
PaidtoStateBankofIndia6711
`;
const parsedGpay = context.__statementTest.parse(gpayStatement);
if (parsedGpay.transactions.length !== 3 || parsedGpay.sourceType !== 'gpay') throw new Error('Google Pay statement format was not recognized.');
if (!parsedGpay.transactions.some(row => row.amount === -123.45 && row.category === 'Dining')) throw new Error('Google Pay outgoing payment was not categorized.');
if (parsedGpay.transactions.filter(row => row.amount > 0 && row.category === 'Transfers').length !== 2) throw new Error('Google Pay incoming peer transfers were incorrectly treated as earned income.');

const gpayPdfboxVariant = `
Transactionstatement
Date&time Transactiondetails Amount
04Apr,2026 PaidtoExampleCafe 123.45
11:59AM UPITransactionID:444444444444
PaidbyStateBankofIndia6711
10Apr,2026 ReceivedfromFriend 30
12:36PM UPITransactionID:555555555555
PaidtoStateBankofIndia6711
`;
const parsedPdfboxVariant = context.__statementTest.parse(gpayPdfboxVariant);
if (parsedPdfboxVariant.transactions.length !== 2 || parsedPdfboxVariant.transactions[0].category !== 'Transfers') {
  throw new Error('Google Pay PDFBox-style text without a preserved rupee glyph was not recognized.');
}

const gpaySpacedVariant = `
Transaction statement
04 Apr, 2026 Paid to Example Store ₹ 250.50
09:15 AM UPI Transaction ID : 666 666 666 666
Paid by State Bank of India
05 Apr, 2026 Received from Example Friend ₹ 100
10:20 AM UPI Transaction ID : 777 777 777 777
Paid to State Bank of India
`;
const parsedSpaced = context.__statementTest.parse(gpaySpacedVariant);
if (parsedSpaced.transactions.length !== 2 || !parsedSpaced.transactions.some(row => row.amount === -250.5)) {
  throw new Error('Whitespace-flexible Google Pay extraction was not converted into structured rows.');
}

const parsedAlternate = context.__statementTest.parsePayload({
  text: 'Transaction statement UPI Transaction ID: no usable rows',
  alternateText: gpaySpacedVariant,
});
if (parsedAlternate.transactions.length !== 2 || parsedAlternate.extractionMode !== 'content-order') {
  throw new Error('Alternate Android PDF extraction was not selected after the primary extraction failed.');
}

const dashboardRows = [
  { id: 'apr-out', date: '2026-04-04', description: 'April spend', amount: -100, category: 'Other' },
  { id: 'sep-in', date: '2026-09-30', description: 'September transfer', amount: 300, category: 'Transfers' },
  { id: 'sep-out', date: '2026-09-15', description: 'September spend', amount: -125, category: 'Groceries' },
];
localStorage.setItem('finLastImport', JSON.stringify({ source: 'pdf-import', count: dashboardRows.length }));
const dashboardContext = context.__statementTest.statementContext(dashboardRows);
const dashboardPeriods = context.__statementTest.buildStatementPeriods(dashboardRows, dashboardContext.latest);
const dashboardSummary = context.__statementTest.summarizeStatement(dashboardRows, dashboardContext);
if (!dashboardContext.imported || dashboardContext.to !== '2026-09-30') throw new Error('Dashboard did not anchor to the latest imported transaction.');
if (dashboardPeriods[0].period !== '2026-04' || dashboardPeriods.at(-1).period !== '2026-09') throw new Error('Dashboard six-month period did not follow the statement timeline.');
if (dashboardPeriods.at(-1).inflow !== 300 || dashboardPeriods.at(-1).expense !== 125) throw new Error('Dashboard monthly incoming or spending totals are incorrect.');
if (dashboardSummary.incoming !== 300 || dashboardSummary.outgoing !== 225 || dashboardSummary.net !== 75) throw new Error('Dashboard financial-position totals are incorrect.');

if (process.argv[2]) {
  const input = process.argv[2] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(process.argv[2], 'utf8');
  const imported = context.__statementTest.parse(input);
  const summary = imported.transactions.reduce((result, row) => {
    result.count++;
    if (row.amount < 0) result.sent += -row.amount;
    else if (row.category === 'Transfers') result.transfersReceived += row.amount;
    else result.earnedIncome += row.amount;
    return result;
  }, { count: 0, sent: 0, transfersReceived: 0, earnedIncome: 0 });
  console.log(JSON.stringify({ sourceType: imported.sourceType || 'bank', from: imported.from, to: imported.to, ...summary }));
}

console.log('Validated PDF statement parsing, Google Pay transfers, debit/credit columns, balance inference, and categorization.');
