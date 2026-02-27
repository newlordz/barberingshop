const API = '/api';

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

let currentUser = null;

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });
  const data = res.ok ? (await res.json().catch(() => ({}))) : null;
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ----- Auth -----
async function checkAuth() {
  try {
    currentUser = await api('/auth/me');
    return true;
  } catch {
    currentUser = null;
    return false;
  }
}

function renderLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
  const cp = document.getElementById('change-password-view');
  if (cp) cp.classList.add('hidden');
}

function renderChangePassword() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.add('hidden');
  document.getElementById('change-password-view').classList.remove('hidden');
}

function renderApp() {
  document.getElementById('login-view').classList.add('hidden');
  const cp = document.getElementById('change-password-view');
  if (cp) cp.classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  document.getElementById('sidebar-username').textContent = currentUser.username;
  document.getElementById('sidebar-role').textContent = currentUser.role === 'admin' ? 'Admin' : 'Barber';
  document.querySelectorAll('.sidebar nav a[data-admin]').forEach((a) => {
    a.style.display = currentUser.role === 'admin' ? '' : 'none';
  });
  document.querySelectorAll('.sidebar nav a[data-barber-only]').forEach((a) => {
    a.style.display = currentUser.role !== 'admin' ? '' : 'none';
  });
  const resetBtn = document.getElementById('request-password-reset-btn');
  if (resetBtn) {
    resetBtn.style.display = currentUser.role === 'barber' ? '' : 'none';
    resetBtn.onclick = async () => {
      try {
        await api('/auth/request-password-reset', { method: 'POST' });
        toast('Request sent. Admin will approve it; you can then set a new password.');
      } catch (err) {
        toast(err.data?.error || err.message || 'Failed', 'error');
      }
    };
  }
  document.getElementById('logout-btn').onclick = () => {
    api('/auth/logout', { method: 'POST' }).then(() => {
      currentUser = null;
      renderLogin();
    });
  };
  initRouter();
}

document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('.password-toggle');
  if (!btn) return;
  e.preventDefault();
  const wrap = btn.closest('.password-wrap');
  const input = wrap?.querySelector('input');
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  btn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
  btn.textContent = isPassword ? '🙈' : '👁';
});

// Mobile menu toggle
document.getElementById('mobile-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
});

// Close sidebar on link click
document.querySelectorAll('.sidebar nav a').forEach((a) => {
  a.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  });
});

// Theme toggle
document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  if (newTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('theme');
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    currentUser = data;
    if (currentUser.requiresPasswordChange) {
      renderChangePassword();
      return;
    }
    currentUser = await api('/auth/me');
    renderApp();
    navigateTo('dashboard');
  } catch (err) {
    errEl.textContent = err.data?.error || err.message || 'Login failed';
    errEl.classList.remove('hidden');
  }
});

document.getElementById('change-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('change-pw-error');
  errEl.classList.add('hidden');
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  if (newPassword.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters';
    errEl.classList.remove('hidden');
    return;
  }
  if (newPassword !== confirmPassword) {
    errEl.textContent = 'Passwords do not match';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword, confirmPassword }),
    });
    currentUser = await api('/auth/me');
    renderApp();
    navigateTo('dashboard');
    toast('Password set. You’re all set.');
  } catch (err) {
    errEl.textContent = err.data?.error || err.message || 'Failed to set password';
    errEl.classList.remove('hidden');
  }
});

// ----- Router -----
function getHashRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  return hash.split('?')[0];
}

function initRouter() {
  const nav = document.querySelector('.sidebar nav');
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-route]');
    if (!a) return;
    e.preventDefault();
    navigateTo(a.dataset.route);
  });
  window.addEventListener('hashchange', () => navigateTo(getHashRoute()));
  navigateTo(getHashRoute());
}

