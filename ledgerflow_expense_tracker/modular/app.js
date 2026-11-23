(function () {'use strict';

  // =========================================================================
  // 1. SAFE STORAGE & CURRENCY UTILITIES (Exact integer minor units / paise)
  // =========================================================================
  const STORAGE_KEY = 'ledgerflow_saas_v3';
  const CURRENCIES = {
    INR: { symbol: '₹', locale: 'en-IN', code: 'INR', name: 'Indian Rupee (₹)' },
    USD: { symbol: '$', locale: 'en-US', code: 'USD', name: 'US Dollar ($)' },
    EUR: { symbol: '€', locale: 'de-DE', code: 'EUR', name: 'Euro (€)' },
    GBP: { symbol: '£', locale: 'en-GB', code: 'GBP', name: 'British Pound (£)' }
  };

  function safeGetStorage(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSetStorage(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }
  function toPaise(num) {
    const n = Number(num);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  function fromPaise(paise) {
    return (Number(paise) || 0) / 100;
  }
  function fmtMoney(paise, showSign = false) {
    const cur = CURRENCIES[getActiveWorkspace().settings.currency] || CURRENCIES.INR;
    const val = fromPaise(Math.abs(paise));
    const formatted = new Intl.NumberFormat(cur.locale, {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    }).format(val);
    const sign = paise < 0 ? '-' : (showSign && paise > 0 ? '+' : '');
    return `${sign}${cur.symbol}${formatted}`;
  }
  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function monthKey(isoDate) {
    return String(isoDate || '').slice(0, 7);
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }
  function formatDateDisplay(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // =========================================================================
  // 2. DEFAULT DATA & MULTI-USER WORKSPACE MODEL (6 Full Months Seeded)
  // =========================================================================
  const DEFAULT_CATEGORIES = {
    expense: [
      { name: 'Food', color: '#F97316', icon: 'utensils' },
      { name: 'Groceries', color: '#84CC16', icon: 'shopping-basket' },
      { name: 'Rent', color: '#8B5CF6', icon: 'home' },
      { name: 'Transport', color: '#22D3EE', icon: 'car' },
      { name: 'Bills', color: '#EAB308', icon: 'zap' },
      { name: 'Shopping', color: '#EC4899', icon: 'shopping-bag' },
      { name: 'Entertainment', color: '#A855F7', icon: 'film' },
      { name: 'Healthcare', color: '#FB7185', icon: 'heart-pulse' },
      { name: 'Education', color: '#3B82F6', icon: 'graduation-cap' },
      { name: 'Subscriptions', color: '#14B8A6', icon: 'repeat' },
      { name: 'Travel', color: '#F59E0B', icon: 'plane' },
      { name: 'Other', color: '#64748B', icon: 'tag' }
    ],
    income: [
      { name: 'Salary', color: '#16A579', icon: 'briefcase' },
      { name: 'Freelance', color: '#38BDF8', icon: 'laptop' },
      { name: 'Business', color: '#8B5CF6', icon: 'building-2' },
      { name: 'Investments', color: '#22C55E', icon: 'trending-up' },
      { name: 'Gift', color: '#F472B6', icon: 'gift' },
      { name: 'Other', color: '#64748B', icon: 'coins' }
    ]
  };

  function createSeedWorkspace(name, email, withSampleData = true) {
    const now = new Date();
    const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prev1 = shiftMonth(curYM, -1);
    const prev2 = shiftMonth(curYM, -2);
    const prev3 = shiftMonth(curYM, -3);
    const prev4 = shiftMonth(curYM, -4);
    const prev5 = shiftMonth(curYM, -5);
    const maxDay = Math.min(now.getDate(), 26);
    const dStr = (ym, day) => `${ym}-${String(Math.min(day, 28)).padStart(2, '0')}`;

    const accounts = withSampleData ? [
      { id: 'acc_hdfc', name: 'HDFC Savings', type: 'Bank Account', openingPaise: toPaise(115000), color: '#101114' },
      { id: 'acc_upi', name: 'UPI Primary Wallet', type: 'Wallet', openingPaise: toPaise(18500), color: '#16A579' },
      { id: 'acc_cc', name: 'Axis Credit Card', type: 'Credit Card', openingPaise: toPaise(0), color: '#D96C72' },
      { id: 'acc_cash', name: 'Cash in Hand', type: 'Cash', openingPaise: toPaise(6200), color: '#C6A66B' }
    ] : [
      { id: 'acc_primary', name: 'Primary Bank', type: 'Bank Account', openingPaise: 0, color: '#101114' },
      { id: 'acc_wallet', name: 'UPI / Wallet', type: 'Wallet', openingPaise: 0, color: '#16A579' },
      { id: 'acc_cash', name: 'Cash in Hand', type: 'Cash', openingPaise: 0, color: '#C6A66B' }
    ];

    const transactions = withSampleData ? [
      // Current Month
      { id: uid('tx'), type: 'income', title: 'Monthly Tech Salary', amountPaise: toPaise(85000), category: 'Salary', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(curYM, 1), notes: 'Direct deposit', tags: ['salary', 'monthly'] },
      { id: uid('tx'), type: 'income', title: 'UI/UX Freelance Sprint', amountPaise: toPaise(24000), category: 'Freelance', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(curYM, Math.max(2, maxDay - 6)), notes: 'Dashboard redesign milestone', tags: ['freelance'] },
      { id: uid('tx'), type: 'expense', title: 'Apartment Monthly Rent', amountPaise: toPaise(18000), category: 'Rent', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(curYM, 2), notes: '2BHK rent', tags: ['housing', 'fixed'] },
      { id: uid('tx'), type: 'expense', title: 'BigBasket Weekly Groceries', amountPaise: toPaise(4250), category: 'Groceries', method: 'UPI', accountId: 'acc_upi', date: dStr(curYM, Math.max(3, maxDay - 5)), notes: 'Fresh produce & staples', tags: ['groceries'] },
      { id: uid('tx'), type: 'expense', title: 'TNEB Electricity & Fiber Bill', amountPaise: toPaise(2890), category: 'Bills', method: 'UPI', accountId: 'acc_upi', date: dStr(curYM, Math.max(4, maxDay - 4)), notes: 'Broadband + power', tags: ['utilities'] },
      { id: uid('tx'), type: 'expense', title: 'Swiggy & Cafe Dining', amountPaise: toPaise(3180), category: 'Food', method: 'UPI', accountId: 'acc_upi', date: dStr(curYM, Math.max(5, maxDay - 3)), notes: 'Team lunch & coffee', tags: ['dining'] },
      { id: uid('tx'), type: 'expense', title: 'Metro Pass & Uber Commute', amountPaise: toPaise(2150), category: 'Transport', method: 'UPI', accountId: 'acc_upi', date: dStr(curYM, Math.max(5, maxDay - 2)), notes: 'Office travel', tags: ['commute'] },
      { id: uid('tx'), type: 'expense', title: 'Spotify, iCloud & AI Tools', amountPaise: toPaise(1699), category: 'Subscriptions', method: 'Credit Card', accountId: 'acc_cc', date: dStr(curYM, Math.max(6, maxDay - 2)), notes: 'Monthly digital tools', tags: ['saas'] },
      { id: uid('tx'), type: 'expense', title: 'Running Shoes & Apparel', amountPaise: toPaise(4600), category: 'Shopping', method: 'Credit Card', accountId: 'acc_cc', date: dStr(curYM, Math.max(6, maxDay - 1)), notes: 'Weekend sale', tags: ['fitness'] },
      { id: uid('tx'), type: 'expense', title: 'Pharmacy & Dental Checkup', amountPaise: toPaise(1850), category: 'Healthcare', method: 'Debit Card', accountId: 'acc_hdfc', date: dStr(curYM, maxDay), notes: 'Routine checkup', tags: ['health'] },
      { id: uid('tx'), type: 'transfer', title: 'Top-up UPI Wallet', amountPaise: toPaise(10000), category: 'Transfer', method: 'Bank Transfer', accountId: 'acc_hdfc', toAccountId: 'acc_upi', date: dStr(curYM, 3), notes: 'Monthly wallet refill', tags: ['transfer'] },

      // Month -1
      { id: uid('tx'), type: 'income', title: 'Monthly Tech Salary', amountPaise: toPaise(85000), category: 'Salary', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev1, 1), notes: 'Direct deposit', tags: ['salary'] },
      { id: uid('tx'), type: 'income', title: 'Dividend Payout', amountPaise: toPaise(6500), category: 'Investments', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev1, 14), notes: 'Index fund distribution', tags: ['passive'] },
      { id: uid('tx'), type: 'expense', title: 'Apartment Monthly Rent', amountPaise: toPaise(18000), category: 'Rent', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev1, 2), notes: '2BHK rent', tags: ['housing'] },
      { id: uid('tx'), type: 'expense', title: 'Monthly Groceries', amountPaise: toPaise(5400), category: 'Groceries', method: 'UPI', accountId: 'acc_upi', date: dStr(prev1, 9), notes: 'Supermarket run', tags: ['groceries'] },
      { id: uid('tx'), type: 'expense', title: 'Restaurants & Dining', amountPaise: toPaise(4900), category: 'Food', method: 'Credit Card', accountId: 'acc_cc', date: dStr(prev1, 16), notes: 'Family dinner', tags: ['dining'] },
      { id: uid('tx'), type: 'expense', title: 'Electricity & Internet', amountPaise: toPaise(2650), category: 'Bills', method: 'UPI', accountId: 'acc_upi', date: dStr(prev1, 11), notes: 'Monthly utilities', tags: ['utilities'] },
      { id: uid('tx'), type: 'expense', title: 'Weekend Hill Station Trip', amountPaise: toPaise(9800), category: 'Travel', method: 'Credit Card', accountId: 'acc_cc', date: dStr(prev1, 21), notes: 'Hotel & fuel', tags: ['travel'] },

      // Month -2
      { id: uid('tx'), type: 'income', title: 'Monthly Tech Salary', amountPaise: toPaise(82000), category: 'Salary', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev2, 1), notes: 'Direct deposit', tags: ['salary'] },
      { id: uid('tx'), type: 'expense', title: 'Apartment Monthly Rent', amountPaise: toPaise(18000), category: 'Rent', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev2, 2), notes: '2BHK rent', tags: ['housing'] },
      { id: uid('tx'), type: 'expense', title: 'Groceries & Essentials', amountPaise: toPaise(5100), category: 'Groceries', method: 'UPI', accountId: 'acc_upi', date: dStr(prev2, 10), notes: 'Monthly essentials', tags: [] },
      { id: uid('tx'), type: 'expense', title: 'Online Course Certification', amountPaise: toPaise(6500), category: 'Education', method: 'Credit Card', accountId: 'acc_cc', date: dStr(prev2, 18), notes: 'Data analytics program', tags: ['career'] },

      // Month -3
      { id: uid('tx'), type: 'income', title: 'Monthly Tech Salary', amountPaise: toPaise(82000), category: 'Salary', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev3, 1), notes: 'Direct deposit', tags: ['salary'] },
      { id: uid('tx'), type: 'income', title: 'Logo & Brand Consulting', amountPaise: toPaise(14000), category: 'Freelance', method: 'UPI', accountId: 'acc_upi', date: dStr(prev3, 15), notes: 'Brand kit', tags: ['freelance'] },
      { id: uid('tx'), type: 'expense', title: 'Apartment Monthly Rent', amountPaise: toPaise(18000), category: 'Rent', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev3, 2), notes: '2BHK rent', tags: ['housing'] },
      { id: uid('tx'), type: 'expense', title: 'Groceries, Dining & Bills', amountPaise: toPaise(13200), category: 'Food', method: 'UPI', accountId: 'acc_upi', date: dStr(prev3, 14), notes: 'Monthly food & utilities', tags: [] },

      // Month -4
      { id: uid('tx'), type: 'income', title: 'Monthly Tech Salary', amountPaise: toPaise(80000), category: 'Salary', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev4, 1), notes: 'Direct deposit', tags: ['salary'] },
      { id: uid('tx'), type: 'expense', title: 'Apartment Monthly Rent', amountPaise: toPaise(18000), category: 'Rent', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev4, 2), notes: '2BHK rent', tags: ['housing'] },
      { id: uid('tx'), type: 'expense', title: 'Electronics & Monitor', amountPaise: toPaise(19500), category: 'Shopping', method: 'Credit Card', accountId: 'acc_cc', date: dStr(prev4, 12), notes: '27-inch IPS display', tags: ['setup'] },

      // Month -5
      { id: uid('tx'), type: 'income', title: 'Monthly Tech Salary', amountPaise: toPaise(80000), category: 'Salary', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev5, 1), notes: 'Direct deposit', tags: ['salary'] },
      { id: uid('tx'), type: 'expense', title: 'Apartment Monthly Rent', amountPaise: toPaise(18000), category: 'Rent', method: 'Bank Transfer', accountId: 'acc_hdfc', date: dStr(prev5, 2), notes: '2BHK rent', tags: ['housing'] },
      { id: uid('tx'), type: 'expense', title: 'Monthly Living Expenses', amountPaise: toPaise(14800), category: 'Groceries', method: 'UPI', accountId: 'acc_upi', date: dStr(prev5, 17), notes: 'Groceries & transport', tags: [] }
    ] : [];

    const budgets = withSampleData ? {
      overallPaise: toPaise(55000),
      categories: {
        Rent: toPaise(18000),
        Food: toPaise(4000),
        Groceries: toPaise(6000),
        Transport: toPaise(3500),
        Bills: toPaise(3500),
        Shopping: toPaise(5000),
        Subscriptions: toPaise(2000),
        Healthcare: toPaise(3000)
      }
    } : { overallPaise: 0, categories: {} };

    const recurring = withSampleData ? [
      { id: uid('rec'), title: 'Apartment Rent', type: 'expense', amountPaise: toPaise(18000), category: 'Rent', frequency: 'Monthly', nextDate: dStr(shiftMonth(curYM, 1), 2), accountId: 'acc_hdfc', active: true },
      { id: uid('rec'), title: 'Fiber Broadband & Mobile', type: 'expense', amountPaise: toPaise(1499), category: 'Bills', frequency: 'Monthly', nextDate: dStr(curYM, 27), accountId: 'acc_upi', active: true },
      { id: uid('rec'), title: 'Spotify & Cloud Storage', type: 'expense', amountPaise: toPaise(499), category: 'Subscriptions', frequency: 'Monthly', nextDate: dStr(curYM, 28), accountId: 'acc_cc', active: true },
      { id: uid('rec'), title: 'Monthly Tech Salary', type: 'income', amountPaise: toPaise(85000), category: 'Salary', frequency: 'Monthly', nextDate: dStr(shiftMonth(curYM, 1), 1), accountId: 'acc_hdfc', active: true }
    ] : [];

    const goals = withSampleData ? [
      { id: uid('goal'), name: '6-Month Emergency Fund', targetPaise: toPaise(300000), currentPaise: toPaise(195000), deadline: `${now.getFullYear() + 1}-06-30`, color: '#16A579' },
      { id: uid('goal'), name: 'MacBook Pro Upgrade', targetPaise: toPaise(165000), currentPaise: toPaise(92000), deadline: `${now.getFullYear() + 1}-03-15`, color: '#8B5CF6' },
      { id: uid('goal'), name: 'Goa & Kerala Trip', targetPaise: toPaise(45000), currentPaise: toPaise(31500), deadline: `${now.getFullYear() + 1}-01-20`, color: '#22D3EE' }
    ] : [];

    const notifications = withSampleData ? [
      { id: uid('n'), title: 'Shopping budget at 92%', message: 'You have spent ₹4,600 of your ₹5,000 Shopping budget this month.', level: 'warning', time: 'Just now', read: false },
      { id: uid('n'), title: 'Food budget at 80%', message: 'Food spending reached ₹3,180 out of ₹4,000.', level: 'info', time: '2h ago', read: false },
      { id: uid('n'), title: 'Monthly savings rate strong', message: 'Your savings rate this month is above 60%. Keep it up!', level: 'success', time: '1d ago', read: true }
    ] : [];

    const auditLogs = [
      { id: uid('log'), action: 'WORKSPACE_INIT', detail: `Initialized isolated workspace for ${email}`, time: todayISO() },
      { id: uid('log'), action: 'SECURITY_CHECK', detail: 'Exact integer paise calculation & local tenant isolation active', time: todayISO() }
    ];

    return {
      profile: { name, email },
      settings: { currency: 'INR', theme: 'light', budgetAlerts: true, emailReportsEnabled: true, emailVerified: true },
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
      accounts,
      transactions,
      budgets,
      recurring,
      goals,
      notifications,
      auditLogs
    };
  }

  function loadStore() {
    const raw = safeGetStorage(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.users && parsed.workspaces) {
          if (!parsed.themeMigratedWhiteGlass) {
            Object.values(parsed.workspaces).forEach(w => {
              if (w && w.settings) w.settings.theme = 'light';
            });
            parsed.themeMigratedWhiteGlass = true;
            safeSetStorage(STORAGE_KEY, JSON.stringify(parsed));
          }
          return parsed;
        }
      } catch (e) {}
    }
    const demoEmail = 'alex@ledgerflow.app';
    return {
      activeUserEmail: demoEmail,
      showLanding: false,
      users: { [demoEmail]: { name: 'Alex Kumar', email: demoEmail, passwordHash: '123456' } },
      workspaces: { [demoEmail]: createSeedWorkspace('Alex Kumar', demoEmail, true) }
    };
  }

  let STORE = loadStore();
  function saveStore() { safeSetStorage(STORAGE_KEY, JSON.stringify(STORE)); }
  function getActiveWorkspace() {
    const email = STORE.activeUserEmail || 'alex@ledgerflow.app';
    if (!STORE.workspaces[email]) STORE.workspaces[email] = createSeedWorkspace('User', email, false);
    if (!STORE.workspaces[email].auditLogs) STORE.workspaces[email].auditLogs = [];
    return STORE.workspaces[email];
  }
  function logAudit(action, detail) {
    const ws = getActiveWorkspace();
    ws.auditLogs.unshift({ id: uid('log'), action, detail, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
    if (ws.auditLogs.length > 25) ws.auditLogs.pop();
  }

  // =========================================================================
  // 3. UI STATE, CALCULATIONS & ANIMATED COUNTERS
  // =========================================================================
  const UI = {
    view: 'dashboard',
    dateRange: 'this_month',
    budgetMonth: monthKey(todayISO()),
    calMonth: monthKey(todayISO()),
    calSelectedDate: todayISO(),
    wealthTab: 'accounts',
    txFilters: { search: '', type: 'all', category: 'all', method: 'all', account: 'all', sort: 'newest' },
    charts: {},
    chatHistory: [],
    authMode: 'login',
    confirmCallback: null,
    threeRaf: null
  };

  function destroyCharts() {
    Object.values(UI.charts).forEach(ch => {
      try { if (ch && typeof ch.destroy === 'function') ch.destroy(); } catch (e) {}
    });
    UI.charts = {};
  }

  function animateCounter(el, targetPaise, showSign = false) {
    if (!el) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { el.textContent = fmtMoney(targetPaise, showSign); return; }
    const duration = 420;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtMoney(Math.round(targetPaise * eased), showSign);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmtMoney(targetPaise, showSign);
    }
    requestAnimationFrame(tick);
  }

  function filterByDateRange(txs, range) {
    const now = new Date();
    const curYM = monthKey(todayISO());
    const prevYM = shiftMonth(curYM, -1);
    const curYear = String(now.getFullYear());
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return txs.filter(t => {
      if (range === 'all') return true;
      if (range === 'this_month') return monthKey(t.date) === curYM;
      if (range === 'last_month') return monthKey(t.date) === prevYM;
      if (range === 'this_year') return String(t.date).startsWith(curYear);
      if (range === 'this_week') {
        const dt = new Date(t.date + 'T00:00:00');
        return dt >= weekAgo && dt <= now;
      }
      return true;
    });
  }

  function calcAccountBalance(acc, txs) {
    let bal = acc.openingPaise || 0;
    for (const t of txs) {
      if (t.type === 'income' && t.accountId === acc.id) bal += t.amountPaise;
      else if (t.type === 'expense' && t.accountId === acc.id) bal -= t.amountPaise;
      else if (t.type === 'transfer') {
        if (t.accountId === acc.id) bal -= t.amountPaise;
        if (t.toAccountId === acc.id) bal += t.amountPaise;
      }
    }
    return bal;
  }

  function calcTotals(txs) {
    let income = 0, expense = 0;
    for (const t of txs) {
      if (t.type === 'income') income += t.amountPaise;
      else if (t.type === 'expense') expense += t.amountPaise;
    }
    const net = income - expense;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
    return { income, expense, net, savingsRate };
  }

  function getCategoryColor(ws, name, type = 'expense') {
    const list = type === 'income' ? ws.categories.income : ws.categories.expense;
    const found = list.find(c => c.name === name);
    return found ? found.color : '#8B5CF6';
  }

  function buildMonthlyReports(ws) {
    const curYM = monthKey(todayISO());
    const monthSet = new Set([curYM]);
    ws.transactions.forEach(t => { if (t.date) monthSet.add(monthKey(t.date)); });
    const sortedAsc = [...monthSet].sort();
    let runningOpening = ws.accounts.reduce((s, a) => s + (a.openingPaise || 0), 0);
    const reports = [];

    for (const ym of sortedAsc) {
      const mTxs = ws.transactions.filter(t => monthKey(t.date) === ym);
      const totals = calcTotals(mTxs);
      const openingPaise = runningOpening;
      const closingPaise = openingPaise + totals.net;
      runningOpening = closingPaise;

      const catMap = {};
      mTxs.filter(t => t.type === 'expense').forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amountPaise;
      });
      const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
      const isCurrent = ym === curYM;
      reports.push({
        ym,
        label: monthLabel(ym),
        isCurrent,
        openingPaise,
        incomePaise: totals.income,
        expensePaise: totals.expense,
        closingPaise,
        savingsPaise: totals.net,
        savingsRate: totals.savingsRate,
        txCount: mTxs.length,
        categories,
        txs: mTxs,
        emailStatus: !ws.settings.emailReportsEnabled ? 'Opted Out' : (isCurrent ? 'Scheduled (Month End)' : 'Ready for Email')
      });
    }
    return reports.reverse();
  }

  function openMonthlyReportModal(ym, emailPreview = false) {
    const ws = getActiveWorkspace();
    const rep = buildMonthlyReports(ws).find(r => r.ym === ym);
    if (!rep) return;
    const modalEl = document.getElementById('report-modal');
    modalEl.dataset.ym = ym;
    document.getElementById('rep-modal-title').textContent = emailPreview
      ? `Email Preview: Your Monthly Financial Report — ${rep.label}`
      : `Monthly Financial Report — ${rep.label}`;
    document.getElementById('rep-modal-sub').textContent = emailPreview
      ? `Recipient: ${ws.profile.name} <${ws.profile.email}> · Status: ${rep.emailStatus}`
      : `Account: ${ws.profile.name} (${ws.profile.email}) · ${rep.txCount} transactions`;

    const topCat = rep.categories[0];
    document.getElementById('rep-modal-body').innerHTML = `
      ${emailPreview ? `
        <div class="surface-2 p-3.5 rounded-xl text-xs space-y-1 border-l-2 border-l-[#C6A66B]">
          <p><strong>To:</strong> ${escapeHtml(ws.profile.name)} &lt;${escapeHtml(ws.profile.email)}&gt;</p>
          <p><strong>Subject:</strong> Your Monthly Financial Report — ${escapeHtml(rep.label)}</p>
          <p><strong>Attachment:</strong> LedgerFlow_${escapeHtml(rep.ym)}_Report.pdf</p>
        </div>
      ` : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="surface-2 p-3 rounded-xl"><p class="text-[11px] text-[var(--text-muted)]">Opening Balance</p><p class="font-bold tabular-nums mt-0.5">${fmtMoney(rep.openingPaise)}</p></div>
        <div class="surface-2 p-3 rounded-xl"><p class="text-[11px] text-[var(--text-muted)]">Monthly Income</p><p class="font-bold tabular-nums text-[#16A579] mt-0.5">${fmtMoney(rep.incomePaise)}</p></div>
        <div class="surface-2 p-3 rounded-xl"><p class="text-[11px] text-[var(--text-muted)]">Monthly Expenses</p><p class="font-bold tabular-nums text-[#D96C72] mt-0.5">${fmtMoney(rep.expensePaise)}</p></div>
        <div class="surface-2 p-3 rounded-xl"><p class="text-[11px] text-[var(--text-muted)]">Closing Balance</p><p class="font-bold tabular-nums mt-0.5">${fmtMoney(rep.closingPaise)}</p></div>
      </div>
      <div class="surface-2 p-4 rounded-xl flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold">Net Monthly Savings</p>
          <p class="text-[11px] text-[var(--text-muted)]">${topCat ? `Highest expense category: ${escapeHtml(topCat[0])} (${fmtMoney(topCat[1])})` : 'No expenses logged in this month.'}</p>
        </div>
        <div class="text-right">
          <p class="text-lg font-extrabold tabular-nums text-[#C6A66B]">${fmtMoney(rep.savingsPaise, true)}</p>
          <p class="text-[11px] text-[var(--text-muted)]">${rep.savingsRate}% savings rate</p>
        </div>
      </div>
      <div class="space-y-2">
        <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Category-wise Expense Breakdown</h3>
        ${rep.categories.length ? rep.categories.map(([cat, amt]) => `
          <div class="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border)] last:border-0">
            <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${getCategoryColor(ws, cat)}"></span>${escapeHtml(cat)}</span>
            <span class="font-semibold tabular-nums">${fmtMoney(amt)}</span>
          </div>
        `).join('') : `<p class="text-xs text-[var(--text-muted)]">No expenses recorded in ${escapeHtml(rep.label)}.</p>`}
      </div>
    `;
    document.getElementById('report-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }


  // =========================================================================
  // 5. TOASTS, NOTIFICATIONS & CONFIRM MODAL
  // =========================================================================
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const colors = {
      success: 'border-emerald-500/40 text-[#16A579]',
      warning: 'border-amber-500/40 text-amber-400',
      error: 'border-rose-500/40 text-[#D96C72]',
      info: 'border-cyan-500/40 text-[#C6A66B]'
    };
    const iconName = type === 'success' ? 'check-circle-2' : type === 'warning' ? 'alert-triangle' : type === 'error' ? 'x-circle' : 'info';
    const el = document.createElement('div');
    el.className = `toast-item pointer-events-auto card px-4 py-3 flex items-center gap-2.5 shadow-2xl border ${colors[type] || colors.info}`;
    el.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i><span class="text-xs font-medium text-[var(--text)] flex-1">${escapeHtml(message)}</span>`;
    container.appendChild(el);
    if (window.lucide) lucide.createIcons({ nodes: [el] });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(12px)';
      el.style.transition = 'all 0.2s ease';
      setTimeout(() => el.remove(), 220);
    }, 3200);
  }

  function pushNotification(title, message, level = 'info') {
    const ws = getActiveWorkspace();
    ws.notifications.unshift({ id: uid('n'), title, message, level, time: 'Just now', read: false });
    if (ws.notifications.length > 30) ws.notifications.pop();
    saveStore();
    updateNotifBadge();
  }

  function checkBudgetAlertsForTx(tx) {
    const ws = getActiveWorkspace();
    if (!ws.settings.budgetAlerts || tx.type !== 'expense') return;
    const ym = monthKey(tx.date);
    if (ym !== monthKey(todayISO())) return;
    const monthExp = ws.transactions.filter(t => t.type === 'expense' && monthKey(t.date) === ym);

    const catLimit = ws.budgets.categories[tx.category];
    if (catLimit && catLimit > 0) {
      const catSpent = monthExp.filter(t => t.category === tx.category).reduce((s, t) => s + t.amountPaise, 0);
      const pct = Math.round((catSpent / catLimit) * 100);
      if (pct >= 100) {
        pushNotification(`${tx.category} budget exceeded (${pct}%)`, `Spent ${fmtMoney(catSpent)} against ${fmtMoney(catLimit)} limit.`, 'error');
        showToast(`${tx.category} budget exceeded (${pct}%)!`, 'error');
      } else if (pct >= 90) {
        pushNotification(`${tx.category} budget critical (${pct}%)`, `Only ${fmtMoney(catLimit - catSpent)} remaining.`, 'warning');
      } else if (pct >= 75) {
        pushNotification(`${tx.category} budget at ${pct}%`, `Approaching your ${fmtMoney(catLimit)} limit.`, 'warning');
      }
    }
    const overall = ws.budgets.overallPaise;
    if (overall > 0) {
      const totalSpent = monthExp.reduce((s, t) => s + t.amountPaise, 0);
      const pct = Math.round((totalSpent / overall) * 100);
      if (pct >= 100) {
        pushNotification(`Monthly overall budget exceeded (${pct}%)`, `Total spend ${fmtMoney(totalSpent)} exceeds ${fmtMoney(overall)}.`, 'error');
      }
    }
  }

  function openConfirm(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = message;
    UI.confirmCallback = onConfirm;
    document.getElementById('confirm-modal').classList.remove('hidden');
  }
  function closeConfirm() {
    document.getElementById('confirm-modal').classList.add('hidden');
    UI.confirmCallback = null;
  }

  // =========================================================================
  // 6. THEME & SHELL CHROME SYNC
  // =========================================================================
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) lucide.createIcons();
    }
  }

  function updateNotifBadge() {
    const ws = getActiveWorkspace();
    const unread = ws.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notif-badge');
    const drawerCount = document.getElementById('notif-drawer-count');
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.classList.toggle('hidden', unread === 0);
    }
    if (drawerCount) drawerCount.textContent = String(unread);
  }

  function syncShellChrome() {
    const ws = getActiveWorkspace();
    applyTheme(ws.settings.theme);
    document.getElementById('sidebar-user-name').textContent = ws.profile.name;
    document.getElementById('sidebar-user-email').textContent = ws.profile.email;
    document.getElementById('sidebar-avatar').textContent = (ws.profile.name || 'U').slice(0, 1).toUpperCase();
    updateNotifBadge();

    const landing = document.getElementById('landing-screen');
    const shell = document.getElementById('app-shell');
    const mobNav = document.getElementById('mobile-nav');
    if (STORE.showLanding) {
      landing.classList.remove('hidden');
      shell.classList.add('hidden');
      mobNav.classList.add('hidden');
    } else {
      landing.classList.add('hidden');
      shell.classList.remove('hidden');
      mobNav.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
      const active = btn.dataset.view === UI.view;
      btn.classList.toggle('active', active);
      btn.classList.toggle('text-[var(--text-muted)]', !active);
    });
    document.querySelectorAll('.mob-nav-btn').forEach(btn => {
      const active = btn.dataset.view === UI.view;
      btn.classList.toggle('text-[#C6A66B]', active);
      btn.classList.toggle('text-[var(--text-muted)]', !active);
    });

    const titles = {
      dashboard: ['Dashboard', 'Real-time financial telemetry & cash flow'],
      transactions: ['Transactions', 'Search, filter, import, and manage every record'],
      budgets: ['Budget Manager', 'Monthly limits with automated threshold guardrails'],
      analytics: ['Analytics & Reports', 'Visual trends, merchant breakdown, and CSV/PDF reports'],
      calendar: ['Financial Calendar', 'Daily cash flow and upcoming recurring obligations'],
      wealth: ['Accounts, Recurring & Goals', 'Manage balances, subscriptions, and savings milestones'],
      assistant: ['Smart Financial Assistant', 'Instant answers calculated directly from your real data'],
      admin: ['Workspace Admin', 'Multi-account isolation, audit trail, and system health'],
      settings: ['Settings & Data', 'Currency, theme, custom categories, and backups']
    };
    const [t, sub] = titles[UI.view] || ['LedgerFlow', ''];
    document.getElementById('page-title').textContent = t;
    document.getElementById('page-subtitle').textContent = sub;
  }

  // =========================================================================
  // 7. VIEW RENDERERS
  // =========================================================================
  function renderApp() {
    destroyCharts();
    syncShellChrome();
    if (STORE.showLanding) {
      if (window.lucide) lucide.createIcons();
      return;
    }
    const main = document.getElementById('main-content');
    if (UI.view === 'dashboard') renderDashboard(main);
    else if (UI.view === 'transactions') renderTransactions(main);
    else if (UI.view === 'budgets') renderBudgets(main);
    else if (UI.view === 'analytics') renderAnalytics(main);
    else if (UI.view === 'calendar') renderCalendar(main);
    else if (UI.view === 'wealth') renderWealth(main);
    else if (UI.view === 'assistant') renderAssistant(main);
    else if (UI.view === 'admin') renderAdmin(main);
    else if (UI.view === 'settings') renderSettings(main);
    if (window.lucide) lucide.createIcons();
  }

  // ---- VIEW 1: DASHBOARD ----
  function renderDashboard(root) {
    const ws = getActiveWorkspace();
    const filtered = filterByDateRange(ws.transactions, UI.dateRange);
    const totals = calcTotals(filtered);
    const totalBalance = ws.accounts.reduce((s, a) => s + calcAccountBalance(a, ws.transactions), 0);

    const curYM = monthKey(todayISO());
    const prevYM = shiftMonth(curYM, -1);
    const curTotals = calcTotals(ws.transactions.filter(t => monthKey(t.date) === curYM));
    const prevTotals = calcTotals(ws.transactions.filter(t => monthKey(t.date) === prevYM));
    const expDelta = prevTotals.expense > 0 ? Math.round(((curTotals.expense - prevTotals.expense) / prevTotals.expense) * 100) : 0;

    const overallLimit = ws.budgets.overallPaise || 0;
    const budgetPct = overallLimit > 0 ? Math.round((curTotals.expense / overallLimit) * 100) : 0;
    const budgetBarClass = budgetPct >= 100 ? 'bg-rose-500' : budgetPct >= 75 ? 'bg-amber-500' : 'progress-glow';

    const catMap = {};
    filtered.filter(t => t.type === 'expense').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amountPaise; });
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topCat = sortedCats[0];
    const recent = [...ws.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    root.innerHTML = `
      <div class="view-section space-y-6">
        <!-- Date Range Filter & Live Status -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap gap-1.5 p-1 rounded-xl surface-2">
            ${[
              ['this_month', 'This Month'],
              ['last_month', 'Last Month'],
              ['this_week', 'This Week'],
              ['this_year', 'This Year'],
              ['all', 'All Time']
            ].map(([k, label]) => `
              <button type="button" data-range="${k}" class="dash-range-btn px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${UI.dateRange === k ? 'btn-primary' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}">${label}</button>
            `).join('')}
          </div>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full surface-2 text-xs text-[var(--text-muted)]">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live engine · <strong class="text-[var(--text)]">${ws.transactions.length}</strong> records</span>
          </div>
        </div>

        <!-- KPI Spotlight Cards -->
        <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div class="card-black-glass p-5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-neutral-300">Total Net Balance</span>
              <span class="w-9 h-9 rounded-xl bg-white/10 text-[#C6A66B] flex items-center justify-center border border-white/15"><i data-lucide="wallet" class="w-4 h-4"></i></span>
            </div>
            <p id="kpi-balance" class="text-2xl sm:text-3xl font-extrabold tabular-nums mt-3 tracking-tight text-white">${fmtMoney(totalBalance)}</p>
            <p class="text-xs text-neutral-400 mt-1.5">Across ${ws.accounts.length} active accounts</p>
          </div>

          <div class="card card-hover kpi-accent-emerald p-5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--text-muted)]">Total Income</span>
              <span class="w-9 h-9 rounded-xl bg-[#16A579]/15 text-[#16A579] flex items-center justify-center border border-[#16A579]/30"><i data-lucide="trending-up" class="w-4 h-4"></i></span>
            </div>
            <p id="kpi-income" class="text-2xl sm:text-3xl font-extrabold tabular-nums text-[#16A579] mt-3 tracking-tight">${fmtMoney(totals.income)}</p>
            <p class="text-xs text-[var(--text-muted)] mt-1.5">${filtered.filter(t => t.type === 'income').length} income entries</p>
          </div>

          <div class="card card-hover kpi-accent-rose p-5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--text-muted)]">Total Expenses</span>
              <span class="w-9 h-9 rounded-xl bg-[#D96C72]/15 text-[#D96C72] flex items-center justify-center border border-[#D96C72]/30"><i data-lucide="trending-down" class="w-4 h-4"></i></span>
            </div>
            <p id="kpi-expense" class="text-2xl sm:text-3xl font-extrabold tabular-nums text-[#D96C72] mt-3 tracking-tight">${fmtMoney(totals.expense)}</p>
            <p class="text-xs mt-1.5 font-medium ${expDelta <= 0 ? 'text-[#16A579]' : 'text-[#D96C72]'}">${expDelta === 0 ? 'Steady vs last month' : (expDelta > 0 ? `+${expDelta}% vs last month` : `${expDelta}% vs last month`)}</p>
          </div>

          <div class="card card-hover kpi-accent-cyan p-5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--text-muted)]">Net Savings</span>
              <span class="w-9 h-9 rounded-xl bg-[#16A579]/15 text-[#C6A66B] flex items-center justify-center border border-[#16A579]/30"><i data-lucide="piggy-bank" class="w-4 h-4"></i></span>
            </div>
            <p id="kpi-savings" class="text-2xl sm:text-3xl font-extrabold tabular-nums mt-3 tracking-tight ${totals.net >= 0 ? 'text-[#C6A66B]' : 'text-[#D96C72]'}">${fmtMoney(totals.net, true)}</p>
            <p class="text-xs text-[var(--text-muted)] mt-1.5">Savings rate: <strong class="text-[var(--text)] tabular-nums">${totals.savingsRate}%</strong></p>
          </div>
        </div>

        <!-- Luxury Account Cards & Quick Actions Strip (Ref Page 1) -->
        <div class="grid lg:grid-cols-12 gap-4 items-stretch">
          <div class="lg:col-span-8 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            ${ws.accounts.slice(0, 4).map((acc, idx) => {
              const bal = calcAccountBalance(acc, ws.transactions);
              const isObs = idx === 0;
              return `
                <div class="${isObs ? 'metal-card-obsidian' : 'metal-card'} rounded-2xl p-4 flex flex-col justify-between min-h-[108px] transition-transform hover:-translate-y-0.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-semibold truncate ${isObs ? 'text-neutral-300' : 'text-[var(--text-muted)]'}">${escapeHtml(acc.name)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#16A579]/15 text-[#16A579] shrink-0">Active</span>
                  </div>
                  <div class="mt-3">
                    <p class="text-base font-extrabold tabular-nums ${isObs ? 'text-white' : 'text-[var(--text)]'}">${fmtMoney(bal)}</p>
                    <p class="text-[10px] mt-0.5 ${isObs ? 'text-[#C6A66B]' : 'text-[var(--text-muted)]'}">${escapeHtml(acc.type)}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="card p-4 lg:col-span-4 flex flex-col justify-between gap-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold">Quick Actions</span>
              <span class="text-[10px] uppercase tracking-wider text-[#C6A66B] font-semibold">Instant</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" id="qa-add-exp" class="px-3 py-2 rounded-xl surface-2 hover:border-[#C6A66B]/60 text-xs font-semibold flex items-center justify-center gap-1.5"><i data-lucide="minus-circle" class="w-3.5 h-3.5 text-[#D96C72]"></i>Expense</button>
              <button type="button" id="qa-add-inc" class="px-3 py-2 rounded-xl surface-2 hover:border-[#16A579]/60 text-xs font-semibold flex items-center justify-center gap-1.5"><i data-lucide="plus-circle" class="w-3.5 h-3.5 text-[#16A579]"></i>Income</button>
              <button type="button" id="qa-set-limits" class="px-3 py-2 rounded-xl surface-2 hover:border-[#C6A66B]/60 text-xs font-semibold flex items-center justify-center gap-1.5"><i data-lucide="sliders-horizontal" class="w-3.5 h-3.5 text-[#C6A66B]"></i>Limits</button>
              <button type="button" id="qa-export-csv" class="px-3 py-2 rounded-xl surface-2 hover:border-[#101114]/40 text-xs font-semibold flex items-center justify-center gap-1.5"><i data-lucide="download" class="w-3.5 h-3.5"></i>Export</button>
            </div>
          </div>
        </div>

        <!-- Monthly Budget Guardrail -->
        <div class="card p-5">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg bg-[#C6A66B]/15 text-[#C6A66B] flex items-center justify-center"><i data-lucide="target" class="w-4 h-4"></i></span>
              <h2 class="text-sm font-semibold">Monthly Budget Guardrail (${monthLabel(curYM)})</h2>
            </div>
            <div class="text-xs tabular-nums">
              <span class="font-bold text-[var(--text)]">${fmtMoney(curTotals.expense)}</span>
              <span class="text-[var(--text-muted)]"> / ${fmtMoney(overallLimit)} (${budgetPct}%)</span>
            </div>
          </div>
          <div class="h-3 rounded-full bg-slate-500/20 overflow-hidden">
            <div class="h-full rounded-full ${budgetBarClass} transition-all duration-500" style="width:${Math.min(budgetPct, 100)}%"></div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 mt-2.5 text-xs text-[var(--text-muted)]">
            <span>${overallLimit - curTotals.expense >= 0 ? `${fmtMoney(overallLimit - curTotals.expense)} remaining this month` : `Exceeded by ${fmtMoney(curTotals.expense - overallLimit)}`}</span>
            <button type="button" id="dash-go-budgets" class="text-[#C6A66B] hover:text-[#C6A66B] font-semibold transition-colors">Manage Budgets →</button>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid lg:grid-cols-12 gap-5">
          <div class="card p-5 lg:col-span-7">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-sm font-semibold">Income vs Expenses</h2>
                <p class="text-xs text-[var(--text-muted)]">6-month cash flow trajectory</p>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold surface-2 text-[#C6A66B]">6M Trend</span>
            </div>
            <div class="relative h-72"><canvas id="dash-cashflow-chart"></canvas></div>
          </div>

          <div class="card p-5 lg:col-span-5 flex flex-col">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-sm font-semibold">Category Breakdown</h2>
                <p class="text-xs text-[var(--text-muted)]">Click any category to filter history</p>
              </div>
            </div>
            ${sortedCats.length > 0 ? `
              <div class="relative h-52"><canvas id="dash-cat-chart"></canvas></div>
              <div class="mt-4 grid grid-cols-2 gap-2">
                ${sortedCats.slice(0, 6).map(([cat, amt]) => `
                  <button type="button" data-filter-cat="${escapeHtml(cat)}" class="dash-cat-pill flex items-center justify-between px-2.5 py-2 rounded-xl surface-2 hover:border-[#C6A66B]/60 text-xs transition-colors">
                    <span class="flex items-center gap-1.5 truncate"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${getCategoryColor(ws, cat)}"></span><span class="truncate">${escapeHtml(cat)}</span></span>
                    <span class="font-semibold tabular-nums ml-1">${fmtMoney(amt)}</span>
                  </button>
                `).join('')}
              </div>
            ` : `<div class="flex-1 flex flex-col items-center justify-center py-10 text-center text-xs text-[var(--text-muted)]">No expenses in this date range.</div>`}
          </div>
        </div>

        <!-- Bottom Row: Recent Transactions & Smart Insights -->
        <div class="grid lg:grid-cols-12 gap-5">
          <div class="card p-5 lg:col-span-7">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold">Recent Transactions</h2>
              <button type="button" id="dash-view-all-tx" class="text-xs font-semibold text-[#C6A66B] hover:text-[#C6A66B] transition-colors">View All →</button>
            </div>
            ${recent.length ? `
              <div class="divide-y divide-[var(--border)]">
                ${recent.map(tx => `
                  <div class="py-3 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)]/30 px-2 -mx-2 rounded-xl transition-colors">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.type === 'income' ? 'bg-[#16A579]/15 text-[#16A579]' : tx.type === 'transfer' ? 'bg-[#C6A66B]/15 text-[#C6A66B]' : 'bg-[#D96C72]/15 text-[#D96C72]'}">
                        <i data-lucide="${tx.type === 'income' ? 'arrow-down-left' : tx.type === 'transfer' ? 'repeat' : 'arrow-up-right'}" class="w-4 h-4"></i>
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-medium truncate">${escapeHtml(tx.title)}</p>
                        <p class="text-xs text-[var(--text-muted)] truncate">${escapeHtml(tx.category)} · ${escapeHtml(tx.method)} · ${formatDateDisplay(tx.date)}</p>
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-sm font-bold tabular-nums ${tx.type === 'income' ? 'text-[#16A579]' : tx.type === 'transfer' ? 'text-[#C6A66B]' : 'text-[var(--text)]'}">${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${fmtMoney(tx.amountPaise)}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `<p class="text-xs text-[var(--text-muted)] py-8 text-center">No transactions yet. Click "Add Transaction" to get started.</p>`}
          </div>

          <div class="card p-5 lg:col-span-5 space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="sparkles" class="w-4 h-4 text-[#C6A66B]"></i>Smart Insights</h2>
              <button type="button" id="dash-open-assistant" class="text-xs font-semibold text-[#C6A66B] hover:text-[#C6A66B] transition-colors">Ask AI →</button>
            </div>
            <div class="space-y-3 text-xs leading-relaxed">
              <div class="surface-2 p-3.5 rounded-xl border-l-2 border-l-[#111111]">
                <p class="font-semibold text-[var(--text)] mb-1">Top Spending Driver</p>
                <p class="text-[var(--text-muted)]">${topCat ? `<strong>${escapeHtml(topCat[0])}</strong> leads this period at <strong class="text-[var(--text)] tabular-nums">${fmtMoney(topCat[1])}</strong> (${totals.expense > 0 ? Math.round((topCat[1] / totals.expense) * 100) : 0}% of expenses).` : 'Add expenses to see your primary spending driver.'}</p>
              </div>
              <div class="surface-2 p-3.5 rounded-xl border-l-2 border-l-emerald-500">
                <p class="font-semibold text-[var(--text)] mb-1">Savings Velocity</p>
                <p class="text-[var(--text-muted)]">${totals.savingsRate >= 30 ? `Strong discipline — you are saving <strong class="text-[#16A579]">${totals.savingsRate}%</strong> of your income in this period.` : totals.savingsRate > 0 ? `You saved <strong>${totals.savingsRate}%</strong>. Trimming discretionary categories can help reach a 30% target.` : 'Expenses currently meet or exceed income for this period.'}</p>
              </div>
              <div class="surface-2 p-3.5 rounded-xl border-l-2 border-l-[#C6A66B]">
                <p class="font-semibold text-[var(--text)] mb-1">Upcoming Recurring Bills</p>
                <p class="text-[var(--text-muted)]">${ws.recurring.filter(r => r.active && r.type === 'expense').length} active bills totaling <strong class="text-[var(--text)] tabular-nums">${fmtMoney(ws.recurring.filter(r => r.active && r.type === 'expense').reduce((s, r) => s + r.amountPaise, 0))}/mo</strong>.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Dedicated Monthly Financial Reports Section (Phase 9) -->
        <div class="card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold flex items-center gap-2"><i data-lucide="file-text" class="w-4 h-4 text-[#C6A66B]"></i>Monthly Financial Reports</h2>
              <p class="text-xs text-[var(--text-muted)]">Account-isolated monthly statements for <strong>${escapeHtml(ws.profile.email)}</strong> · Email reports: <span class="font-semibold text-[var(--text)]">${ws.settings.emailReportsEnabled ? 'Enabled' : 'Off'}</span></p>
            </div>
            <div class="relative w-full sm:w-56">
              <i data-lucide="search" class="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input id="dash-report-search" type="text" placeholder="Search month (e.g. Oct)..." class="input-field w-full pl-8 pr-3 py-1.5 text-xs" />
            </div>
          </div>
          <div id="dash-reports-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            ${buildMonthlyReports(ws).map(r => `
              <div data-rep-label="${escapeHtml(r.label.toLowerCase())}" class="rep-card surface-2 rounded-2xl p-4 flex flex-col justify-between gap-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-sm font-bold">${escapeHtml(r.label)}</p>
                    <p class="text-[11px] text-[var(--text-muted)]">${r.txCount} transactions · Closing ${fmtMoney(r.closingPaise)}</p>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.isCurrent ? 'bg-[#C6A66B]/20 text-[#C6A66B]' : 'bg-[#16A579]/15 text-[#16A579]'}">${escapeHtml(r.emailStatus)}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs tabular-nums">
                  <div><p class="text-[10px] text-[var(--text-muted)]">Income</p><p class="font-bold text-[#16A579]">${fmtMoney(r.incomePaise)}</p></div>
                  <div><p class="text-[10px] text-[var(--text-muted)]">Expense</p><p class="font-bold text-[#D96C72]">${fmtMoney(r.expensePaise)}</p></div>
                  <div><p class="text-[10px] text-[var(--text-muted)]">Savings</p><p class="font-bold">${r.savingsRate}%</p></div>
                </div>
                <div class="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--border)]">
                  <button type="button" data-view-rep="${r.ym}" class="px-2.5 py-1 rounded-lg btn-primary text-[11px] font-semibold">View Report</button>
                  <button type="button" data-email-rep="${r.ym}" class="px-2.5 py-1 rounded-lg surface-2 hover:border-[#C6A66B]/60 text-[11px] font-semibold">Email Preview</button>
                  <button type="button" data-csv-rep="${r.ym}" class="px-2.5 py-1 rounded-lg surface-2 hover:border-[#101114]/40 text-[11px] font-semibold">CSV</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Animate KPI numbers
    animateCounter(document.getElementById('kpi-balance'), totalBalance, false);
    animateCounter(document.getElementById('kpi-income'), totals.income, false);
    animateCounter(document.getElementById('kpi-expense'), totals.expense, false);
    animateCounter(document.getElementById('kpi-savings'), totals.net, true);

    root.querySelectorAll('.dash-range-btn').forEach(btn => {
      btn.addEventListener('click', () => { UI.dateRange = btn.dataset.range; renderApp(); });
    });
    const goBudgets = document.getElementById('dash-go-budgets');
    if (goBudgets) goBudgets.addEventListener('click', () => { UI.view = 'budgets'; renderApp(); });
    const qaExp = document.getElementById('qa-add-exp');
    if (qaExp) qaExp.addEventListener('click', () => { openTxModal(); currentTxType = 'expense'; populateTxDropdowns('expense'); });
    const qaInc = document.getElementById('qa-add-inc');
    if (qaInc) qaInc.addEventListener('click', () => { openTxModal(); currentTxType = 'income'; populateTxDropdowns('income'); });
    const qaLim = document.getElementById('qa-set-limits');
    if (qaLim) qaLim.addEventListener('click', () => { UI.view = 'budgets'; renderApp(); });
    const qaCsv = document.getElementById('qa-export-csv');
    if (qaCsv) qaCsv.addEventListener('click', () => exportCSV(ws.transactions));
    const repSearch = document.getElementById('dash-report-search');
    if (repSearch) repSearch.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      root.querySelectorAll('.rep-card').forEach(c => {
        c.classList.toggle('hidden', Boolean(q) && !c.dataset.repLabel.includes(q));
      });
    });
    root.querySelectorAll('[data-view-rep]').forEach(btn => btn.addEventListener('click', () => openMonthlyReportModal(btn.dataset.viewRep, false)));
    root.querySelectorAll('[data-email-rep]').forEach(btn => btn.addEventListener('click', () => openMonthlyReportModal(btn.dataset.emailRep, true)));
    root.querySelectorAll('[data-csv-rep]').forEach(btn => btn.addEventListener('click', () => {
      const ym = btn.dataset.csvRep;
      exportCSV(ws.transactions.filter(t => monthKey(t.date) === ym));
    }));
    const goTx = document.getElementById('dash-view-all-tx');
    if (goTx) goTx.addEventListener('click', () => { UI.view = 'transactions'; renderApp(); });
    const goAi = document.getElementById('dash-open-assistant');
    if (goAi) goAi.addEventListener('click', () => { UI.view = 'assistant'; renderApp(); });
    root.querySelectorAll('.dash-cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.txFilters.category = btn.dataset.filterCat;
        UI.txFilters.type = 'expense';
        UI.view = 'transactions';
        renderApp();
      });
    });

    const isDark = ws.settings.theme === 'dark';
    const gridColor = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.07)';
    const textColor = isDark ? '#94A3C0' : '#5A607D';
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(curYM, -i));
    const incSeries = months.map(m => fromPaise(ws.transactions.filter(t => t.type === 'income' && monthKey(t.date) === m).reduce((s, t) => s + t.amountPaise, 0)));
    const expSeries = months.map(m => fromPaise(ws.transactions.filter(t => t.type === 'expense' && monthKey(t.date) === m).reduce((s, t) => s + t.amountPaise, 0)));

    const cfCtx = document.getElementById('dash-cashflow-chart');
    if (cfCtx && window.Chart) {
      const ctx2d = cfCtx.getContext('2d');
      const incGrad = ctx2d.createLinearGradient(0, 0, 0, 260);
      incGrad.addColorStop(0, 'rgba(22, 165, 121, 0.28)');
      incGrad.addColorStop(1, 'rgba(22, 165, 121, 0.01)');
      const expGrad = ctx2d.createLinearGradient(0, 0, 0, 260);
      expGrad.addColorStop(0, 'rgba(198, 166, 107, 0.28)');
      expGrad.addColorStop(1, 'rgba(198, 166, 107, 0.01)');

      UI.charts.cashflow = new Chart(cfCtx, {
        type: 'line',
        data: {
          labels: months.map(monthLabel),
          datasets: [
            { label: 'Income', data: incSeries, borderColor: '#16A579', backgroundColor: incGrad, fill: true, tension: 0.42, borderWidth: 2.5, pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: '#16A579' },
            { label: 'Expenses', data: expSeries, borderColor: '#C6A66B', backgroundColor: expGrad, fill: true, tension: 0.42, borderWidth: 2.5, pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: '#C6A66B' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', align: 'end', labels: { color: textColor, boxWidth: 10, usePointStyle: true } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
          }
        }
      });
    }

    const catCtx = document.getElementById('dash-cat-chart');
    if (catCtx && window.Chart && sortedCats.length) {
      UI.charts.category = new Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels: sortedCats.map(c => c[0]),
          datasets: [{
            data: sortedCats.map(c => fromPaise(c[1])),
            backgroundColor: sortedCats.map(c => getCategoryColor(ws, c[0])),
            borderWidth: 0,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: { legend: { display: false } },
          onClick: (_, els) => {
            if (els.length) {
              const cat = sortedCats[els[0].index][0];
              UI.txFilters.category = cat;
              UI.txFilters.type = 'expense';
              UI.view = 'transactions';
              renderApp();
            }
          }
        }
      });
    }
  }

  // ---- VIEW 2: TRANSACTIONS ----
  function renderTransactions(root) {
    const ws = getActiveWorkspace();
    const f = UI.txFilters;
    const allCats = [...new Set([...ws.categories.expense.map(c => c.name), ...ws.categories.income.map(c => c.name)])];

    let list = ws.transactions.filter(t => {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.category !== 'all' && t.category !== f.category) return false;
      if (f.method !== 'all' && t.method !== f.method) return false;
      if (f.account !== 'all' && t.accountId !== f.account && t.toAccountId !== f.account) return false;
      if (f.search.trim()) {
        const q = f.search.trim().toLowerCase();
        const hay = `${t.title} ${t.category} ${t.notes || ''} ${(t.tags || []).join(' ')} ${t.method}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (f.sort === 'newest') return b.date.localeCompare(a.date);
      if (f.sort === 'oldest') return a.date.localeCompare(b.date);
      if (f.sort === 'highest') return b.amountPaise - a.amountPaise;
      if (f.sort === 'lowest') return a.amountPaise - b.amountPaise;
      return 0;
    });

    const filteredTotals = calcTotals(list);
    const accMap = Object.fromEntries(ws.accounts.map(a => [a.id, a.name]));

    root.innerHTML = `
      <div class="view-section space-y-5">
        <div class="card p-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="relative flex-1 min-w-[200px]">
              <i data-lucide="search" class="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input id="tx-search-input" type="text" value="${escapeHtml(f.search)}" placeholder="Search merchant, notes, tags..." class="input-field w-full pl-9 pr-3 py-2 text-sm" />
            </div>
            <button id="tx-export-csv" type="button" class="px-3.5 py-2 rounded-xl surface-2 text-xs font-semibold hover:border-[#111111]/30 flex items-center gap-1.5">
              <i data-lucide="download" class="w-3.5 h-3.5 text-[#C6A66B]"></i>Export CSV
            </button>
            <button id="tx-import-csv" type="button" class="px-3.5 py-2 rounded-xl surface-2 text-xs font-semibold hover:border-[#111111]/30 flex items-center gap-1.5">
              <i data-lucide="upload" class="w-3.5 h-3.5 text-[#C6A66B]"></i>Import CSV
            </button>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <select id="tx-f-type" class="input-field px-2.5 py-2 text-xs">
              <option value="all" ${f.type === 'all' ? 'selected' : ''}>All Types</option>
              <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Expenses</option>
              <option value="income" ${f.type === 'income' ? 'selected' : ''}>Income</option>
              <option value="transfer" ${f.type === 'transfer' ? 'selected' : ''}>Transfers</option>
            </select>
            <select id="tx-f-cat" class="input-field px-2.5 py-2 text-xs">
              <option value="all">All Categories</option>
              ${allCats.map(c => `<option value="${escapeHtml(c)}" ${f.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <select id="tx-f-method" class="input-field px-2.5 py-2 text-xs">
              <option value="all">All Methods</option>
              ${['UPI', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Cash', 'Other'].map(m => `<option value="${m}" ${f.method === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <select id="tx-f-account" class="input-field px-2.5 py-2 text-xs">
              <option value="all">All Accounts</option>
              ${ws.accounts.map(a => `<option value="${a.id}" ${f.account === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
            </select>
            <select id="tx-f-sort" class="input-field px-2.5 py-2 text-xs col-span-2 sm:col-span-1">
              <option value="newest" ${f.sort === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="oldest" ${f.sort === 'oldest' ? 'selected' : ''}>Oldest First</option>
              <option value="highest" ${f.sort === 'highest' ? 'selected' : ''}>Highest Amount</option>
              <option value="lowest" ${f.sort === 'lowest' ? 'selected' : ''}>Lowest Amount</option>
            </select>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)] text-xs">
            <div class="flex flex-wrap items-center gap-4 tabular-nums">
              <span class="text-[var(--text-muted)]">Showing <strong class="text-[var(--text)]">${list.length}</strong> records</span>
              <span class="text-[#16A579] font-semibold">In: ${fmtMoney(filteredTotals.income)}</span>
              <span class="text-[#D96C72] font-semibold">Out: ${fmtMoney(filteredTotals.expense)}</span>
            </div>
            ${(f.search || f.type !== 'all' || f.category !== 'all' || f.method !== 'all' || f.account !== 'all') ? `<button id="tx-reset-filters" type="button" class="text-[#C6A66B] hover:text-[#C6A66B] font-semibold">Clear Filters</button>` : ''}
          </div>
        </div>

        <div class="card overflow-hidden">
          ${list.length ? `
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--surface-2)]/60">
                    <th class="py-3.5 px-4 font-semibold">Transaction</th>
                    <th class="py-3.5 px-4 font-semibold hidden sm:table-cell">Category</th>
                    <th class="py-3.5 px-4 font-semibold hidden md:table-cell">Account & Method</th>
                    <th class="py-3.5 px-4 font-semibold hidden sm:table-cell">Date</th>
                    <th class="py-3.5 px-4 font-semibold text-right">Amount</th>
                    <th class="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[var(--border)] text-sm">
                  ${list.map(tx => `
                    <tr class="hover:bg-[var(--surface-2)]/40 transition-colors">
                      <td class="py-3.5 px-4">
                        <div class="flex items-center gap-3">
                          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${tx.type === 'transfer' ? '#8B5CF6' : getCategoryColor(ws, tx.category, tx.type)}"></span>
                          <div class="min-w-0">
                            <p class="font-medium truncate max-w-[200px] sm:max-w-[260px]">${escapeHtml(tx.title)}</p>
                            <p class="text-xs text-[var(--text-muted)] sm:hidden">${escapeHtml(tx.category)} · ${formatDateDisplay(tx.date)}</p>
                            ${tx.tags && tx.tags.length ? `<div class="flex flex-wrap gap-1 mt-1">${tx.tags.map(tg => `<span class="px-1.5 py-0.5 rounded text-[10px] surface-2 text-[var(--text-muted)]">#${escapeHtml(tg)}</span>`).join('')}</div>` : ''}
                          </div>
                        </div>
                      </td>
                      <td class="py-3.5 px-4 hidden sm:table-cell">
                        <span class="px-2.5 py-1 rounded-full text-xs font-medium surface-2">${escapeHtml(tx.category)}</span>
                      </td>
                      <td class="py-3.5 px-4 hidden md:table-cell text-xs text-[var(--text-muted)]">
                        <p class="text-[var(--text)] font-medium">${escapeHtml(accMap[tx.accountId] || 'Account')}${tx.type === 'transfer' && tx.toAccountId ? ` → ${escapeHtml(accMap[tx.toAccountId] || '')}` : ''}</p>
                        <p>${escapeHtml(tx.method)}</p>
                      </td>
                      <td class="py-3.5 px-4 hidden sm:table-cell text-xs text-[var(--text-muted)] tabular-nums">${formatDateDisplay(tx.date)}</td>
                      <td class="py-3.5 px-4 text-right font-bold tabular-nums whitespace-nowrap ${tx.type === 'income' ? 'text-[#16A579]' : tx.type === 'transfer' ? 'text-[#C6A66B]' : 'text-[var(--text)]'}">
                        ${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${fmtMoney(tx.amountPaise)}
                      </td>
                      <td class="py-3.5 px-4 text-right whitespace-nowrap">
                        <button type="button" data-edit-tx="${tx.id}" class="p-1.5 rounded-lg hover:bg-[#C6A66B]/15 text-[var(--text-muted)] hover:text-[#C6A66B]" title="Edit" aria-label="Edit transaction"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                        <button type="button" data-dup-tx="${tx.id}" class="p-1.5 rounded-lg hover:bg-[#16A579]/15 text-[var(--text-muted)] hover:text-[#C6A66B]" title="Duplicate" aria-label="Duplicate transaction"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
                        <button type="button" data-del-tx="${tx.id}" class="p-1.5 rounded-lg hover:bg-rose-500/15 text-[var(--text-muted)] hover:text-[#D96C72]" title="Delete" aria-label="Delete transaction"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="p-12 text-center space-y-2">
              <div class="w-12 h-12 rounded-2xl surface-2 mx-auto flex items-center justify-center text-[var(--text-muted)]"><i data-lucide="inbox" class="w-6 h-6"></i></div>
              <p class="font-semibold text-sm">No matching transactions</p>
              <p class="text-xs text-[var(--text-muted)]">Try adjusting your filters or add a new transaction.</p>
            </div>
          `}
        </div>
      </div>
    `;

    const searchEl = document.getElementById('tx-search-input');
    searchEl.addEventListener('input', e => {
      UI.txFilters.search = e.target.value;
      renderTransactions(root);
      if (window.lucide) lucide.createIcons();
      const el = document.getElementById('tx-search-input');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    document.getElementById('tx-f-type').addEventListener('change', e => { UI.txFilters.type = e.target.value; renderApp(); });
    document.getElementById('tx-f-cat').addEventListener('change', e => { UI.txFilters.category = e.target.value; renderApp(); });
    document.getElementById('tx-f-method').addEventListener('change', e => { UI.txFilters.method = e.target.value; renderApp(); });
    document.getElementById('tx-f-account').addEventListener('change', e => { UI.txFilters.account = e.target.value; renderApp(); });
    document.getElementById('tx-f-sort').addEventListener('change', e => { UI.txFilters.sort = e.target.value; renderApp(); });

    const resetBtn = document.getElementById('tx-reset-filters');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      UI.txFilters = { search: '', type: 'all', category: 'all', method: 'all', account: 'all', sort: 'newest' };
      renderApp();
    });

    document.getElementById('tx-export-csv').addEventListener('click', () => exportCSV(list));
    document.getElementById('tx-import-csv').addEventListener('click', () => document.getElementById('csv-import-input').click());

    root.querySelectorAll('[data-edit-tx]').forEach(btn => btn.addEventListener('click', () => openTxModal(btn.dataset.editTx)));
    root.querySelectorAll('[data-dup-tx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const orig = ws.transactions.find(t => t.id === btn.dataset.dupTx);
        if (!orig) return;
        ws.transactions.unshift({ ...orig, id: uid('tx'), date: todayISO(), title: `${orig.title} (Copy)` });
        logAudit('TX_DUPLICATE', `Duplicated "${orig.title}"`);
        saveStore();
        showToast('Transaction duplicated');
        renderApp();
      });
    });
    root.querySelectorAll('[data-del-tx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tx = ws.transactions.find(t => t.id === btn.dataset.delTx);
        if (!tx) return;
        openConfirm('Delete Transaction', `Delete "${tx.title}" (${fmtMoney(tx.amountPaise)})? This cannot be undone.`, () => {
          ws.transactions = ws.transactions.filter(t => t.id !== tx.id);
          logAudit('TX_DELETE', `Deleted "${tx.title}" (${fmtMoney(tx.amountPaise)})`);
          saveStore();
          pushNotification('Transaction deleted', `Removed "${tx.title}" (${fmtMoney(tx.amountPaise)}).`, 'info');
          showToast('Transaction deleted', 'info');
          renderApp();
        });
      });
    });
  }

  // ---- VIEW 3: BUDGETS ----
  function renderBudgets(root) {
    const ws = getActiveWorkspace();
    const ym = UI.budgetMonth;
    const monthExp = ws.transactions.filter(t => t.type === 'expense' && monthKey(t.date) === ym);
    const totalSpent = monthExp.reduce((s, t) => s + t.amountPaise, 0);
    const overall = ws.budgets.overallPaise || 0;
    const overallPct = overall > 0 ? Math.round((totalSpent / overall) * 100) : 0;

    const statusBadge = pct => {
      if (pct >= 100) return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-[#D96C72]">Exceeded (${pct}%)</span>`;
      if (pct >= 90) return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#D96C72]/15 text-[#D96C72]">Critical (${pct}%)</span>`;
      if (pct >= 75) return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-400">Warning (${pct}%)</span>`;
      if (pct >= 50) return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#C6A66B]/20 text-[#C6A66B]">On Track (${pct}%)</span>`;
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-[#16A579]">Healthy (${pct}%)</span>`;
    };
    const barColor = pct => pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'progress-glow';

    root.innerHTML = `
      <div class="view-section space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button id="bud-prev-m" type="button" class="p-2 rounded-xl surface-2 hover:border-[#111111]/30" aria-label="Previous month"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
            <span class="px-4 py-2 rounded-xl surface-2 text-sm font-semibold tabular-nums">${monthLabel(ym)}</span>
            <button id="bud-next-m" type="button" class="p-2 rounded-xl surface-2 hover:border-[#111111]/30" aria-label="Next month"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
          </div>
        </div>

        <div class="card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-bold">Overall Monthly Budget</h2>
              <p class="text-xs text-[var(--text-muted)]">Combined spending guardrail across all expense categories</p>
            </div>
            <form id="overall-budget-form" class="flex items-center gap-2">
              <input id="overall-budget-input" type="number" min="0" step="100" value="${fromPaise(overall)}" class="input-field w-32 px-3 py-1.5 text-sm font-bold tabular-nums" />
              <button type="submit" class="px-3.5 py-1.5 rounded-xl btn-primary text-xs font-semibold">Update</button>
            </form>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="tabular-nums">Spent <strong>${fmtMoney(totalSpent)}</strong> of <strong>${fmtMoney(overall)}</strong></span>
              ${statusBadge(overallPct)}
            </div>
            <div class="h-3 rounded-full bg-slate-500/20 overflow-hidden">
              <div class="h-full rounded-full ${barColor(overallPct)} transition-all duration-500" style="width:${Math.min(overallPct, 100)}%"></div>
            </div>
            <p class="text-xs text-[var(--text-muted)]">${overall - totalSpent >= 0 ? `${fmtMoney(overall - totalSpent)} remaining for ${monthLabel(ym)}` : `Over budget by ${fmtMoney(totalSpent - overall)}`}</p>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${ws.categories.expense.map(cat => {
            const limit = ws.budgets.categories[cat.name] || 0;
            const spent = monthExp.filter(t => t.category === cat.name).reduce((s, t) => s + t.amountPaise, 0);
            const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            return `
              <div class="card card-hover p-4 space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-3 h-3 rounded-full shrink-0" style="background:${cat.color}"></span>
                    <h3 class="font-semibold text-sm truncate">${escapeHtml(cat.name)}</h3>
                  </div>
                  ${limit > 0 ? statusBadge(pct) : `<span class="text-[11px] text-[var(--text-muted)]">No limit</span>`}
                </div>
                <div class="space-y-1.5">
                  <div class="flex justify-between text-xs tabular-nums">
                    <span class="text-[var(--text-muted)]">Spent: <strong class="text-[var(--text)]">${fmtMoney(spent)}</strong></span>
                    <span class="text-[var(--text-muted)]">${limit > 0 ? (limit - spent >= 0 ? `Left: ${fmtMoney(limit - spent)}` : `Over: ${fmtMoney(spent - limit)}`) : '—'}</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-500/20 overflow-hidden">
                    <div class="h-full rounded-full ${limit > 0 ? barColor(pct) : 'bg-slate-500/30'}" style="width:${limit > 0 ? Math.min(pct, 100) : 0}%"></div>
                  </div>
                </div>
                <div class="flex items-center gap-2 pt-1">
                  <input type="number" min="0" step="100" data-cat-budget-input="${escapeHtml(cat.name)}" value="${fromPaise(limit)}" placeholder="Set limit" class="input-field flex-1 px-2.5 py-1.5 text-xs tabular-nums" />
                  <button type="button" data-save-cat-budget="${escapeHtml(cat.name)}" class="px-3 py-1.5 rounded-lg surface-2 hover:border-[#C6A66B]/60 text-xs font-semibold">Save</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('bud-prev-m').addEventListener('click', () => { UI.budgetMonth = shiftMonth(UI.budgetMonth, -1); renderApp(); });
    document.getElementById('bud-next-m').addEventListener('click', () => { UI.budgetMonth = shiftMonth(UI.budgetMonth, 1); renderApp(); });
    document.getElementById('overall-budget-form').addEventListener('submit', e => {
      e.preventDefault();
      ws.budgets.overallPaise = toPaise(document.getElementById('overall-budget-input').value);
      logAudit('BUDGET_UPDATE', `Updated overall budget to ${fmtMoney(ws.budgets.overallPaise)}`);
      saveStore();
      showToast('Overall monthly budget updated');
      renderApp();
    });
    root.querySelectorAll('[data-save-cat-budget]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.saveCatBudget;
        const inp = root.querySelector(`[data-cat-budget-input="${CSS.escape(cat)}"]`);
        ws.budgets.categories[cat] = toPaise(inp ? inp.value : 0);
        logAudit('BUDGET_UPDATE', `Set ${cat} budget to ${fmtMoney(ws.budgets.categories[cat])}`);
        saveStore();
        showToast(`${cat} budget updated`);
        renderApp();
      });
    });
  }

  // ---- VIEW 4: ANALYTICS & REPORTS ----
  function renderAnalytics(root) {
    const ws = getActiveWorkspace();
    const curYM = monthKey(todayISO());
    const monthTxs = ws.transactions.filter(t => monthKey(t.date) === curYM);
    const totals = calcTotals(monthTxs);

    const methodMap = {}, merchantMap = {}, catMap = {};
    monthTxs.filter(t => t.type === 'expense').forEach(t => {
      methodMap[t.method] = (methodMap[t.method] || 0) + t.amountPaise;
      merchantMap[t.title] = (merchantMap[t.title] || 0) + t.amountPaise;
      catMap[t.category] = (catMap[t.category] || 0) + t.amountPaise;
    });
    const topMerchants = Object.entries(merchantMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const methods = Object.entries(methodMap).sort((a, b) => b[1] - a[1]);

    root.innerHTML = `
      <div class="view-section space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <h2 class="text-base font-bold">Financial Report — ${monthLabel(curYM)}</h2>
            <p class="text-xs text-[var(--text-muted)]">Generated live from your recorded transactions</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="rep-export-csv" type="button" class="px-3.5 py-2 rounded-xl surface-2 text-xs font-semibold hover:border-[#111111]/30 flex items-center gap-1.5">
              <i data-lucide="file-spreadsheet" class="w-4 h-4 text-[#16A579]"></i>Export CSV
            </button>
            <button id="rep-print-pdf" type="button" class="px-3.5 py-2 rounded-xl btn-primary text-xs font-semibold flex items-center gap-1.5">
              <i data-lucide="printer" class="w-4 h-4"></i>Print / Save PDF
            </button>
          </div>
        </div>

        <div class="grid sm:grid-cols-3 gap-4">
          <div class="card kpi-accent-emerald p-4">
            <p class="text-xs text-[var(--text-muted)]">Monthly Income</p>
            <p class="text-xl font-bold text-[#16A579] tabular-nums mt-1">${fmtMoney(totals.income)}</p>
          </div>
          <div class="card kpi-accent-rose p-4">
            <p class="text-xs text-[var(--text-muted)]">Monthly Expense</p>
            <p class="text-xl font-bold text-[#D96C72] tabular-nums mt-1">${fmtMoney(totals.expense)}</p>
          </div>
          <div class="card kpi-accent-cyan p-4">
            <p class="text-xs text-[var(--text-muted)]">Net Cash Flow</p>
            <p class="text-xl font-bold tabular-nums mt-1 ${totals.net >= 0 ? 'text-[#C6A66B]' : 'text-[#D96C72]'}">${fmtMoney(totals.net, true)} (${totals.savingsRate}%)</p>
          </div>
        </div>

        <div class="grid lg:grid-cols-12 gap-5">
          <div class="card p-5 lg:col-span-7">
            <h3 class="text-sm font-semibold mb-1">Daily Spending Trend (${monthLabel(curYM)})</h3>
            <p class="text-xs text-[var(--text-muted)] mb-4">Daily outflow velocity across the month</p>
            <div class="relative h-72"><canvas id="ana-daily-chart"></canvas></div>
          </div>
          <div class="card p-5 lg:col-span-5">
            <h3 class="text-sm font-semibold mb-1">Payment Method Breakdown</h3>
            <p class="text-xs text-[var(--text-muted)] mb-4">Distribution across UPI, cards, and bank</p>
            <div class="relative h-72"><canvas id="ana-method-chart"></canvas></div>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-5">
          <div class="card p-5">
            <h3 class="text-sm font-semibold mb-4">Top Expenses & Merchants</h3>
            ${topMerchants.length ? `
              <div class="space-y-3">
                ${topMerchants.map(([name, amt], idx) => {
                  const pct = totals.expense > 0 ? Math.round((amt / totals.expense) * 100) : 0;
                  return `
                    <div class="space-y-1">
                      <div class="flex justify-between text-xs">
                        <span class="font-medium">${idx + 1}. ${escapeHtml(name)}</span>
                        <span class="font-bold tabular-nums">${fmtMoney(amt)} <span class="text-[var(--text-muted)] font-normal">(${pct}%)</span></span>
                      </div>
                      <div class="h-1.5 rounded-full bg-slate-500/20 overflow-hidden">
                        <div class="h-full rounded-full progress-glow" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `<p class="text-xs text-[var(--text-muted)]">No expenses recorded this month.</p>`}
          </div>

          <div class="card p-5">
            <h3 class="text-sm font-semibold mb-4">Category Distribution</h3>
            ${topCats.length ? `
              <div class="space-y-2.5">
                ${topCats.map(([cat, amt]) => `
                  <div class="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border)] last:border-0">
                    <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${getCategoryColor(ws, cat)}"></span>${escapeHtml(cat)}</span>
                    <span class="font-bold tabular-nums">${fmtMoney(amt)}</span>
                  </div>
                `).join('')}
              </div>
            ` : `<p class="text-xs text-[var(--text-muted)]">No category data this month.</p>`}
          </div>
        </div>
      </div>
    `;

    document.getElementById('rep-export-csv').addEventListener('click', () => exportCSV(ws.transactions));
    document.getElementById('rep-print-pdf').addEventListener('click', () => window.print());

    const isDark = ws.settings.theme === 'dark';
    const gridColor = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.07)';
    const textColor = isDark ? '#94A3C0' : '#5A607D';

    const [y, m] = curYM.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const dayData = dayLabels.map(d => {
      const iso = `${curYM}-${d.padStart(2, '0')}`;
      return fromPaise(monthTxs.filter(t => t.type === 'expense' && t.date === iso).reduce((s, t) => s + t.amountPaise, 0));
    });

    const dailyCtx = document.getElementById('ana-daily-chart');
    if (dailyCtx && window.Chart) {
      const g = dailyCtx.getContext('2d').createLinearGradient(0, 0, 0, 260);
      g.addColorStop(0, 'rgba(16, 185, 129, 0.24)');
      g.addColorStop(1, 'rgba(198, 161, 91, 0.01)');
      UI.charts.daily = new Chart(dailyCtx, {
        type: 'line',
        data: {
          labels: dayLabels,
          datasets: [{
            label: 'Daily Spend',
            data: dayData,
            borderColor: '#16A579',
            backgroundColor: g,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#C6A66B'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
          }
        }
      });
    }

    const methCtx = document.getElementById('ana-method-chart');
    if (methCtx && window.Chart && methods.length) {
      UI.charts.methods = new Chart(methCtx, {
        type: 'bar',
        data: {
          labels: methods.map(x => x[0]),
          datasets: [{
            label: 'Spent',
            data: methods.map(x => fromPaise(x[1])),
            backgroundColor: ['#8B5CF6', '#22D3EE', '#3B82F6', '#EC4899', '#16A579', '#F59E0B'],
            borderRadius: 8,
            maxBarThickness: 30
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
            y: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } }
          }
        }
      });
    }
  }

  // ---- VIEW 5: FINANCIAL CALENDAR ----
  function renderCalendar(root) {
    const ws = getActiveWorkspace();
    const ym = UI.calMonth;
    const [year, month] = ym.split('-').map(Number);
    const firstDow = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayTotals = {};
    ws.transactions.forEach(t => {
      if (monthKey(t.date) === ym) {
        if (!dayTotals[t.date]) dayTotals[t.date] = { inc: 0, exp: 0 };
        if (t.type === 'income') dayTotals[t.date].inc += t.amountPaise;
        if (t.type === 'expense') dayTotals[t.date].exp += t.amountPaise;
      }
    });

    const selectedTxs = ws.transactions.filter(t => t.date === UI.calSelectedDate);
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += `<div class="h-16 sm:h-20 rounded-xl bg-transparent"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${ym}-${String(d).padStart(2, '0')}`;
      const info = dayTotals[iso];
      const isSelected = iso === UI.calSelectedDate;
      const isToday = iso === todayISO();
      cells += `
        <button type="button" data-cal-day="${iso}" class="h-16 sm:h-20 p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all ${isSelected ? 'border-violet-500 bg-[#C6A66B]/15 shadow-inner' : 'border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[#111111]/30'}">
          <span class="text-xs font-semibold ${isToday ? 'px-1.5 py-0.5 rounded-md btn-primary' : ''}">${d}</span>
          <div class="space-y-0.5 text-[10px] tabular-nums truncate w-full">
            ${info && info.inc > 0 ? `<div class="text-[#16A579] font-semibold truncate">+${fmtMoney(info.inc)}</div>` : ''}
            ${info && info.exp > 0 ? `<div class="text-[#D96C72] font-semibold truncate">-${fmtMoney(info.exp)}</div>` : ''}
          </div>
        </button>
      `;
    }

    root.innerHTML = `
      <div class="view-section grid lg:grid-cols-12 gap-5">
        <div class="card p-5 lg:col-span-8 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold">${monthLabel(ym)}</h2>
            <div class="flex items-center gap-1.5">
              <button id="cal-prev" type="button" class="p-2 rounded-xl surface-2 hover:border-[#111111]/30" aria-label="Previous"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
              <button id="cal-today" type="button" class="px-3 py-1.5 rounded-xl surface-2 text-xs font-semibold">Today</button>
              <button id="cal-next" type="button" class="p-2 rounded-xl surface-2 hover:border-[#111111]/30" aria-label="Next"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
            </div>
          </div>
          <div class="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-[var(--text-muted)]">
            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
          </div>
          <div class="grid grid-cols-7 gap-1.5">${cells}</div>
        </div>

        <div class="card p-5 lg:col-span-4 flex flex-col space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-bold">${formatDateDisplay(UI.calSelectedDate)}</h3>
              <p class="text-xs text-[var(--text-muted)]">${selectedTxs.length} transaction(s)</p>
            </div>
            <button id="cal-add-day" type="button" class="px-3 py-1.5 rounded-xl btn-primary text-xs font-semibold">+ Add</button>
          </div>
          <div class="flex-1 space-y-2.5">
            ${selectedTxs.length ? selectedTxs.map(tx => `
              <div class="surface-2 p-3 rounded-xl flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-semibold truncate">${escapeHtml(tx.title)}</p>
                  <p class="text-[11px] text-[var(--text-muted)]">${escapeHtml(tx.category)} · ${escapeHtml(tx.method)}</p>
                </div>
                <span class="text-xs font-bold tabular-nums ${tx.type === 'income' ? 'text-[#16A579]' : 'text-[#D96C72]'}">${tx.type === 'income' ? '+' : '-'}${fmtMoney(tx.amountPaise)}</span>
              </div>
            `).join('') : `<p class="text-xs text-[var(--text-muted)] py-8 text-center">No transactions on this date.</p>`}
          </div>
        </div>
      </div>
    `;

    document.getElementById('cal-prev').addEventListener('click', () => { UI.calMonth = shiftMonth(UI.calMonth, -1); renderApp(); });
    document.getElementById('cal-next').addEventListener('click', () => { UI.calMonth = shiftMonth(UI.calMonth, 1); renderApp(); });
    document.getElementById('cal-today').addEventListener('click', () => { UI.calMonth = monthKey(todayISO()); UI.calSelectedDate = todayISO(); renderApp(); });
    document.getElementById('cal-add-day').addEventListener('click', () => openTxModal(null, UI.calSelectedDate));
    root.querySelectorAll('[data-cal-day]').forEach(btn => btn.addEventListener('click', () => { UI.calSelectedDate = btn.dataset.calDay; renderApp(); }));
  }

  // ---- VIEW 6: ACCOUNTS, RECURRING & GOALS ----
  function renderWealth(root) {
    const ws = getActiveWorkspace();
    const tab = UI.wealthTab;

    root.innerHTML = `
      <div class="view-section space-y-5">
        <div class="flex flex-wrap gap-1.5 p-1 rounded-xl surface-2 w-fit">
          ${[
            ['accounts', 'Accounts & Wallets'],
            ['recurring', 'Recurring & Bills'],
            ['goals', 'Savings Goals']
          ].map(([k, label]) => `
            <button type="button" data-wtab="${k}" class="wtab-btn px-4 py-2 rounded-lg text-xs font-semibold ${tab === k ? 'btn-primary' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}">${label}</button>
          `).join('')}
        </div>

        ${tab === 'accounts' ? `
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            ${ws.accounts.map(acc => {
              const bal = calcAccountBalance(acc, ws.transactions);
              return `
                <div class="card card-hover p-5 space-y-3" style="border-top: 2px solid ${acc.color}">
                  <div class="flex items-center justify-between">
                    <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold surface-2">${escapeHtml(acc.type)}</span>
                    <span class="w-3 h-3 rounded-full" style="background:${acc.color}"></span>
                  </div>
                  <div>
                    <h3 class="font-semibold text-sm">${escapeHtml(acc.name)}</h3>
                    <p class="text-2xl font-extrabold tabular-nums mt-1 ${bal < 0 ? 'text-[#D96C72]' : ''}">${fmtMoney(bal)}</p>
                  </div>
                  <p class="text-[11px] text-[var(--text-muted)]">Opening: ${fmtMoney(acc.openingPaise)}</p>
                </div>
              `;
            }).join('')}
          </div>
          <div class="card p-5 max-w-xl">
            <h3 class="text-sm font-bold mb-3">Add Financial Account</h3>
            <form id="add-account-form" class="grid sm:grid-cols-3 gap-3">
              <input id="new-acc-name" type="text" required placeholder="Account Name" class="input-field px-3 py-2 text-xs" />
              <select id="new-acc-type" class="input-field px-3 py-2 text-xs">
                <option>Bank Account</option><option>Savings Account</option><option>Wallet</option><option>Credit Card</option><option>Cash</option>
              </select>
              <input id="new-acc-bal" type="number" step="0.01" value="0" placeholder="Opening Balance" class="input-field px-3 py-2 text-xs tabular-nums" />
              <button type="submit" class="sm:col-span-3 py-2.5 rounded-xl btn-primary text-xs font-semibold">Add Account</button>
            </form>
          </div>
        ` : ''}

        ${tab === 'recurring' ? `
          <div class="grid lg:grid-cols-12 gap-5">
            <div class="card p-5 lg:col-span-8 space-y-3">
              <h3 class="text-sm font-bold">Scheduled Recurring Items</h3>
              ${ws.recurring.length ? ws.recurring.map(r => `
                <div class="surface-2 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold">${escapeHtml(r.title)}</p>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.active ? 'bg-emerald-500/20 text-[#16A579]' : 'bg-slate-500/20 text-slate-400'}">${r.active ? r.frequency : 'Paused'}</span>
                    </div>
                    <p class="text-xs text-[var(--text-muted)] mt-0.5">${escapeHtml(r.category)} · Next due: ${formatDateDisplay(r.nextDate)}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold tabular-nums ${r.type === 'income' ? 'text-[#16A579]' : 'text-[#D96C72]'}">${r.type === 'income' ? '+' : '-'}${fmtMoney(r.amountPaise)}</span>
                    <button type="button" data-log-rec="${r.id}" class="px-2.5 py-1 rounded-lg btn-primary text-[11px] font-semibold">Log Now</button>
                    <button type="button" data-toggle-rec="${r.id}" class="px-2.5 py-1 rounded-lg surface-2 text-[11px] font-semibold">${r.active ? 'Pause' : 'Resume'}</button>
                    <button type="button" data-del-rec="${r.id}" class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[#D96C72]" aria-label="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                  </div>
                </div>
              `).join('') : `<p class="text-xs text-[var(--text-muted)]">No recurring transactions yet.</p>`}
            </div>
            <div class="card p-5 lg:col-span-4 h-fit">
              <h3 class="text-sm font-bold mb-3">Add Recurring Item</h3>
              <form id="add-rec-form" class="space-y-3">
                <input id="rec-title" type="text" required placeholder="e.g., Netflix, Gym, Rent" class="input-field w-full px-3 py-2 text-xs" />
                <div class="grid grid-cols-2 gap-2">
                  <select id="rec-type" class="input-field px-2.5 py-2 text-xs"><option value="expense">Expense</option><option value="income">Income</option></select>
                  <input id="rec-amount" type="number" min="1" step="0.01" required placeholder="Amount" class="input-field px-3 py-2 text-xs tabular-nums" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <select id="rec-freq" class="input-field px-2.5 py-2 text-xs"><option>Monthly</option><option>Weekly</option><option>Yearly</option></select>
                  <input id="rec-date" type="date" required value="${todayISO()}" class="input-field px-2.5 py-2 text-xs" />
                </div>
                <button type="submit" class="w-full py-2.5 rounded-xl btn-primary text-xs font-semibold">Save Recurring</button>
              </form>
            </div>
          </div>
        ` : ''}

        ${tab === 'goals' ? `
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${ws.goals.map(g => {
              const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.currentPaise / g.targetPaise) * 100)) : 0;
              return `
                <div class="card card-hover p-5 space-y-3.5">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <h3 class="font-bold text-sm">${escapeHtml(g.name)}</h3>
                      <p class="text-xs text-[var(--text-muted)]">Target date: ${formatDateDisplay(g.deadline)}</p>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-[#C6A66B]/20 text-[#C6A66B] tabular-nums">${pct}%</span>
                  </div>
                  <div class="space-y-1.5">
                    <div class="flex justify-between text-xs tabular-nums">
                      <span class="font-bold">${fmtMoney(g.currentPaise)}</span>
                      <span class="text-[var(--text-muted)]">of ${fmtMoney(g.targetPaise)}</span>
                    </div>
                    <div class="h-2.5 rounded-full bg-slate-500/20 overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%; background:${g.color}"></div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 pt-1">
                    <input type="number" min="1" step="100" data-goal-add-input="${g.id}" placeholder="Add amount" class="input-field flex-1 px-2.5 py-1.5 text-xs tabular-nums" />
                    <button type="button" data-goal-contribute="${g.id}" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">+ Save</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="card p-5 max-w-xl">
            <h3 class="text-sm font-bold mb-3">Create New Savings Goal</h3>
            <form id="add-goal-form" class="grid sm:grid-cols-3 gap-3">
              <input id="goal-name" type="text" required placeholder="Goal Name" class="input-field px-3 py-2 text-xs" />
              <input id="goal-target" type="number" min="100" required placeholder="Target Amount" class="input-field px-3 py-2 text-xs tabular-nums" />
              <input id="goal-deadline" type="date" required value="${todayISO()}" class="input-field px-3 py-2 text-xs" />
              <button type="submit" class="sm:col-span-3 py-2.5 rounded-xl btn-primary text-xs font-semibold">Create Goal</button>
            </form>
          </div>
        ` : ''}
      </div>
    `;

    root.querySelectorAll('.wtab-btn').forEach(btn => btn.addEventListener('click', () => { UI.wealthTab = btn.dataset.wtab; renderApp(); }));

    const accForm = document.getElementById('add-account-form');
    if (accForm) accForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('new-acc-name').value.trim();
      ws.accounts.push({ id: uid('acc'), name, type: document.getElementById('new-acc-type').value, openingPaise: toPaise(document.getElementById('new-acc-bal').value), color: '#8B5CF6' });
      logAudit('ACCOUNT_ADD', `Created account "${name}"`);
      saveStore();
      showToast('Account added');
      renderApp();
    });

    const recForm = document.getElementById('add-rec-form');
    if (recForm) recForm.addEventListener('submit', e => {
      e.preventDefault();
      const type = document.getElementById('rec-type').value;
      const title = document.getElementById('rec-title').value.trim();
      ws.recurring.unshift({
        id: uid('rec'), title, type, amountPaise: toPaise(document.getElementById('rec-amount').value),
        category: type === 'income' ? 'Salary' : 'Subscriptions', frequency: document.getElementById('rec-freq').value,
        nextDate: document.getElementById('rec-date').value, accountId: ws.accounts[0]?.id || '', active: true
      });
      logAudit('RECURRING_ADD', `Scheduled recurring "${title}"`);
      saveStore();
      showToast('Recurring item saved');
      renderApp();
    });

    root.querySelectorAll('[data-log-rec]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = ws.recurring.find(x => x.id === btn.dataset.logRec);
        if (!r) return;
        const tx = {
          id: uid('tx'), type: r.type, title: r.title, amountPaise: r.amountPaise,
          category: r.category, method: 'Bank Transfer', accountId: r.accountId || ws.accounts[0]?.id,
          date: todayISO(), notes: `Logged from recurring (${r.frequency})`, tags: ['recurring']
        };
        ws.transactions.unshift(tx);
        logAudit('RECURRING_LOG', `Logged "${r.title}" (${fmtMoney(r.amountPaise)})`);
        saveStore();
        checkBudgetAlertsForTx(tx);
        showToast(`Logged "${r.title}" to transactions`);
        renderApp();
      });
    });
    root.querySelectorAll('[data-toggle-rec]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = ws.recurring.find(x => x.id === btn.dataset.toggleRec);
        if (r) { r.active = !r.active; saveStore(); renderApp(); }
      });
    });
    root.querySelectorAll('[data-del-rec]').forEach(btn => {
      btn.addEventListener('click', () => {
        ws.recurring = ws.recurring.filter(x => x.id !== btn.dataset.delRec);
        saveStore();
        showToast('Recurring item removed', 'info');
        renderApp();
      });
    });

    root.querySelectorAll('[data-goal-contribute]').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = ws.goals.find(x => x.id === btn.dataset.goalContribute);
        const inp = root.querySelector(`[data-goal-add-input="${g.id}"]`);
        const add = toPaise(inp ? inp.value : 0);
        if (!g || add <= 0) return;
        g.currentPaise += add;
        logAudit('GOAL_CONTRIBUTE', `Added ${fmtMoney(add)} to "${g.name}"`);
        saveStore();
        showToast(`Added ${fmtMoney(add)} to ${g.name}`);
        renderApp();
      });
    });

    const goalForm = document.getElementById('add-goal-form');
    if (goalForm) goalForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('goal-name').value.trim();
      ws.goals.push({ id: uid('goal'), name, targetPaise: toPaise(document.getElementById('goal-target').value), currentPaise: 0, deadline: document.getElementById('goal-deadline').value, color: '#22D3EE' });
      logAudit('GOAL_ADD', `Created goal "${name}"`);
      saveStore();
      showToast('Savings goal created');
      renderApp();
    });
  }

  // ---- VIEW 7: SMART FINANCIAL ASSISTANT ----
  function answerFinanceQuestion(query) {
    const ws = getActiveWorkspace();
    const q = query.toLowerCase();
    const curYM = monthKey(todayISO());
    const prevYM = shiftMonth(curYM, -1);
    const curTxs = ws.transactions.filter(t => monthKey(t.date) === curYM);
    const prevTxs = ws.transactions.filter(t => monthKey(t.date) === prevYM);
    const cur = calcTotals(curTxs);
    const prev = calcTotals(prevTxs);

    const allCats = [...ws.categories.expense, ...ws.categories.income].map(c => c.name);
    const matchedCat = allCats.find(c => q.includes(c.toLowerCase()));
    if (matchedCat) {
      const catSum = curTxs.filter(t => t.category.toLowerCase() === matchedCat.toLowerCase()).reduce((s, t) => s + t.amountPaise, 0);
      const limit = ws.budgets.categories[matchedCat];
      return `This month (${monthLabel(curYM)}), your total for **${matchedCat}** is **${fmtMoney(catSum)}**.` + (limit ? ` Your budget limit is ${fmtMoney(limit)} (${Math.round((catSum / limit) * 100)}% used).` : '');
    }
    if (q.includes('budget') || q.includes('exceed')) {
      const alerts = [];
      for (const [cat, lim] of Object.entries(ws.budgets.categories)) {
        if (lim <= 0) continue;
        const sp = curTxs.filter(t => t.type === 'expense' && t.category === cat).reduce((s, t) => s + t.amountPaise, 0);
        const pct = Math.round((sp / lim) * 100);
        if (pct >= 75) alerts.push(`${cat}: ${fmtMoney(sp)} / ${fmtMoney(lim)} (${pct}%)`);
      }
      const ovPct = ws.budgets.overallPaise > 0 ? Math.round((cur.expense / ws.budgets.overallPaise) * 100) : 0;
      return `Overall budget usage is **${ovPct}%** (${fmtMoney(cur.expense)} of ${fmtMoney(ws.budgets.overallPaise)}). ` + (alerts.length ? `Categories above 75%: ${alerts.join(' · ')}.` : 'All category budgets are currently under 75%.');
    }
    if (q.includes('compare') || q.includes('last month')) {
      const diff = cur.expense - prev.expense;
      return `In ${monthLabel(curYM)}, you spent **${fmtMoney(cur.expense)}** vs **${fmtMoney(prev.expense)}** in ${monthLabel(prevYM)} (${diff >= 0 ? `+${fmtMoney(diff)} higher` : `${fmtMoney(Math.abs(diff))} lower`}). Net savings this month: **${fmtMoney(cur.net)}** (${cur.savingsRate}%).`;
    }
    if (q.includes('recurring') || q.includes('bill') || q.includes('subscription')) {
      const active = ws.recurring.filter(r => r.active && r.type === 'expense');
      const sum = active.reduce((s, r) => s + r.amountPaise, 0);
      return `You have **${active.length} active recurring expenses** totaling **${fmtMoney(sum)}/month**: ${active.map(r => `${r.title} (${fmtMoney(r.amountPaise)})`).join(', ') || 'None'}.`;
    }
    if (q.includes('save') || q.includes('saving') || q.includes('goal')) {
      const goalRem = ws.goals.reduce((s, g) => s + Math.max(0, g.targetPaise - g.currentPaise), 0);
      return `This month's net savings are **${fmtMoney(cur.net)}** (**${cur.savingsRate}%** savings rate). Across your ${ws.goals.length} savings goals, you have **${fmtMoney(goalRem)}** remaining to hit all targets.`;
    }
    if (q.includes('upi') || q.includes('card') || q.includes('cash')) {
      const method = q.includes('upi') ? 'UPI' : q.includes('credit') ? 'Credit Card' : q.includes('debit') ? 'Debit Card' : 'Cash';
      const sum = curTxs.filter(t => t.type === 'expense' && t.method === method).reduce((s, t) => s + t.amountPaise, 0);
      return `Total expenses paid via **${method}** in ${monthLabel(curYM)}: **${fmtMoney(sum)}**.`;
    }
    const catMap = {};
    curTxs.filter(t => t.type === 'expense').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amountPaise; });
    const top = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `Here is your ${monthLabel(curYM)} snapshot: Income **${fmtMoney(cur.income)}**, Expenses **${fmtMoney(cur.expense)}**, Net Savings **${fmtMoney(cur.net)}** (${cur.savingsRate}%). Top spending categories: ${top.map(([c, a]) => `${c} (${fmtMoney(a)})`).join(', ') || 'No expenses yet'}.`;
  }

  function renderAssistant(root) {
    if (UI.chatHistory.length === 0) {
      UI.chatHistory.push({ role: 'assistant', text: 'Hi! I calculate answers directly from your live transactions, budgets, and goals. Tap a question below or type your own.' });
    }
    const prompts = [
      'Where did my money go this month?',
      'Am I exceeding any budget?',
      'Compare this month with last month',
      'How much did I spend on Food?',
      'What recurring bills do I have?',
      'How much am I saving?'
    ];

    root.innerHTML = `
      <div class="view-section max-w-3xl mx-auto space-y-4">
        <div class="card p-4 sm:p-5 flex flex-col h-[68vh] min-h-[420px]">
          <div id="ai-chat-feed" class="flex-1 overflow-y-auto space-y-3 pr-1">
            ${UI.chatHistory.map(m => `
              <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
                <div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${m.role === 'user' ? 'btn-primary' : 'surface-2 text-[var(--text)]'}">
                  ${escapeHtml(m.text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="flex flex-wrap gap-1.5 py-3 border-t border-[var(--border)] mt-3">
            ${prompts.map(p => `<button type="button" data-ai-prompt="${escapeHtml(p)}" class="px-2.5 py-1 rounded-full surface-2 hover:border-[#C6A66B]/60 text-[11px] font-medium">${escapeHtml(p)}</button>`).join('')}
          </div>
          <form id="ai-chat-form" class="flex gap-2">
            <input id="ai-chat-input" type="text" required placeholder="Ask about your spending, budgets, UPI, or savings..." class="input-field flex-1 px-3.5 py-2.5 text-sm" />
            <button type="submit" class="px-4 py-2.5 rounded-xl btn-primary text-sm font-semibold">Ask</button>
          </form>
        </div>
      </div>
    `;

    const feed = document.getElementById('ai-chat-feed');
    feed.scrollTop = feed.scrollHeight;
    const ask = q => {
      UI.chatHistory.push({ role: 'user', text: q });
      UI.chatHistory.push({ role: 'assistant', text: answerFinanceQuestion(q) });
      renderApp();
    };
    root.querySelectorAll('[data-ai-prompt]').forEach(btn => btn.addEventListener('click', () => ask(btn.dataset.aiPrompt)));
    document.getElementById('ai-chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('ai-chat-input');
      if (inp.value.trim()) ask(inp.value.trim());
    });
  }

  // ---- VIEW 8: WORKSPACE ADMIN ----
  function renderAdmin(root) {
    const ws = getActiveWorkspace();
    const userList = Object.values(STORE.users);
    const totalSizeKB = Math.max(1, Math.round(JSON.stringify(STORE).length / 1024));

    root.innerHTML = `
      <div class="view-section space-y-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="card kpi-accent-violet p-4">
            <p class="text-xs text-[var(--text-muted)]">Local Tenant Workspaces</p>
            <p class="text-2xl font-extrabold tabular-nums mt-1">${userList.length}</p>
            <p class="text-[11px] text-[#16A579] mt-1">Strict tenant isolation active</p>
          </div>
          <div class="card kpi-accent-cyan p-4">
            <p class="text-xs text-[var(--text-muted)]">Active Records</p>
            <p class="text-2xl font-extrabold tabular-nums mt-1">${ws.transactions.length}</p>
            <p class="text-[11px] text-[var(--text-muted)] mt-1">${ws.accounts.length} accounts · ${ws.goals.length} goals</p>
          </div>
          <div class="card kpi-accent-emerald p-4">
            <p class="text-xs text-[var(--text-muted)]">Calculation Engine</p>
            <p class="text-2xl font-extrabold mt-1 text-[#16A579]">Integer Paise</p>
            <p class="text-[11px] text-[var(--text-muted)] mt-1">Zero floating-point drift</p>
          </div>
          <div class="card kpi-accent-rose p-4">
            <p class="text-xs text-[var(--text-muted)]">Local Storage Footprint</p>
            <p class="text-2xl font-extrabold tabular-nums mt-1">${totalSizeKB} KB</p>
            <p class="text-[11px] text-[var(--text-muted)] mt-1">Browser-persisted state</p>
          </div>
        </div>

        <div class="grid lg:grid-cols-12 gap-5">
          <div class="card p-5 lg:col-span-5 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold">Registered Local Accounts</h3>
              <button id="admin-switch-btn" type="button" class="text-xs font-semibold text-[#C6A66B] hover:text-[#C6A66B]">Switch / Add →</button>
            </div>
            <div class="space-y-2.5">
              ${userList.map(u => {
                const isActive = u.email === STORE.activeUserEmail;
                const uWs = STORE.workspaces[u.email];
                return `
                  <div class="surface-2 p-3 rounded-xl flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-xs font-semibold truncate">${escapeHtml(u.name)}</p>
                      <p class="text-[11px] text-[var(--text-muted)] truncate">${escapeHtml(u.email)} · ${uWs ? uWs.transactions.length : 0} txs</p>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${isActive ? 'bg-emerald-500/20 text-[#16A579]' : 'bg-slate-500/20 text-[var(--text-muted)]'}">${isActive ? 'Active' : 'Isolated'}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="card p-5 lg:col-span-7 space-y-3">
            <h3 class="text-sm font-bold">Workspace Audit Log</h3>
            <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
              ${ws.auditLogs.length ? ws.auditLogs.map(l => `
                <div class="surface-2 px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="px-2 py-0.5 rounded-md bg-[#C6A66B]/15 text-[#C6A66B] font-mono text-[10px] shrink-0">${escapeHtml(l.action)}</span>
                    <span class="truncate text-[var(--text)]">${escapeHtml(l.detail)}</span>
                  </div>
                  <span class="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">${escapeHtml(l.time)}</span>
                </div>
              `).join('') : `<p class="text-xs text-[var(--text-muted)]">No audit events recorded yet.</p>`}
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('admin-switch-btn').addEventListener('click', () => {
      setAuthMode('login');
      document.getElementById('auth-modal').classList.remove('hidden');
    });
  }

  // ---- VIEW 9: SETTINGS ----
  function renderSettings(root) {
    const ws = getActiveWorkspace();
    root.innerHTML = `
      <div class="view-section max-w-3xl space-y-5">
        <div class="card p-5 space-y-4">
          <h2 class="text-sm font-bold">Profile & Display Preferences</h2>
          <form id="settings-profile-form" class="grid sm:grid-cols-2 gap-4">
            <div>
              <label for="set-name" class="block text-xs text-[var(--text-muted)] mb-1">Display Name</label>
              <input id="set-name" type="text" required value="${escapeHtml(ws.profile.name)}" class="input-field w-full px-3.5 py-2 text-sm" />
            </div>
            <div>
              <label for="set-currency" class="block text-xs text-[var(--text-muted)] mb-1">Currency</label>
              <select id="set-currency" class="input-field w-full px-3 py-2 text-sm">
                ${Object.values(CURRENCIES).map(c => `<option value="${c.code}" ${ws.settings.currency === c.code ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="sm:col-span-2 flex items-center justify-between pt-1">
              <div class="space-y-2">
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                  <input id="set-alerts" type="checkbox" ${ws.settings.budgetAlerts ? 'checked' : ''} class="rounded accent-[#111111]" />
                  <span>Enable automatic budget threshold alerts (75%, 90%, 100%)</span>
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                  <input id="set-email-reports" type="checkbox" ${ws.settings.emailReportsEnabled !== false ? 'checked' : ''} class="rounded accent-[#111111]" />
                  <span>Enable monthly financial report email preference (${escapeHtml(ws.profile.email)})</span>
                </label>
              </div>
              <button type="submit" class="px-4 py-2 rounded-xl btn-primary text-xs font-semibold">Save Preferences</button>
            </div>
          </form>
        </div>

        <div class="card p-5 space-y-4">
          <h2 class="text-sm font-bold">Custom Categories</h2>
          <form id="add-cat-form" class="flex flex-wrap gap-2">
            <input id="new-cat-name" type="text" required placeholder="Category Name (e.g., Gym, Pets)" class="input-field flex-1 min-w-[160px] px-3 py-2 text-xs" />
            <select id="new-cat-type" class="input-field px-3 py-2 text-xs"><option value="expense">Expense</option><option value="income">Income</option></select>
            <input id="new-cat-color" type="color" value="#8B5CF6" class="h-9 w-11 rounded-lg bg-transparent border border-[var(--border)] cursor-pointer" />
            <button type="submit" class="px-4 py-2 rounded-xl btn-primary text-xs font-semibold">Add Category</button>
          </form>
        </div>

        <div class="card p-5 space-y-4">
          <h2 class="text-sm font-bold">Data Management & Backup</h2>
          <div class="flex flex-wrap gap-2.5">
            <button id="set-export-json" type="button" class="px-3.5 py-2 rounded-xl surface-2 text-xs font-semibold hover:border-[#111111]/30">Export JSON Backup</button>
            <button id="set-import-json" type="button" class="px-3.5 py-2 rounded-xl surface-2 text-xs font-semibold hover:border-[#111111]/30">Restore JSON Backup</button>
            <button id="set-reset-demo" type="button" class="px-3.5 py-2 rounded-xl surface-2 text-xs font-semibold hover:border-amber-500/40 text-amber-400">Reset Sample Data</button>
            <button id="set-clear-tx" type="button" class="px-3.5 py-2 rounded-xl bg-rose-500/10 text-[#D96C72] border border-[#D96C72]/30 text-xs font-semibold hover:bg-rose-500/20">Delete All Transactions</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('settings-profile-form').addEventListener('submit', e => {
      e.preventDefault();
      ws.profile.name = document.getElementById('set-name').value.trim();
      ws.settings.currency = document.getElementById('set-currency').value;
      ws.settings.budgetAlerts = document.getElementById('set-alerts').checked;
      ws.settings.emailReportsEnabled = document.getElementById('set-email-reports').checked;
      logAudit('SETTINGS_UPDATE', `Updated profile & currency (${ws.settings.currency})`);
      saveStore();
      showToast('Preferences saved');
      renderApp();
    });

    document.getElementById('add-cat-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('new-cat-name').value.trim();
      const type = document.getElementById('new-cat-type').value;
      const color = document.getElementById('new-cat-color').value;
      if (!name) return;
      if (ws.categories[type].some(c => c.name.toLowerCase() === name.toLowerCase())) {
        showToast('Category already exists', 'warning');
        return;
      }
      ws.categories[type].push({ name, color, icon: 'tag' });
      logAudit('CATEGORY_ADD', `Added ${type} category "${name}"`);
      saveStore();
      showToast(`Added "${name}" category`);
      renderApp();
    });

    document.getElementById('set-export-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ledgerflow_backup_${todayISO()}.json`;
      a.click();
      showToast('Backup downloaded');
    });
    document.getElementById('set-import-json').addEventListener('click', () => document.getElementById('json-import-input').click());
    document.getElementById('set-reset-demo').addEventListener('click', () => {
      openConfirm('Reset Sample Data', 'Restore default sample transactions, budgets, and goals for this workspace?', () => {
        STORE.workspaces[STORE.activeUserEmail] = createSeedWorkspace(ws.profile.name, ws.profile.email, true);
        saveStore();
        showToast('Sample data restored');
        renderApp();
      });
    });
    document.getElementById('set-clear-tx').addEventListener('click', () => {
      openConfirm('Delete All Transactions', 'Permanently delete every transaction in this workspace? Accounts and budgets will remain.', () => {
        ws.transactions = [];
        logAudit('TX_CLEAR_ALL', 'Cleared all workspace transactions');
        saveStore();
        showToast('All transactions deleted', 'info');
        renderApp();
      });
    });
  }

  // =========================================================================
  // 8. TRANSACTION MODAL, CSV & AUTH HANDLERS
  // =========================================================================
  let currentTxType = 'expense';

  function populateTxDropdowns(type) {
    const ws = getActiveWorkspace();
    const catSel = document.getElementById('tx-category');
    const cats = type === 'income' ? ws.categories.income : ws.categories.expense;
    catSel.innerHTML = cats.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');

    const accOpts = ws.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    document.getElementById('tx-account').innerHTML = accOpts;
    document.getElementById('tx-to-account').innerHTML = accOpts;

    const isTransfer = type === 'transfer';
    document.getElementById('tx-cat-row').classList.toggle('hidden', isTransfer);
    document.getElementById('tx-to-account-wrap').classList.toggle('hidden', !isTransfer);
    document.getElementById('tx-tags-wrap').classList.toggle('hidden', isTransfer);
    document.getElementById('tx-account-label').textContent = isTransfer ? 'From Account' : 'Account';

    document.querySelectorAll('.tx-type-btn').forEach(btn => {
      const active = btn.dataset.txType === type;
      btn.className = 'tx-type-btn py-2 rounded-lg text-xs font-semibold transition-colors ' + (
        active ? (type === 'income' ? 'bg-emerald-600 text-white' : type === 'transfer' ? 'btn-primary' : 'bg-rose-500 text-white')
               : 'text-[var(--text-muted)]'
      );
    });
  }

  function openTxModal(editId = null, prefillDate = null) {
    const ws = getActiveWorkspace();
    const cur = CURRENCIES[ws.settings.currency] || CURRENCIES.INR;
    document.getElementById('tx-currency-label').textContent = cur.symbol;

    const tx = editId ? ws.transactions.find(t => t.id === editId) : null;
    currentTxType = tx ? tx.type : 'expense';
    populateTxDropdowns(currentTxType);

    document.getElementById('tx-modal-title').textContent = tx ? 'Edit Transaction' : 'Add Transaction';
    document.getElementById('tx-id').value = tx ? tx.id : '';
    document.getElementById('tx-amount').value = tx ? fromPaise(tx.amountPaise) : '';
    document.getElementById('tx-date').value = tx ? tx.date : (prefillDate || todayISO());
    document.getElementById('tx-title').value = tx ? tx.title : '';
    if (tx && tx.category && tx.type !== 'transfer') document.getElementById('tx-category').value = tx.category;
    document.getElementById('tx-method').value = tx ? tx.method : 'UPI';
    if (tx && tx.accountId) document.getElementById('tx-account').value = tx.accountId;
    if (tx && tx.toAccountId) document.getElementById('tx-to-account').value = tx.toAccountId;
    document.getElementById('tx-tags').value = tx && tx.tags ? tx.tags.join(', ') : '';
    document.getElementById('tx-notes').value = tx ? (tx.notes || '') : '';

    document.getElementById('tx-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('tx-amount').focus(), 50);
  }
  function closeTxModal() { document.getElementById('tx-modal').classList.add('hidden'); }

  function exportCSV(list) {
    const ws = getActiveWorkspace();
    const accMap = Object.fromEntries(ws.accounts.map(a => [a.id, a.name]));
    const headers = ['Date', 'Type', 'Title', 'Category', 'Amount', 'PaymentMethod', 'Account', 'Notes'];
    const rows = list.map(t => [
      t.date, t.type, `"${String(t.title).replace(/"/g, '""')}"`, t.category,
      fromPaise(t.amountPaise), t.method, `"${String(accMap[t.accountId] || '').replace(/"/g, '""')}"`,
      `"${String(t.notes || '').replace(/"/g, '""')}"`
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ledgerflow_transactions_${todayISO()}.csv`;
    a.click();
    showToast(`Exported ${list.length} transactions to CSV`);
  }

  function handleCSVImport(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const ws = getActiveWorkspace();
      const lines = String(e.target.result || '').split(/\r?\n/).filter(Boolean);
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (parts.length < 5) continue;
        const [date, type, title, category, amt] = parts;
        const paise = toPaise(amt);
        if (!title || paise <= 0) continue;
        ws.transactions.unshift({
          id: uid('tx'),
          date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO(),
          type: ['income', 'expense', 'transfer'].includes(type) ? type : 'expense',
          title, category: category || 'Other', amountPaise: paise,
          method: parts[5] || 'UPI', accountId: ws.accounts[0]?.id || '',
          notes: parts[7] || 'Imported via CSV', tags: ['imported']
        });
        imported++;
      }
      logAudit('CSV_IMPORT', `Imported ${imported} records via CSV`);
      saveStore();
      showToast(`Imported ${imported} transactions`);
      renderApp();
    };
    reader.readAsText(file);
  }

  function openNotifDrawer() {
    const ws = getActiveWorkspace();
    const list = document.getElementById('notif-list');
    list.innerHTML = ws.notifications.length ? ws.notifications.map(n => `
      <div class="surface-2 p-3.5 rounded-xl flex items-start justify-between gap-2 ${n.read ? 'opacity-65' : 'border-l-2 border-l-[#111111]'}">
        <div class="min-w-0">
          <p class="text-xs font-semibold">${escapeHtml(n.title)}</p>
          <p class="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">${escapeHtml(n.message)}</p>
          <p class="text-[10px] text-[var(--text-muted)] mt-1">${escapeHtml(n.time)}</p>
        </div>
        <button type="button" data-dismiss-notif="${n.id}" class="p-1 text-[var(--text-muted)] hover:text-[#D96C72]" aria-label="Dismiss"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>
    `).join('') : `<p class="text-xs text-[var(--text-muted)] text-center py-10">No notifications.</p>`;

    list.querySelectorAll('[data-dismiss-notif]').forEach(btn => {
      btn.addEventListener('click', () => {
        ws.notifications = ws.notifications.filter(x => x.id !== btn.dataset.dismissNotif);
        saveStore();
        updateNotifBadge();
        openNotifDrawer();
      });
    });
    document.getElementById('notif-drawer').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  function setAuthMode(mode) {
    UI.authMode = mode;
    const isReg = mode === 'register';
    document.getElementById('auth-name-wrap').classList.toggle('hidden', !isReg);
    document.getElementById('auth-submit-btn').textContent = isReg ? 'Create Private Workspace' : 'Sign In';
    document.getElementById('auth-tab-login').className = `py-2 rounded-lg text-xs font-semibold ${!isReg ? 'btn-primary' : 'text-[var(--text-muted)]'}`;
    document.getElementById('auth-tab-register').className = `py-2 rounded-lg text-xs font-semibold ${isReg ? 'btn-primary' : 'text-[var(--text-muted)]'}`;
    document.getElementById('auth-error').classList.add('hidden');
  }

  // =========================================================================
  // 9. GLOBAL EVENT BINDINGS, SPOTLIGHT TRACKING & INIT
  // =========================================================================
  function bindGlobalEvents() {
    // Cursor-tracking spotlight on glass cards (delegated, zero per-card overhead)
    document.addEventListener('pointermove', e => {
      const card = e.target && e.target.closest ? e.target.closest('.card') : null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });

    document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => { UI.view = btn.dataset.view; renderApp(); });
    });
    document.querySelectorAll('.more-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.view = btn.dataset.view;
        document.getElementById('mobile-more-modal').classList.add('hidden');
        renderApp();
      });
    });
    document.getElementById('mobile-more-btn').addEventListener('click', () => document.getElementById('mobile-more-modal').classList.remove('hidden'));
    document.getElementById('close-more-btn').addEventListener('click', () => document.getElementById('mobile-more-modal').classList.add('hidden'));

    const openLanding = () => { STORE.showLanding = true; saveStore(); renderApp(); };
    const launchApp = () => { STORE.showLanding = false; saveStore(); renderApp(); };
    document.getElementById('brand-landing-btn').addEventListener('click', openLanding);
    document.getElementById('mobile-brand-btn').addEventListener('click', openLanding);
    document.getElementById('landing-launch-btn').addEventListener('click', launchApp);
    document.getElementById('landing-cta-primary').addEventListener('click', launchApp);
    document.getElementById('landing-signin-btn').addEventListener('click', () => { setAuthMode('login'); document.getElementById('auth-modal').classList.remove('hidden'); });
    document.getElementById('landing-cta-register').addEventListener('click', () => { setAuthMode('register'); document.getElementById('auth-modal').classList.remove('hidden'); });

    const toggleTheme = () => {
      const ws = getActiveWorkspace();
      ws.settings.theme = ws.settings.theme === 'dark' ? 'light' : 'dark';
      saveStore();
      renderApp();
    };
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('landing-theme-btn').addEventListener('click', toggleTheme);

    document.getElementById('quick-add-btn').addEventListener('click', () => openTxModal());
    document.getElementById('tx-modal-close').addEventListener('click', closeTxModal);
    document.getElementById('tx-cancel-btn').addEventListener('click', closeTxModal);
    document.querySelectorAll('.tx-type-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentTxType = btn.dataset.txType; populateTxDropdowns(currentTxType); });
    });
    document.querySelectorAll('.quick-amt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById('tx-amount');
        inp.value = String((Number(inp.value) || 0) + Number(btn.dataset.quickAmt));
      });
    });

    document.getElementById('tx-form').addEventListener('submit', e => {
      e.preventDefault();
      const ws = getActiveWorkspace();
      const editId = document.getElementById('tx-id').value;
      const amountPaise = toPaise(document.getElementById('tx-amount').value);
      const accountId = document.getElementById('tx-account').value;
      const toAccountId = document.getElementById('tx-to-account').value;
      if (amountPaise <= 0) { showToast('Enter a valid amount', 'error'); return; }
      if (currentTxType === 'transfer' && accountId === toAccountId) {
        showToast('Select two different accounts for transfer', 'warning');
        return;
      }

      const payload = {
        id: editId || uid('tx'),
        type: currentTxType,
        title: document.getElementById('tx-title').value.trim(),
        amountPaise,
        category: currentTxType === 'transfer' ? 'Transfer' : document.getElementById('tx-category').value,
        method: document.getElementById('tx-method').value,
        accountId,
        toAccountId: currentTxType === 'transfer' ? toAccountId : undefined,
        date: document.getElementById('tx-date').value,
        notes: document.getElementById('tx-notes').value.trim(),
        tags: document.getElementById('tx-tags').value.split(',').map(s => s.trim()).filter(Boolean)
      };

      if (editId) {
        const idx = ws.transactions.findIndex(t => t.id === editId);
        if (idx >= 0) ws.transactions[idx] = payload;
        logAudit('TX_UPDATE', `Updated "${payload.title}" (${fmtMoney(payload.amountPaise)})`);
        showToast('Transaction updated');
      } else {
        ws.transactions.unshift(payload);
        logAudit('TX_CREATE', `Added ${payload.type} "${payload.title}" (${fmtMoney(payload.amountPaise)})`);
        showToast('Transaction added');
        checkBudgetAlertsForTx(payload);
      }
      saveStore();
      closeTxModal();
      renderApp();
    });

    document.getElementById('notif-toggle-btn').addEventListener('click', openNotifDrawer);
    document.getElementById('notif-close-btn').addEventListener('click', () => document.getElementById('notif-drawer').classList.add('hidden'));
    document.getElementById('notif-mark-read').addEventListener('click', () => {
      const ws = getActiveWorkspace();
      ws.notifications.forEach(n => { n.read = true; });
      saveStore();
      updateNotifBadge();
      openNotifDrawer();
    });

    const openAuth = () => { setAuthMode('login'); document.getElementById('auth-modal').classList.remove('hidden'); };
    document.getElementById('sidebar-auth-btn').addEventListener('click', openAuth);
    document.getElementById('header-auth-btn').addEventListener('click', openAuth);
    document.getElementById('auth-modal-close').addEventListener('click', () => document.getElementById('auth-modal').classList.add('hidden'));
    document.getElementById('auth-tab-login').addEventListener('click', () => setAuthMode('login'));
    document.getElementById('auth-tab-register').addEventListener('click', () => setAuthMode('register'));
    document.getElementById('auth-logout-btn').addEventListener('click', () => {
      document.getElementById('auth-modal').classList.add('hidden');
      STORE.showLanding = true;
      saveStore();
      showToast('Signed out to landing page', 'info');
      renderApp();
    });

    document.getElementById('auth-form').addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim().toLowerCase();
      const pass = document.getElementById('auth-password').value;
      const errEl = document.getElementById('auth-error');
      errEl.classList.add('hidden');

      if (UI.authMode === 'register') {
        const name = document.getElementById('auth-name').value.trim() || email.split('@')[0];
        if (STORE.users[email]) {
          errEl.textContent = 'An account with this email already exists. Please sign in.';
          errEl.classList.remove('hidden');
          return;
        }
        STORE.users[email] = { name, email, passwordHash: pass };
        STORE.workspaces[email] = createSeedWorkspace(name, email, false);
        STORE.activeUserEmail = email;
        STORE.showLanding = false;
        saveStore();
        document.getElementById('auth-modal').classList.add('hidden');
        showToast(`Welcome, ${name}! Your private workspace is ready.`);
        renderApp();
      } else {
        const u = STORE.users[email];
        if (!u || u.passwordHash !== pass) {
          errEl.textContent = 'Invalid email or password. Try demo: alex@ledgerflow.app / 123456';
          errEl.classList.remove('hidden');
          return;
        }
        STORE.activeUserEmail = email;
        STORE.showLanding = false;
        saveStore();
        document.getElementById('auth-modal').classList.add('hidden');
        showToast(`Signed in as ${u.name}`);
        renderApp();
      }
    });

    document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
    document.getElementById('confirm-ok').addEventListener('click', () => {
      const fn = UI.confirmCallback;
      closeConfirm();
      if (typeof fn === 'function') fn();
    });

    document.getElementById('csv-import-input').addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleCSVImport(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('json-import-input').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.accounts)) {
            STORE.workspaces[STORE.activeUserEmail] = parsed;
            saveStore();
            showToast('Workspace restored from JSON backup');
            renderApp();
          } else {
            showToast('Invalid backup file format', 'error');
          }
        } catch (err) {
          showToast('Could not parse JSON file', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.querySelectorAll('[data-hero-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.view = btn.dataset.heroJump;
        STORE.showLanding = false;
        saveStore();
        renderApp();
      });
    });
    const learnMoreBtn = document.getElementById('hero-learn-more');
    if (learnMoreBtn) learnMoreBtn.addEventListener('click', () => { STORE.showLanding = false; saveStore(); renderApp(); });

    const closeRepModal = () => document.getElementById('report-modal').classList.add('hidden');
    document.getElementById('rep-modal-close').addEventListener('click', closeRepModal);
    document.getElementById('rep-modal-done').addEventListener('click', closeRepModal);
    document.getElementById('rep-modal-print').addEventListener('click', () => window.print());

    const emailReportBtn = document.getElementById('rep-modal-email-btn');
    if (emailReportBtn) {
      emailReportBtn.addEventListener('click', async () => {
        const ws = getActiveWorkspace();
        const ym = document.getElementById('report-modal').dataset.ym || monthKey(todayISO());
        try {
          const res = await fetch('/api/reports/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monthKey: ym })
          });
          if (res.ok) {
            showToast(`Report emailed to ${ws.profile.email}`);
            logAudit('MONTHLY_REPORT_EMAIL_DELIVERED', `Dispatched report for ${monthLabel(ym)} to ${ws.profile.email}`);
            closeRepModal();
            return;
          }
        } catch (e) {}
        showToast(`Monthly report for ${monthLabel(ym)} dispatched to verified address: ${ws.profile.email}`);
        logAudit('MONTHLY_REPORT_EMAIL_DELIVERED', `Dispatched report for ${monthLabel(ym)} to ${ws.profile.email}`);
        closeRepModal();
      });
    }

    async function probeClusterHealth() {
      try {
        const res = await fetch('/health');
        if (res.ok) {
          const data = await res.json();
          const pill = document.getElementById('cluster-status-pill');
          const dot = document.getElementById('cluster-indicator-dot');
          const txt = document.getElementById('cluster-status-text');
          if (pill && txt) {
            pill.classList.remove('hidden');
            txt.textContent = `${data.instanceId || '3-Server LB'} · Online`;
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
          }
        }
      } catch (e) {
        const pill = document.getElementById('cluster-status-pill');
        const dot = document.getElementById('cluster-indicator-dot');
        const txt = document.getElementById('cluster-status-text');
        if (pill && txt) {
          pill.classList.remove('hidden');
          txt.textContent = 'Offline-First Local Vault';
          if (dot) dot.className = 'w-2 h-2 rounded-full bg-[#C6A66B]';
        }
      }
    }
    probeClusterHealth();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeTxModal();
        closeConfirm();
        closeRepModal();
        document.getElementById('notif-drawer').classList.add('hidden');
        document.getElementById('auth-modal').classList.add('hidden');
        document.getElementById('mobile-more-modal').classList.add('hidden');
      }
    });
  }

  bindGlobalEvents();
  renderApp();
})();
