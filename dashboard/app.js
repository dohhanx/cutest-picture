// Northline. impliedOf multiplies the curve's stored factors and must match the board.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA || !DATA.rows) {
    document.getElementById('board').textContent = 'Northline has no data.js beside this page.';
    return;
  }

  var state = {
    tab: 'board', q: '', category: 'all', chain: 'all', tvl: 'all', mechanism: 'all', week: 'all',
    chip: 'all', sort: 'implied', dir: -1, selected: null, siblings: false, aside: 'all'
  };

  function impliedOf(row) {
    var m = row.model;
    return Math.max(1, Math.round(m.base_usd * m.category_factor * m.seasoning * m.momentum * m.breadth * m.kin_factor));
  }

  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    var v = abs;
    var u = '';
    if (abs >= 1e9) { v = abs / 1e9; u = 'B'; }
    else if (abs >= 1e6) { v = abs / 1e6; u = 'M'; }
    else if (abs >= 1e3) { v = abs / 1e3; u = 'K'; }
    var d = u === 'B' ? 2 : u === 'M' ? 1 : u ? 0 : 0;
    var text = v.toFixed(d).replace(/\.0$/, '');
    return sign + '$' + text + u;
  }
  function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
      else if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, String(attrs[key]));
    });
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (item) { add(node, item); }); return; }
    if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
    else node.appendChild(child);
  }

  function readHash() {
    var params = new URLSearchParams(location.hash.replace(/^#/, ''));
    ['tab', 'q', 'category', 'chain', 'tvl', 'mechanism', 'week', 'chip', 'sort', 'aside'].forEach(function (key) {
      if (params.get(key)) state[key] = params.get(key);
    });
    if (params.get('dir')) state.dir = Number(params.get('dir')) === 1 ? 1 : -1;
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('siblings') === '1') state.siblings = true;
  }

  function passes(row) {
    if (state.chip === 'watch' && row.stage !== 'floor') return false;
    if (state.chip === 'early' && row.stage !== 'early') return false;
    if (state.chip === 'kin' && !row.kin) return false;
    if (state.chip === 'rising' && !(row.change_7d >= 5)) return false;
    if (state.chip === 'multi' && row.chains.length < 3) return false;
    if (state.chip === 'worth' && row.verdict !== 'worth') return false;
    if (state.category !== 'all' && (row.category || 'Uncategorized') !== state.category) return false;
    if (state.chain !== 'all' && row.chains.indexOf(state.chain) === -1) return false;
    if (state.mechanism !== 'all' && row.mechanism !== state.mechanism) return false;
    if (state.tvl === '1b' && row.tvl_usd < 1e9) return false;
    if (state.tvl === '100m' && (row.tvl_usd < 1e8 || row.tvl_usd >= 1e9)) return false;
    if (state.tvl === '50m' && (row.tvl_usd < 5e7 || row.tvl_usd >= 1e8)) return false;
    if (state.tvl === 'under' && row.tvl_usd >= 5e7) return false;
    if (state.week === 'up' && !(row.change_7d > 0)) return false;
    if (state.week === 'down' && !(row.change_7d < 0)) return false;
    if (state.week === 'hot' && !(row.change_7d >= 10)) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      if (row.name.toLowerCase().indexOf(q) === -1 && row.slug.indexOf(q) === -1) return false;
    }
    return true;
  }

  function valueOf(row, key) {
    if (key === 'implied') return row.implied_value_usd;
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'change') return row.change_7d;
    if (key === 'drop') return row.drop_per_1k;
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'grade') return { A: 0, B: 1, C: 2, D: 3 }[row.grade];
    return row.rank;
  }
  function compare(a, b) {
    var av = valueOf(a, state.sort);
    var bv = valueOf(b, state.sort);
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    var order = av < bv ? -1 : av > bv ? 1 : 0;
    if (order === 0) return a.slug < b.slug ? -1 : 1;
    return state.dir === -1 ? -order : order;
  }
  function visible() { return DATA.rows.filter(passes).sort(compare); }

  function uniq(list) {
    var seen = {};
    var out = [];
    list.forEach(function (item) { if (item && !seen[item]) { seen[item] = 1; out.push(item); } });
    out.sort();
    return out;
  }

  var logMin = Infinity;
  var logMax = -Infinity;
  DATA.rows.forEach(function (row) {
    logMin = Math.min(logMin, Math.log10(row.low_usd));
    logMax = Math.max(logMax, Math.log10(row.high_usd));
  });

  function rangeBar(row) {
    var span = Math.max(1e-6, logMax - logMin);
    var left = ((Math.log10(row.low_usd) - logMin) / span) * 100;
    var width = ((Math.log10(row.high_usd) - Math.log10(row.low_usd)) / span) * 100;
    var mark = ((Math.log10(row.implied_value_usd) - logMin) / span) * 100;
    return el('span', { class: 'range', title: money(row.low_usd) + ' to ' + money(row.high_usd) },
      el('b', { style: 'left:' + left.toFixed(1) + '%;width:' + Math.max(width, 1).toFixed(1) + '%' }),
      el('i', { style: 'left:' + mark.toFixed(1) + '%' }));
  }

  function badge(stage) {
    var label = stage === 'early' ? 'Early' : stage === 'floor' ? 'Floor' : 'Scout';
    return el('span', { class: 'badge ' + stage, text: label });
  }
  function verdictChip(kind) {
    var label = kind === 'worth' ? 'Worth it' : kind === 'thin' ? 'Thin' : 'Skip';
    return el('span', { class: 'chip ' + kind, text: label });
  }

  function drawCurve() {
    var canvas = document.getElementById('curve');
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var pts = DATA.fit.points;
    var pad = { l: 54, r: 12, t: 12, b: 28 };
    var xs = pts.map(function (p) { return Math.log10(p.tvl); });
    var ys = pts.map(function (p) { return Math.log10(p.mcap); });
    var x0 = Math.min.apply(null, xs);
    var x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys);
    var y1 = Math.max.apply(null, ys);
    y0 -= 0.3; y1 += 0.3;
    function X(v) { return pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r); }
    function Y(v) { return pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b); }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fbf8f3';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e4dacd';
    ctx.lineWidth = 1;
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#958d83';
    ctx.textAlign = 'center';
    for (var tick = Math.ceil(x0); tick <= Math.floor(x1); tick++) {
      ctx.beginPath(); ctx.moveTo(X(tick), pad.t); ctx.lineTo(X(tick), h - pad.b); ctx.stroke();
      ctx.fillText(money(Math.pow(10, tick)), X(tick), h - 8);
    }
    function lineAt(shift) {
      ctx.beginPath();
      var x = x0;
      ctx.moveTo(X(x), Y(DATA.fit.a + DATA.fit.line_shift + DATA.fit.b * x + shift));
      x = x1;
      ctx.lineTo(X(x), Y(DATA.fit.a + DATA.fit.line_shift + DATA.fit.b * x + shift));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(196, 73, 44, 0.18)';
    ctx.lineWidth = 10;
    lineAt(0);
    ctx.strokeStyle = '#1c1915';
    ctx.lineWidth = 1.6;
    lineAt(0);
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(X(Math.log10(p.tvl)), Y(Math.log10(p.mcap)), p.in_fit ? 3.2 : 2.6, 0, Math.PI * 2);
      if (p.screened) { ctx.strokeStyle = '#c4492c'; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = p.in_fit ? '#c4492c' : '#c8bfb2'; ctx.fill(); }
    });
    document.getElementById('chart-note').textContent =
      'b ' + DATA.fit.b.toFixed(2) + '   R² ' + DATA.fit.r2.toFixed(2) + ' (TVL-only was ' + DATA.fit.baseline_r2.toFixed(2) + ')   RMSE ' + DATA.fit.rmse.toFixed(2) + ' dex   ' + DATA.fit.n + ' families, ' + DATA.fit.dropped + ' screened out';
  }

  function drawHist() {
    var host = document.getElementById('hist');
    host.textContent = '';
    var vals = DATA.rows.map(function (r) { return Math.log10(r.implied_value_usd); });
    var lo = Math.min.apply(null, vals);
    var hi = Math.max.apply(null, vals);
    var bins = 12;
    var counts = [];
    for (var i = 0; i < bins; i++) counts[i] = 0;
    vals.forEach(function (v) {
      var idx = Math.min(bins - 1, Math.floor((v - lo) / Math.max(1e-9, hi - lo) * bins));
      counts[idx] += 1;
    });
    var peak = Math.max.apply(null, counts);
    counts.forEach(function (count) {
      host.appendChild(el('i', { style: 'height:' + Math.max(8, (count / peak) * 100) + '%' }));
    });
  }

  var columns = [['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL'], ['change', '7d'], ['implied', 'Implied'], ['drop', 'Drop / $1k'], ['grade', 'Grade']];

  function build() {
    document.getElementById('asof').textContent = DATA.as_of;
    document.querySelectorAll('.tabs button').forEach(function (button) {
      button.addEventListener('click', function () {
        state.tab = button.getAttribute('data-tab');
        if (state.tab !== 'board') state.selected = null;
        paint();
      });
    });
    document.getElementById('headline').textContent =
      DATA.board_size + ' protocols record no token and are not a wrapper of one that already trades. The market\'s own curve prices them at ' + money(DATA.implied_sum) + '.';
    var tiles = [
      [String(DATA.tracked), 'Protocols tracked'],
      [String(DATA.pre_token), 'Record no token'],
      [String(DATA.board_size), 'On the board'],
      [DATA.floor_size + '/' + DATA.watchlist_size, 'Watchlist covered'],
      [money(DATA.tvl_on_board), 'TVL on the board'],
      [DATA.median_multiple.toFixed(2) + '×', 'Median multiple']
    ];
    var stats = document.getElementById('stats');
    tiles.forEach(function (tile) { stats.appendChild(el('div', { class: 'stat' }, el('b', { text: tile[0] }), el('span', { text: tile[1] }))); });
    drawHist();
    drawCurve();

    var controls = document.getElementById('controls');
    var pills = el('div', { class: 'pills' });
    [['all', 'All'], ['watch', 'Watchlist'], ['early', 'Early finds'], ['kin', 'Parent-linked'], ['rising', 'Rising'], ['multi', 'Multi-chain'], ['worth', 'Worth farming']].forEach(function (pair) {
      pills.appendChild(el('button', { type: 'button', class: 'pill', 'data-chip': pair[0], text: pair[1], onclick: function () { state.chip = pair[0]; paint(); } }));
    });
    var search = el('input', { class: 'search', type: 'search', placeholder: 'Search', 'aria-label': 'Search', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; paint(); });
    var category = select('category', 'All categories', ['all'].concat(uniq(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))));
    var chains = [];
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { chains.push(c); }); });
    var chain = select('chain', 'All chains', ['all'].concat(uniq(chains)));
    var tvl = select('tvl', 'All TVL', [['all', 'All TVL'], ['1b', '$1B and up'], ['100m', '$100M–$1B'], ['50m', '$50M–$100M'], ['under', 'Under $50M']]);
    var mechanism = select('mechanism', 'All mechanisms', ['all'].concat(uniq(DATA.rows.map(function (r) { return r.mechanism; }))));
    var week = select('week', 'All 7d', [['all', 'All 7-day'], ['up', '7d up'], ['down', '7d down'], ['hot', '7d +10%']]);
    controls.appendChild(pills);
    controls.appendChild(search);
    controls.appendChild(category);
    controls.appendChild(chain);
    controls.appendChild(tvl);
    controls.appendChild(mechanism);
    controls.appendChild(week);
    controls.appendChild(el('button', { type: 'button', class: 'ghost', text: 'Export CSV', onclick: exportCsv }));
    controls.appendChild(el('span', { class: 'shown', id: 'shown' }));

    var head = el('tr');
    columns.forEach(function (col) {
      head.appendChild(el('th', { class: col[0] === 'name' || col[0] === 'rank' ? '' : 'right' }, el('button', {
        type: 'button', text: col[1], 'data-sort': col[0],
        onclick: function () {
          if (state.sort === col[0]) state.dir = state.dir === -1 ? 1 : -1;
          else { state.sort = col[0]; state.dir = col[0] === 'name' ? 1 : -1; }
          paint();
        }
      })));
    });
    document.getElementById('thead').appendChild(head);
    document.getElementById('tbody').addEventListener('click', function (event) {
      var row = event.target.closest('tr');
      if (!row) return;
      state.selected = row.getAttribute('data-slug');
      state.tab = 'board';
      paint();
    });
    document.getElementById('cards').addEventListener('click', function (event) {
      var card = event.target.closest('.card');
      if (!card) return;
      state.selected = card.getAttribute('data-slug');
      paint();
    });
  }

  function select(key, label, values) {
    var node = el('select', { class: 'pick', 'aria-label': label });
    values.forEach(function (value) {
      var id = Array.isArray(value) ? value[0] : value;
      var text = Array.isArray(value) ? value[1] : value === 'all' ? label : value;
      node.appendChild(el('option', { value: id, text: text }));
    });
    node.value = state[key];
    node.addEventListener('change', function () { state[key] = node.value; paint(); });
    return node;
  }

  function paint() {
    document.querySelectorAll('.tabs button').forEach(function (button) {
      button.setAttribute('aria-selected', button.getAttribute('data-tab') === state.tab ? 'true' : 'false');
    });
    document.getElementById('view-board').hidden = state.tab !== 'board';
    document.getElementById('view-comps').hidden = state.tab !== 'comps';
    document.getElementById('view-aside').hidden = state.tab !== 'aside';
    document.getElementById('view-method').hidden = state.tab !== 'method';
    if (state.tab === 'board') paintBoard();
    if (state.tab === 'comps') paintComps();
    if (state.tab === 'aside') paintAside();
    if (state.tab === 'method') paintMethod();
    paintSheet();
  }

  function paintBoard() {
    var rows = visible();
    document.querySelectorAll('.pill').forEach(function (pill) {
      pill.setAttribute('aria-pressed', pill.getAttribute('data-chip') === state.chip ? 'true' : 'false');
    });
    document.querySelectorAll('#thead button').forEach(function (button) {
      var on = button.getAttribute('data-sort') === state.sort;
      button.setAttribute('aria-sort', on ? (state.dir === -1 ? 'descending' : 'ascending') : 'none');
    });
    document.getElementById('shown').textContent = rows.length + ' of ' + DATA.board_size;
    var cards = document.getElementById('cards');
    cards.textContent = '';
    rows.slice(0, 5).forEach(function (row) {
      cards.appendChild(el('button', { type: 'button', class: 'card', 'data-slug': row.slug },
        badge(row.stage), ' ', verdictChip(row.verdict),
        el('strong', { text: row.name }),
        el('em', { text: money(row.implied_value_usd) }),
        rangeBar(row),
        el('small', { text: money(row.low_usd) + ' – ' + money(row.high_usd) + ' · $' + row.capital_usd + ' ticket' })
      ));
    });
    var body = document.getElementById('tbody');
    body.textContent = '';
    rows.forEach(function (row) {
      var changeClass = row.change_7d === null ? '' : row.change_7d >= 0 ? 'up' : 'down';
      body.appendChild(el('tr', { 'data-slug': row.slug },
        el('td', { class: 'num', text: String(row.rank) }),
        el('td', {}, el('div', { class: 'namecell' },
          el('strong', { text: row.name }),
          el('small', {}, badge(row.stage), ' ', row.category || 'Uncategorized', ' · ', row.chain)
        )),
        el('td', { class: 'num right', text: money(row.tvl_usd) }),
        el('td', { class: 'num right ' + changeClass, text: pct(row.change_7d) }),
        el('td', { class: 'right' }, el('div', { class: 'implied', text: money(row.implied_value_usd) }), rangeBar(row)),
        el('td', { class: 'num right', text: '$' + row.drop_per_1k.toFixed(0) }),
        el('td', { class: 'right' }, el('span', { class: 'grade ' + row.grade, text: row.grade }), ' ', verdictChip(row.verdict))
      ));
    });
    document.getElementById('foot').textContent =
      'Floor is the watchlist. Early is above $' + commas(DATA.floor_usd) + ' and off that list. This prices today\'s TVL on tokens that already trade. It does not say a token will be issued. Worth it means $4 or more per $1,000 after gas and a 4% yield given up.';
  }

  function splitStep(text) {
    var costAt = text.indexOf(' Cost: ');
    var action = costAt >= 0 ? text.slice(0, costAt) : text;
    var rest = costAt >= 0 ? text.slice(costAt + 7) : '';
    var timeAt = rest.indexOf(' Time: ');
    return {
      action: action,
      cost: timeAt >= 0 ? rest.slice(0, timeAt).replace(/\.$/, '') : rest,
      time: timeAt >= 0 ? rest.slice(timeAt + 7).replace(/\.$/, '') : ''
    };
  }

  function paintSheet() {
    var sheet = document.getElementById('sheet');
    var row = null;
    DATA.rows.forEach(function (item) { if (item.slug === state.selected) row = item; });
    if (!row || state.tab !== 'board') { sheet.hidden = true; sheet.textContent = ''; return; }
    var check = impliedOf(row);
    var cat = null;
    DATA.categories.forEach(function (item) { if (item.category === (row.category || 'Uncategorized')) cat = item; });
    var gasPer = row.gas_total_usd * 1000 / row.capital_usd;
    sheet.hidden = false;
    sheet.textContent = '';
    var steps = el('ol', { class: 'steps' });
    row.farm_steps.forEach(function (text, index) {
      var piece = splitStep(text);
      steps.appendChild(el('li', {},
        el('span', { class: 'idx', text: String(index + 1).padStart(2, '0') }),
        el('div', { class: 'step' }, el('p', { text: piece.action }), el('p', { class: 'when', text: 'Cost ' + piece.cost + ' · Time ' + piece.time }))
      ));
    });
    var peers = cat ? cat.peers.slice(0, 5).map(function (peer) {
      return peer.name + ' ' + peer.multiple.toFixed(2) + '×' + (peer.in_fit ? '' : ' screened');
    }).join(' · ') : 'none';
    sheet.appendChild(el('div', { class: 'sheet-head' },
      el('div', {}, badge(row.stage), ' ', el('span', { class: 'grade ' + row.grade, text: 'Grade ' + row.grade }), ' ', verdictChip(row.verdict),
        el('h2', { text: row.name }),
        el('p', { class: 'meta', text: (row.category || 'Uncategorized') + ' · ' + row.mechanism + ' · ' + row.chains.slice(0, 4).join(' · ') + ' · listed ' + (row.listed_at || 'unknown') + (row.kin ? ' · kin of ' + row.kin_of : '') })
      ),
      el('button', { type: 'button', class: 'close', text: 'Close', onclick: function () { state.selected = null; paint(); } })
    ));
    sheet.appendChild(el('div', { class: 'grid' },
      el('section', { class: 'panel' },
        el('h3', { text: 'Implied value' }),
        el('p', { class: 'big', text: money(row.implied_value_usd) }),
        el('p', { class: 'note', text: 'Quartile band ' + money(row.low_usd) + ' – ' + money(row.high_usd) }),
        rangeBar(row),
        el('p', { class: 'math', text: commas(row.model.base_usd) + ' × ' + row.model.category_factor.toFixed(3) + ' × ' + row.model.seasoning.toFixed(3) + ' × ' + row.model.momentum.toFixed(3) + ' × ' + row.model.breadth.toFixed(3) + ' × ' + row.model.kin_factor.toFixed(2) }),
        el('p', { class: check === row.implied_value_usd ? 'note' : 'note warn', text: check === row.implied_value_usd ? 'impliedOf matches the board.' : 'impliedOf recomputes ' + money(check) + '.' }),
        el('dl', {},
          el('dt', { text: 'Curve base' }), el('dd', { text: money(row.model.base_usd) + ' = 10^' + DATA.fit.a.toFixed(3) + ' × TVL^' + DATA.fit.b.toFixed(3) }),
          el('dt', { text: 'Category' }), el('dd', { text: row.model.category_factor.toFixed(3) + '× from ' + row.model.peer_n + ' families' + (row.model.shrunk ? ', shrunk toward ' + DATA.fit.reference : ', estimated effect') }),
          el('dt', { text: 'Seasoning' }), el('dd', { text: row.model.months.toFixed(1) + ' months → ' + row.model.seasoning.toFixed(3) }),
          el('dt', { text: 'Momentum' }), el('dd', { text: pct(row.change_7d) + ' → ' + row.model.momentum.toFixed(3) }),
          el('dt', { text: 'Breadth' }), el('dd', { text: row.chains.length + ' chains → ' + row.model.breadth.toFixed(3) }),
          el('dt', { text: 'Kin' }), el('dd', { text: row.kin ? '0.50, parent ' + row.kin_of : '1.00, no tokened parent' })
        ),
        el('p', { class: 'note', text: 'Comps, mcap/TVL: ' + (peers || 'none in this category.') }),
        el('p', { class: 'note', text: 'The snapshot has no TVL path, only the seven-day change (' + pct(row.change_7d) + ').' }),
        el('p', { class: 'note', text: 'Drop $' + row.drop_per_1k.toFixed(2) + ' per $1,000 if 5% of implied value is shared across TVL. Gas $' + gasPer.toFixed(2) + ' per $1,000 across ' + row.tx_count + ' transactions. Foregone yield at 4% is in the net. Net $' + row.net_per_1k.toFixed(2) + ' per $1,000. Worth it at $4 or more, thin if positive, otherwise skip.' })
      ),
      el('section', { class: 'panel' },
        el('h3', { text: 'Farm plan' }),
        el('div', { class: 'chips' },
          el('span', { class: 'chip', text: '$' + row.capital_usd + ' ticket' }),
          el('span', { class: 'chip', text: row.chain }),
          el('span', { class: 'chip', text: row.setup_min >= 1440 ? '1 day to open' : row.setup_min + ' min to open' }),
          el('span', { class: 'chip', text: '$' + row.gas_total_usd.toFixed(2) + ' gas' }),
          verdictChip(row.verdict)
        ),
        steps
      )
    ));
  }

  function paintComps() {
    var root = document.getElementById('comps-root');
    root.textContent = '';
    var rows = DATA.tokened.filter(function (row) { return state.siblings || row.mcap_usd !== null; });
    if (!state.siblings) {
      var seen = {};
      rows = rows.filter(function (row) {
        if (seen[row.family]) return false;
        seen[row.family] = 1;
        return true;
      });
    }
    root.appendChild(el('div', { class: 'controls' },
      el('button', {
        type: 'button', class: 'pill', text: state.siblings ? 'Showing every listing' : 'One row per family',
        'aria-pressed': state.siblings ? 'false' : 'true',
        onclick: function () { state.siblings = !state.siblings; paint(); }
      }),
      el('span', { class: 'shown', text: rows.length + ' of ' + DATA.tokened_size + ' tokened listings' })
    ));
    var body = el('tbody');
    rows.slice(0, 80).forEach(function (row) {
      body.appendChild(el('tr', {},
        el('td', {}, el('div', { class: 'namecell' }, el('strong', { text: row.name }), el('small', { text: (row.symbol || 'no symbol') + (row.siblings > 1 ? ' · ' + row.siblings + ' listings' : '') }))),
        el('td', { text: row.category || 'Uncategorized' }),
        el('td', { class: 'num right', text: row.mcap_usd ? money(row.mcap_usd) : 'n/a' }),
        el('td', { class: 'num right', text: money(row.tvl_usd) }),
        el('td', { text: row.in_fit ? 'In the line' : 'Held out' })
      ));
    });
    root.appendChild(el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'right', text: 'Market cap' }), el('th', { class: 'right', text: 'TVL' }), el('th', { text: 'Curve' }))),
      body
    )));
  }

  function paintAside() {
    var root = document.getElementById('aside-root');
    root.textContent = '';
    var reasons = ['all', 'CEX', 'bridged', 'staked', 'wrapped', 'versioned', 'kin/parent'];
    var pills = el('div', { class: 'pills' });
    reasons.forEach(function (reason) {
      pills.appendChild(el('button', {
        type: 'button', class: 'pill', text: reason === 'all' ? 'All reasons' : reason,
        'aria-pressed': state.aside === reason ? 'true' : 'false',
        onclick: function () { state.aside = reason; paint(); }
      }));
    });
    var rows = DATA.aside.filter(function (row) { return state.aside === 'all' || row.reason === state.aside; });
    root.appendChild(el('div', { class: 'controls' }, pills, el('span', { class: 'shown', text: rows.length + ' set aside' })));
    var body = el('tbody');
    rows.slice(0, 80).forEach(function (row) {
      body.appendChild(el('tr', {},
        el('td', { text: row.name }),
        el('td', { text: row.category || 'Uncategorized' }),
        el('td', { class: 'num right', text: money(row.tvl_usd) }),
        el('td', { text: row.reason }),
        el('td', { text: row.token ? 'Has a token' : 'No token recorded' })
      ));
    });
    root.appendChild(el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'right', text: 'TVL' }), el('th', { text: 'Reason' }), el('th', { text: 'Token' }))),
      body
    )));
  }

  function paintMethod() {
    var root = document.getElementById('method-root');
    if (root.childNodes.length) return;
    var fit = DATA.fit;
    var tiles = [
      [fit.baseline_r2.toFixed(2) + ' → ' + fit.r2.toFixed(2), 'R², TVL-only then robust'],
      [fit.b.toFixed(3), 'Elasticity b'],
      [fit.rmse.toFixed(2) + ' dex', 'Residual RMSE'],
      [fit.loo_median_dex.toFixed(2) + ' dex', 'Leave-one-out median miss'],
      [(fit.baseline_loo * 100).toFixed(0) + '% → ' + (fit.loo_median_ape * 100).toFixed(0) + '%', 'Leave-one-out level error'],
      [fit.reference, 'Reference category']
    ];
    var stats = el('div', { class: 'stats' });
    tiles.forEach(function (tile) { stats.appendChild(el('div', { class: 'stat' }, el('b', { text: tile[0] }), el('span', { text: tile[1] }))); });
    root.appendChild(stats);
    root.appendChild(el('figure', { class: 'chart-card', style: 'margin-top:12px' },
      el('figcaption', { text: 'Residuals of the pricing line' }),
      el('canvas', { id: 'resid', width: '640', height: '220' })
    ));
    drawResiduals();
    var body = el('tbody');
    DATA.categories.forEach(function (cat) {
      body.appendChild(el('tr', {},
        el('td', { text: cat.category }),
        el('td', { class: 'num right', text: String(cat.n) }),
        el('td', { class: 'num right', text: cat.factor.toFixed(2) + '×' }),
        el('td', { text: cat.shrunk ? 'Shrunk toward ' + DATA.fit.reference : 'Estimated effect' })
      ));
    });
    root.appendChild(el('div', { class: 'table-wrap', style: 'margin-top:12px' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { class: 'right', text: 'Families' }), el('th', { class: 'right', text: 'Factor' }), el('th', { text: 'Treatment' }))),
      body
    )));
  }

  function drawResiduals() {
    var canvas = document.getElementById('resid');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var pts = DATA.fit.residuals;
    var w = canvas.width;
    var h = canvas.height;
    var pad = { l: 36, r: 12, t: 12, b: 22 };
    var xs = pts.map(function (p) { return p.fitted; });
    var ys = pts.map(function (p) { return p.residual; });
    var x0 = Math.min.apply(null, xs);
    var x1 = Math.max.apply(null, xs);
    var yMax = Math.max(0.4, Math.max.apply(null, ys.map(Math.abs)));
    function X(v) { return pad.l + (v - x0) / Math.max(1e-6, x1 - x0) * (w - pad.l - pad.r); }
    function Y(v) { return pad.t + (1 - (v + yMax) / (2 * yMax)) * (h - pad.t - pad.b); }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fbf8f3';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1c1915';
    ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.fillStyle = '#c4492c';
      ctx.arc(X(p.fitted), Y(p.residual), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function csvEscape(value) {
    var text = String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function exportCsv() {
    var lines = ['rank,name,slug,category,mechanism,stage,chain,tvl_usd,change_7d,implied_value_usd,low_usd,high_usd,grade,verdict,drop_per_1k,capital_usd,gas_total_usd'];
    visible().forEach(function (row) {
      lines.push([row.rank, csvEscape(row.name), row.slug, csvEscape(row.category || ''), row.mechanism, row.stage, csvEscape(row.chain), row.tvl_usd, row.change_7d === null ? '' : row.change_7d, row.implied_value_usd, row.low_usd, row.high_usd, row.grade, row.verdict, row.drop_per_1k, row.capital_usd, row.gas_total_usd].join(','));
    });
    var link = el('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: 'northline-board.csv' });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  readHash();
  build();
  paint();
})();