function navigateTo(route) {
  if (route === 'record' && currentUser?.role === 'admin') {
    window.location.hash = 'dashboard';
    route = 'dashboard';
  }
  document.querySelectorAll('.sidebar nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });
  const content = document.getElementById('page-content');
  content.innerHTML = '';
  const handlers = {
    dashboard: renderDashboard,
    record: renderRecord,
    visits: renderVisits,
    barbers: renderBarbers,
    services: renderServices,
    reports: renderReports,
    users: renderUsers,
    'password-requests': renderPasswordRequests,
  };
  const fn = handlers[route];
  if (fn) fn(content);
  else renderDashboard(content);
}

// ----- Dashboard -----
async function renderDashboard(container) {
  container.innerHTML = '<p class="page-title">Dashboard</p><p class="loading-text">Loading…</p>';
  const summary = await api('/reports/summary');
  const isBarber = currentUser.role === 'barber';
  const sectionTitle = isBarber ? 'Your performance' : 'Sales by barber';
  container.innerHTML = `
    <p class="page-title">Dashboard</p>
    <p class="page-desc">${isBarber ? 'Your visits and revenue.' : 'Overview of all barbers and revenue.'}</p>
    <div class="stats">
      <div class="stat stat-card">
        <div class="value">${summary.overall.total_visits}</div>
        <div class="label">${isBarber ? 'Your visits' : 'Total visits'}</div>
      </div>
      <div class="stat stat-card">
        <div class="value">$${Number(summary.overall.total_revenue).toFixed(2)}</div>
        <div class="label">${isBarber ? 'Your revenue' : 'Total revenue'}</div>
      </div>
    </div>
    <div class="card card-elevated">
      <div class="card-header"><h3>${sectionTitle}</h3></div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Barber</th><th>Visits</th><th>Revenue</th></tr></thead>
          <tbody>
            ${summary.byBarber.map((b) => `
              <tr>
                <td>${escapeHtml(b.name)}</td>
                <td>${b.visit_count}</td>
                <td>$${Number(b.total_sales).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ----- Record visit (barbers only) -----
async function renderRecord(container) {
  const [barbers, services] = await Promise.all([api('/barbers'), api('/services')]);
  const barber = barbers.find((b) => b.id === currentUser.barberId);
  const barberName = barber ? barber.name : '';
  const barberIdVal = currentUser.barberId || '';

  container.innerHTML = `
    <div class="record-page">
      <div class="record-hero">
        <h1 class="record-title">New visit</h1>
        <p class="record-subtitle">Recording as <strong>${escapeHtml(barberName)}</strong></p>
      </div>
      <form id="record-form" class="record-form">
        <div class="record-grid">
          <input type="hidden" id="record-barber" value="${barberIdVal}">
          <section class="record-panel record-panel-left">
            <h2 class="record-panel-title">Customer & date</h2>
            <div class="form-group record-customer-wrap">
              <label class="record-label">Customer</label>
              <input type="text" id="record-customer-search" class="record-input record-input-lg" placeholder="Type name to search or add new" autocomplete="off">
              <input type="hidden" id="record-customer-id" name="customer_id">
              <div id="customer-suggestions" class="record-suggestions"></div>
            </div>
            <div class="form-group">
              <label class="record-label">Date</label>
              <input type="date" id="record-date" name="visit_date" class="record-input record-input-lg" required value="${new Date().toISOString().slice(0, 10)}">
            </div>
          </section>
          <section class="record-panel record-panel-right">
            <h2 class="record-panel-title">Services</h2>
            <p class="record-hint">Choose one or more hair cut styles</p>
            <div id="record-services" class="record-services-list">
              <div class="visit-service-row record-service-row">
                <select class="record-service-select record-input" name="service_id" required>
                  <option value="">Select style</option>
                  ${services.map((s) => `<option value="${s.id}" data-price="${s.price}">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</option>`).join('')}
                </select>
                <input type="number" class="record-qty record-input record-qty-input" value="1" min="1" max="99" aria-label="Quantity">
                <span class="record-line-price">$0.00</span>
                <button type="button" class="record-remove-btn record-remove" aria-label="Remove">×</button>
              </div>
            </div>
            <button type="button" class="btn btn-ghost record-add-service" id="add-service-row">+ Add another service</button>
            <div class="record-total-wrap">
              <span class="record-total-label">Total</span>
              <span class="record-total" id="record-total">$0.00</span>
            </div>
          </section>
        </div>
        <div class="record-payment-section">
          <h2 class="record-panel-title">Payment</h2>
          <div class="payment-method-options">
            <label class="payment-option">
              <input type="radio" name="payment_method" value="cash" checked>
              <span class="payment-option-label">Cash</span>
            </label>
            <label class="payment-option">
              <input type="radio" name="payment_method" value="momo">
              <span class="payment-option-label">MoMo</span>
            </label>
          </div>
          <div id="record-momo-wrap" class="form-group record-momo-wrap hidden">
            <label class="record-label">MoMo reference number</label>
            <input type="text" id="record-momo-reference" class="record-input" placeholder="e.g. 123456789" maxlength="50">
          </div>
        </div>
        <div class="record-footer">
          <div class="form-group record-notes-wrap">
            <label class="record-label">Notes <span class="record-optional">(optional)</span></label>
            <textarea id="record-notes" name="notes" class="record-input record-notes-input" rows="2" placeholder="Any notes for this visit…"></textarea>
          </div>
          <button type="submit" class="btn btn-primary record-submit">Save visit</button>
        </div>
      </form>
    </div>
  `;

  const customerSearch = document.getElementById('record-customer-search');
  const customerIdInput = document.getElementById('record-customer-id');
  const suggestionsEl = document.getElementById('customer-suggestions');
  let suggestionTimeout;
  customerSearch.addEventListener('input', () => {
    clearTimeout(suggestionTimeout);
    const q = customerSearch.value.trim();
    if (q.length < 2) {
      suggestionsEl.classList.remove('is-open');
      suggestionsEl.innerHTML = '';
      customerIdInput.value = '';
      return;
    }
    suggestionTimeout = setTimeout(async () => {
      const list = await api('/customers?q=' + encodeURIComponent(q));
      suggestionsEl.innerHTML = list.length
        ? list.map((c) =>
          `<button type="button" class="suggestion-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}${c.phone ? ' <span class="suggestion-phone">' + escapeHtml(c.phone) + '</span>' : ''}</button>`
        ).join('')
        : `<button type="button" class="suggestion-item suggestion-item-new" data-id="" data-name="${escapeHtml(q)}">Create new: "${escapeHtml(q)}"</button>`;
      suggestionsEl.classList.add('is-open');
      suggestionsEl.querySelectorAll('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
          customerIdInput.value = item.dataset.id || '';
          customerSearch.value = item.dataset.name || '';
          suggestionsEl.classList.remove('is-open');
        });
      });
    }, 200);
  });
  customerSearch.addEventListener('blur', () => setTimeout(() => suggestionsEl.classList.remove('is-open'), 180));

  const serviceRows = container.querySelector('#record-services');
  function addServiceRow() {
    const row = document.createElement('div');
    row.className = 'visit-service-row record-service-row';
    row.innerHTML = `
      <select class="record-service-select record-input" name="service_id"><option value="">Select style</option>${services.map((s) => `<option value="${s.id}" data-price="${s.price}">${escapeHtml(s.name)} — $${Number(s.price).toFixed(2)}</option>`).join('')}</select>
      <input type="number" class="record-qty record-input record-qty-input" value="1" min="1" max="99" aria-label="Quantity">
      <span class="record-line-price">$0.00</span>
      <button type="button" class="record-remove-btn record-remove" aria-label="Remove">×</button>
    `;
    row.querySelector('.record-remove').onclick = () => { row.remove(); updateRecordTotal(); };
    row.querySelector('select').onchange = updateRecordTotal;
    row.querySelector('input').oninput = updateRecordTotal;
    serviceRows.appendChild(row);
  }
  function updateRecordTotal() {
    let total = 0;
    container.querySelectorAll('.record-service-row').forEach((row) => {
      const sel = row.querySelector('.record-service-select');
      const qty = parseInt(row.querySelector('.record-qty').value, 10) || 0;
      const price = parseFloat(sel?.selectedOptions[0]?.dataset?.price || 0);
      const line = price * qty;
      total += line;
      const span = row.querySelector('.record-line-price');
      if (span) span.textContent = '$' + line.toFixed(2);
    });
    const totalEl = document.getElementById('record-total');
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
  }
  container.querySelector('#add-service-row').onclick = addServiceRow;
  container.querySelectorAll('.record-service-select').forEach((s) => (s.onchange = updateRecordTotal));
  container.querySelectorAll('.record-qty').forEach((s) => (s.oninput = updateRecordTotal));
  container.querySelector('.record-remove').onclick = function () {
    this.closest('.record-service-row').remove();
    updateRecordTotal();
  };
  updateRecordTotal();

  const momoWrap = document.getElementById('record-momo-wrap');
  const momoInput = document.getElementById('record-momo-reference');
  container.querySelectorAll('input[name="payment_method"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isMomo = document.querySelector('input[name="payment_method"]:checked')?.value === 'momo';
      momoWrap.classList.toggle('hidden', !isMomo);
      if (!isMomo) momoInput.value = '';
    });
  });

  container.querySelector('#record-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customerName = customerSearch.value.trim();
    if (!customerName) {
      toast('Enter or select a customer', 'error');
      customerSearch.focus();
      return;
    }
    let cid = customerIdInput.value;
    if (!cid) {
      const created = await api('/customers', { method: 'POST', body: JSON.stringify({ name: customerName }) });
      cid = created.id;
    }
    const servicesList = [];
    container.querySelectorAll('.record-service-row').forEach((row) => {
      const sel = row.querySelector('.record-service-select');
      const opt = sel?.selectedOptions[0];
      if (!opt || !opt.value) return;
      const price = parseFloat(opt.dataset.price);
      const qty = parseInt(row.querySelector('.record-qty').value, 10) || 1;
      servicesList.push({ service_id: parseInt(opt.value, 10), quantity: qty, unit_price: price });
    });
    if (servicesList.length === 0) {
      toast('Add at least one service', 'error');
      return;
    }
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'cash';
    const momoReference = document.getElementById('record-momo-reference').value.trim();
    if (paymentMethod === 'momo' && !momoReference) {
      toast('Enter MoMo reference number', 'error');
      return;
    }
    try {
      await api('/visits', {
        method: 'POST',
        body: JSON.stringify({
          barber_id: parseInt(document.getElementById('record-barber').value, 10),
          customer_id: cid,
          visit_date: document.getElementById('record-date').value,
          services: servicesList,
          notes: document.getElementById('record-notes').value.trim(),
          payment_method: paymentMethod,
          momo_reference: paymentMethod === 'momo' ? momoReference : null,
        }),
      });
      toast('Visit recorded');
      customerIdInput.value = '';
      customerSearch.value = '';
      document.getElementById('record-notes').value = '';
      document.getElementById('record-momo-reference').value = '';
      document.querySelector('input[name="payment_method"][value="cash"]').checked = true;
      momoWrap.classList.add('hidden');
      container.querySelectorAll('.record-service-row').forEach((r, i) => {
        if (i > 0) r.remove();
        else {
          r.querySelector('select').selectedIndex = 0;
          r.querySelector('.record-qty').value = 1;
        }
      });
      updateRecordTotal();
    } catch (err) {
      toast(err.data?.error || err.message || 'Failed to save', 'error');
    }
  });
}

// ----- Visits list -----
async function renderVisits(container) {
  container.innerHTML = '<p class="page-title">Visits</p><p>Loading…</p>';
  const barbers = await api('/barbers');
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  const defaultFrom = from.toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);
  let list = await api(`/visits?from=${defaultFrom}&to=${defaultTo}`);
  const filterBarber = currentUser.role === 'admin' ? `
    <select id="visits-barber">
      <option value="">All barbers</option>
      ${barbers.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
    </select>
  ` : '';
  container.innerHTML = `
    <p class="page-title">Visits</p>
    <p class="page-desc">${currentUser.role === 'admin' ? 'All visits. Filter by date and barber.' : 'Your recorded visits.'}</p>
    <div class="filters filters-styled">
      <input type="date" id="visits-from" class="input-styled">
      <input type="date" id="visits-to" class="input-styled">
      ${filterBarber}
      <button type="button" class="btn btn-primary" id="visits-refresh">Refresh</button>
    </div>
    <div class="card card-elevated">
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Date</th><th>Barber</th><th>Customer</th><th>Services</th><th>Payment</th><th>Amount</th></tr></thead>
          <tbody id="visits-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('visits-from').value = defaultFrom;
  document.getElementById('visits-to').value = defaultTo;
  if (document.getElementById('visits-barber')) document.getElementById('visits-barber').className = 'input-styled';
  function renderTable(visits) {
    const tbody = document.getElementById('visits-tbody');
    tbody.innerHTML = visits
      .map(
        (v) => {
          const pay = (v.payment_method || 'cash').toLowerCase();
          const payLabel = pay === 'momo' ? 'MoMo' : 'Cash';
          const ref = pay === 'momo' && v.momo_reference ? ` <span class="payment-ref">${escapeHtml(v.momo_reference)}</span>` : '';
          return `
        <tr>
          <td>${v.visit_date}</td>
          <td>${escapeHtml(v.barber_name)}</td>
          <td>${escapeHtml(v.customer_name)}</td>
          <td>${(v.services || []).map((s) => `${s.service_name}${s.quantity > 1 ? ' ×' + s.quantity : ''}`).join(', ') || '—'}</td>
          <td><span class="badge badge-${pay}">${payLabel}</span>${ref}</td>
          <td>$${Number(v.total_amount).toFixed(2)}</td>
        </tr>
      `;
        }
      )
      .join('') || '<tr><td colspan="6">No visits in this range.</td></tr>';
  }
  renderTable(list);
  async function refresh() {
    const from = document.getElementById('visits-from').value;
    const to = document.getElementById('visits-to').value;
    const barberId = document.getElementById('visits-barber')?.value || '';
    list = await api(`/visits?from=${from}&to=${to}${barberId ? '&barber_id=' + barberId : ''}`);
    renderTable(list);
  }
  document.getElementById('visits-refresh').onclick = refresh;
  document.getElementById('visits-from').onchange = refresh;
  document.getElementById('visits-to').onchange = refresh;
  const barberSel = document.getElementById('visits-barber');
  if (barberSel) barberSel.onchange = refresh;
}

// ----- Barbers (admin) -----
async function renderBarbers(container) {
  if (currentUser.role !== 'admin') return;
  let list = await api('/barbers');
  container.innerHTML = `
    <p class="page-title">Barbers</p>
    <p class="page-desc">Add or remove barbers. Link them to a user under Users.</p>
    <div class="card card-elevated">
      <div class="card-header">
        <h3>Barbers</h3>
        <form id="barber-form" class="barber-form-inline">
          <input type="text" id="barber-name" class="input-styled" placeholder="Barber name" required>
          <button type="submit" class="btn btn-primary">Add barber</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Name</th><th></th></tr></thead>
          <tbody id="barbers-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  function renderRows() {
    document.getElementById('barbers-tbody').innerHTML = list
      .map(
        (b) => `
        <tr>
          <td>${escapeHtml(b.name)}</td>
          <td><button type="button" class="btn btn-danger btn-sm" data-id="${b.id}">Remove</button></td>
        </tr>
      `
      )
      .join('');
    container.querySelectorAll('#barbers-tbody button').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Remove this barber? This will not delete their past visits.')) return;
        await api('/barbers/' + btn.dataset.id, { method: 'DELETE' });
        list = await api('/barbers');
        renderRows();
        toast('Barber removed');
      };
    });
  }
  renderRows();
  document.getElementById('barber-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('barber-name').value.trim();
    if (!name) return;
    await api('/barbers', { method: 'POST', body: JSON.stringify({ name }) });
    document.getElementById('barber-name').value = '';
    list = await api('/barbers');
    renderRows();
    toast('Barber added');
  });
}

// ----- Hair cut styles (admin) -----
async function renderServices(container) {
  if (currentUser.role !== 'admin') return;
  let list = await api('/services');
  container.innerHTML = `
    <p class="page-title">Hair cut styles</p>
    <p class="page-desc">Add or remove styles that barbers can select when recording visits.</p>
    <div class="card card-elevated">
      <div class="card-header">
        <h3>Add new style</h3>
        <form id="service-form" class="service-form-inline">
          <input type="text" id="service-name" class="record-input" placeholder="Style name (e.g. Fade, Buzz)" required>
          <input type="number" id="service-price" class="record-input" placeholder="Price" step="0.01" min="0" required>
          <button type="submit" class="btn btn-primary">Add style</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Style</th><th>Price</th><th></th></tr></thead>
          <tbody id="services-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  function renderRows() {
    document.getElementById('services-tbody').innerHTML = list
      .map(
        (s) => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>$${Number(s.price).toFixed(2)}</td>
          <td><button type="button" class="btn btn-danger btn-sm" data-id="${s.id}">Remove</button></td>
        </tr>
      `
      )
      .join('');
    container.querySelectorAll('#services-tbody button').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Remove this service?')) return;
        await api('/services/' + btn.dataset.id, { method: 'DELETE' });
        list = await api('/services');
        renderRows();
        toast('Service removed');
      };
    });
  }
  renderRows();
  document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('service-name').value.trim();
    const price = parseFloat(document.getElementById('service-price').value);
    if (!name || isNaN(price) || price < 0) return;
    await api('/services', { method: 'POST', body: JSON.stringify({ name, price }) });
    document.getElementById('service-name').value = '';
    document.getElementById('service-price').value = '';
    list = await api('/services');
    renderRows();
    toast('Service added');
  });
}

// ----- Reports (admin) -----
async function renderReports(container) {
  if (currentUser.role !== 'admin') return;
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  const defaultFrom = from.toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);
  let summary = await api(`/reports/summary?from=${defaultFrom}&to=${defaultTo}`);
  container.innerHTML = `
    <p class="page-title">Reports</p>
    <p class="page-desc">Monitor progress by barber and by service. Use date range to filter.</p>
    <div class="filters filters-styled">
      <input type="date" id="reports-from" class="input-styled" value="${defaultFrom}">
      <input type="date" id="reports-to" class="input-styled" value="${defaultTo}">
      <button type="button" class="btn btn-primary" id="reports-refresh">Update</button>
    </div>
    <div class="stats">
      <div class="stat stat-card">
        <div class="value">${summary.overall.total_visits}</div>
        <div class="label">Total visits</div>
      </div>
      <div class="stat stat-card">
        <div class="value">$${Number(summary.overall.total_revenue).toFixed(2)}</div>
        <div class="label">Total revenue</div>
      </div>
    </div>
    <div class="card card-elevated">
      <div class="card-header"><h3>By barber</h3></div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Barber</th><th>Visits</th><th>Revenue</th></tr></thead>
          <tbody id="reports-barbers"></tbody>
        </table>
      </div>
    </div>
    <div class="card card-elevated">
      <div class="card-header"><h3>By service</h3></div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Service</th><th>Times rendered</th><th>Revenue</th></tr></thead>
          <tbody id="reports-services"></tbody>
        </table>
      </div>
    </div>
  `;
  function fill() {
    document.getElementById('reports-barbers').innerHTML = summary.byBarber
      .map(
        (b) => `<tr><td>${escapeHtml(b.name)}</td><td>${b.visit_count}</td><td>$${Number(b.total_sales).toFixed(2)}</td></tr>`
      )
      .join('');
    document.getElementById('reports-services').innerHTML = (summary.byService || [])
      .map(
        (s) => `<tr><td>${escapeHtml(s.name)}</td><td>${s.times_rendered}</td><td>$${Number(s.revenue).toFixed(2)}</td></tr>`
      )
      .join('');
  }
  fill();
  document.getElementById('reports-refresh').onclick = async () => {
    const from = document.getElementById('reports-from').value;
    const to = document.getElementById('reports-to').value;
    summary = await api(`/reports/summary?from=${from}&to=${to}`);
    fill();
  };
}

// ----- Users (admin) -----
async function renderUsers(container) {
  if (currentUser.role !== 'admin') return;
  let list = await api('/users');
  const barbers = await api('/barbers');
  container.innerHTML = `
    <p class="page-title">Users</p>
    <p class="page-desc">Add barber logins. New barbers must set their own password on first sign-in.</p>
    <div class="card card-elevated">
      <div class="card-header">
        <h3>Add barber login</h3>
        <form id="user-form" class="user-form-inline">
          <input type="text" id="user-username" class="input-styled" placeholder="Username" required>
          <div class="password-wrap password-wrap-inline">
            <input type="password" id="user-password" class="input-styled" placeholder="Password" required>
            <button type="button" class="password-toggle" aria-label="Show password" title="Show password">👁</button>
          </div>
          <select id="user-barber" class="input-styled">
            <option value="">No barber linked</option>
            ${barbers.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
          </select>
          <button type="submit" class="btn btn-primary">Add user</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Username</th><th>Role</th><th>Barber</th><th>Actions</th></tr></thead>
          <tbody id="users-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('users-tbody').innerHTML = list
    .map(
      (u) => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td>${u.barber_name ? escapeHtml(u.barber_name) : '—'}</td>
        <td>
          <button type="button" class="btn btn-warning btn-sm reset-user-pw" data-id="${u.id}">Reset Password</button>
        </td>
      </tr>
    `
    )
    .join('');
  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value;
    const barber_id = document.getElementById('user-barber').value || null;
    try {
      await api('/users/barber', {
        method: 'POST',
        body: JSON.stringify({ username, password, barber_id: barber_id ? parseInt(barber_id, 10) : null }),
      });
      document.getElementById('user-username').value = '';
      document.getElementById('user-password').value = '';
      document.getElementById('user-barber').value = '';
      list = await api('/users');
      document.getElementById('users-tbody').innerHTML = list
        .map(
          (u) => `
          <tr>
            <td>${escapeHtml(u.username)}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td>${u.barber_name ? escapeHtml(u.barber_name) : '—'}</td>
            <td>
              <button type="button" class="btn btn-warning btn-sm reset-user-pw" data-id="${u.id}">Reset Password</button>
            </td>
          </tr>
        `
        )
        .join('');
      attachResetListeners();
      toast('User added');
    } catch (err) {
      toast(err.data?.error || err.message || 'Failed', 'error');
    }
  });

  function attachResetListeners() {
    container.querySelectorAll('.reset-user-pw').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Are you sure you want to reset this user's password to the default?")) return;
        try {
          await api('/users/' + btn.dataset.id + '/reset-password', { method: 'POST' });
          toast('Password reset to default (password).');
        } catch (err) {
          toast(err.data?.error || err.message || 'Failed to reset', 'error');
        }
      };
    });
  }
  attachResetListeners();
}

// ----- Password requests (admin) -----
async function renderPasswordRequests(container) {
  if (currentUser.role !== 'admin') return;
  container.innerHTML = '<p class="page-title">Password requests</p><p class="loading-text">Loading…</p>';
  let list = await api('/password-requests');
  container.innerHTML = `
    <p class="page-title">Password requests</p>
    <p class="page-desc">Barbers request a password reset here. Approve to reset their password to the default (password).</p>
    <div class="card card-elevated">
      <div class="card-header">
        <h3>Pending requests</h3>
        <button type="button" class="btn btn-ghost btn-sm" id="password-requests-refresh">Refresh</button>
      </div>
      <div class="table-wrap">
        <table class="table-styled">
          <thead><tr><th>Username</th><th>Barber</th><th>Requested</th><th></th></tr></thead>
          <tbody id="password-requests-tbody"></tbody>
        </table>
      </div>
      <div id="password-requests-empty" class="empty-state hidden">No pending requests.</div>
    </div>
  `;
  function renderRows() {
    const tbody = document.getElementById('password-requests-tbody');
    const empty = document.getElementById('password-requests-empty');
    if (list.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.innerHTML = list
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.username)}</td>
          <td>${r.barber_name ? escapeHtml(r.barber_name) : '—'}</td>
          <td>${new Date(r.requested_at).toLocaleString()}</td>
          <td>
            <button type="button" class="btn btn-primary btn-sm approve-reset" data-id="${r.id}">Approve</button>
            <button type="button" class="btn btn-danger btn-sm reject-reset" data-id="${r.id}">Reject</button>
          </td>
        </tr>
      `
      )
      .join('');
    container.querySelectorAll('.approve-reset').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api('/password-requests/' + btn.dataset.id + '/approve', { method: 'POST' });
          list = await api('/password-requests');
          renderRows();
          toast('Approved. Barber password reset to default (password).');
        } catch (err) {
          toast(err.data?.error || err.message || 'Failed', 'error');
        }
      };
    });
    container.querySelectorAll('.reject-reset').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api('/password-requests/' + btn.dataset.id + '/reject', { method: 'POST' });
          list = await api('/password-requests');
          renderRows();
          toast('Request rejected.');
        } catch (err) {
          toast(err.data?.error || err.message || 'Failed', 'error');
        }
      };
    });
  }
  renderRows();
  document.getElementById('password-requests-refresh').onclick = async () => {
    list = await api('/password-requests');
    renderRows();
  };
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ----- Bootstrap -----
(async () => {
  const ok = await checkAuth();
  if (ok) {
    if (currentUser.requiresPasswordChange) {
      renderChangePassword();
      return;
    }
    renderApp();
    navigateTo(getHashRoute());
  } else {
    renderLogin();
  }
})();
