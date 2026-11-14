// Northline board. Reads window.RADAR from data.js. No network.
// impliedOf is the board's product: TVL × category multiple × growth × seasoning.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var board = document.getElementById('board');
  if (!DATA || !DATA.rows) {
    board.textContent = 'Northline has no data.js beside this page.';
    return;
  }

  var state = {
    tab: 'board',
    q: '',
    category: 'all',
    chain: 'all',
    stage: 'all',
    sort: 'implied',
    dir: -1,
    selected: null,
    liveSort: 'mcap',
    liveDir: -1,
    compsOnly: true
  };

  function impliedOf(row) {
    var m = row.model;
    return Math.max(1, Math.round(row.tvl_usd * m.multiple * m.growth_mult * m.maturity_mult));
  }

  function money(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    var unit = '';
    var value = abs;
    if (abs >= 1e9) { value = abs / 1e9; unit = 'B'; }
    else if (abs >= 1e6) { value = abs / 1e6; unit = 'M'; }
    else if (abs >= 1e3) { value = abs / 1e3; unit = 'K'; }
    var d = digits === undefined ? (unit ? 2 : 0) : digits;
    var text = value.toFixed(d).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return sign + '$' + text + unit;
  }

  function commas(n) {
    var s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function mult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + '×';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'class') node.className = attrs[key];
        else if (key === 'text') node.textContent = attrs[key];
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
        else if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, String(attrs[key]));
      });
    }
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
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('stage')) state.stage = params.get('stage');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = Number(params.get('dir')) === 1 ? 1 : -1;
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('comps') === 'all') state.compsOnly = false;
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.stage !== 'all') params.set('stage', state.stage);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    if (!state.compsOnly) params.set('comps', 'all');
    var next = params.toString();
    var url = next ? '#' + next : location.pathname + location.search;
    history.replaceState(null, '', next ? url : location.pathname + location.search);
  }

  function stageLabel(stage) {
    if (stage === 'early') return 'Early';
    if (stage === 'floor') return 'Floor';
    return 'Scout';
  }

  function chainsOf(row) {
    var list = row.chains || [];
    if (!list.length) return row.chain || '';
    if (list.length <= 3) return list.join(' · ');
    return list.slice(0, 3).join(' · ') + ' · +' + (list.length - 3);
  }

  function splitStep(text) {
    var costAt = text.indexOf(' Cost: ');
    var action = costAt >= 0 ? text.slice(0, costAt) : text;
    var rest = costAt >= 0 ? text.slice(costAt + 7) : '';
    var timeAt = rest.indexOf(' Time: ');
    return {
      action: action,
      cost: timeAt >= 0 ? rest.slice(0, timeAt).replace(/\.$/, '') : rest.replace(/\.$/, ''),
      time: timeAt >= 0 ? rest.slice(timeAt + 7).replace(/\.$/, '') : ''
    };
  }

  function rowValue(row, key) {
    if (key === 'implied') return row.implied_value_usd;
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'change') return row.change_7d;
    if (key === 'multiple') return row.model.multiple;
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'category') return (row.category || '').toLowerCase();
    return row.rank;
  }

  function compareRows(a, b) {
    var av = rowValue(a, state.sort);
    var bv = rowValue(b, state.sort);
    var aMissing = av === null || av === undefined;
    var bMissing = bv === null || bv === undefined;
    if (aMissing && bMissing) return a.slug < b.slug ? -1 : 1;
    if (aMissing) return 1;
    if (bMissing) return -1;
    var order = av < bv ? -1 : av > bv ? 1 : 0;
    if (order === 0) return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    return state.dir === -1 ? -order : order;
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (row) {
      if (state.stage !== 'all' && row.stage !== state.stage) return false;
      if (state.category !== 'all' && (row.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && row.chains.indexOf(state.chain) === -1) return false;
      if (q && row.name.toLowerCase().indexOf(q) === -1 && row.slug.indexOf(q) === -1) return false;
      return true;
    }).sort(compareRows);
  }

  function unique(list) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      if (!item || seen[item]) return;
      seen[item] = true;
      out.push(item);
    });
    out.sort();
    return out;
  }

  var columns = [
    ['rank', '#'],
    ['name', 'Protocol'],
    ['category', 'Category'],
    ['tvl', 'TVL'],
    ['change', '7d'],
    ['multiple', 'Comp'],
    ['implied', 'Implied']
  ];

  function buildChrome() {
    document.getElementById('asof').textContent = 'Snapshot ' + DATA.as_of;
    document.querySelectorAll('.tabs button').forEach(function (button) {
      button.addEventListener('click', function () {
        state.tab = button.getAttribute('data-tab');
        if (state.tab !== 'board') state.selected = null;
        writeHash();
        paint();
      });
    });

    var stats = document.getElementById('stats');
    ['showing', 'floor', 'early', 'median'].forEach(function (id) {
      stats.appendChild(el('div', { class: 'stat' }, el('b', { id: 'stat-' + id, text: '—' }), el('span', { id: 'stat-' + id + '-l', text: '' })));
    });

    var controls = document.getElementById('controls');
    var pills = el('div', { class: 'pills', role: 'group', 'aria-label': 'Stage' });
    [['all', 'All'], ['floor', 'Floor'], ['early', 'Early'], ['scout', 'Scout']].forEach(function (pair) {
      pills.appendChild(el('button', {
        type: 'button', class: 'pill', 'data-stage': pair[0], text: pair[1],
        onclick: function () {
          state.stage = pair[0];
          writeHash();
          paint();
        }
      }));
    });
    var search = el('input', { class: 'search', type: 'search', placeholder: 'Search protocols', value: state.q, 'aria-label': 'Search' });
    search.addEventListener('input', function () {
      state.q = search.value;
      writeHash();
      paint();
    });
    var category = el('select', { class: 'pick', id: 'pick-category', 'aria-label': 'Category' });
    var chain = el('select', { class: 'pick', id: 'pick-chain', 'aria-label': 'Chain' });
    category.addEventListener('change', function () { state.category = category.value; writeHash(); paint(); });
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); paint(); });
    controls.appendChild(pills);
    controls.appendChild(search);
    controls.appendChild(category);
    controls.appendChild(chain);
    controls.appendChild(el('span', { class: 'shown', id: 'shown', text: '' }));

    var head = document.getElementById('thead');
    var tr = el('tr');
    columns.forEach(function (col) {
      var button = el('button', {
        type: 'button', text: col[1], 'data-sort': col[0],
        onclick: function () {
          if (state.sort === col[0]) state.dir = state.dir === -1 ? 1 : -1;
          else {
            state.sort = col[0];
            state.dir = col[0] === 'name' || col[0] === 'category' ? 1 : -1;
          }
          writeHash();
          paint();
        }
      });
      var th = el('th', { class: col[0] === 'tvl' || col[0] === 'change' || col[0] === 'multiple' || col[0] === 'implied' ? 'right' : '' }, button);
      tr.appendChild(th);
    });
    head.appendChild(tr);

    fillSelect(category, ['all'].concat(unique(DATA.rows.map(function (row) { return row.category || 'Uncategorized'; }))), 'All categories', state.category);
    var chainNames = [];
    DATA.rows.forEach(function (row) { (row.chains || []).forEach(function (name) { chainNames.push(name); }); });
    fillSelect(chain, ['all'].concat(unique(chainNames)), 'All chains', state.chain);

    document.getElementById('tbody').addEventListener('click', function (event) {
      var target = event.target.closest('tr');
      if (!target) return;
      state.selected = target.getAttribute('data-slug');
      state.tab = 'board';
      writeHash();
      paint();
    });
  }

  function fillSelect(select, values, allLabel, current) {
    values.forEach(function (value) {
      var option = el('option', { value: value, text: value === 'all' ? allLabel : value });
      select.appendChild(option);
    });
    select.value = current;
  }

  function paint() {
    document.querySelectorAll('.tabs button').forEach(function (button) {
      button.setAttribute('aria-selected', button.getAttribute('data-tab') === state.tab ? 'true' : 'false');
    });
    document.getElementById('view-board').hidden = state.tab !== 'board';
    document.getElementById('view-live').hidden = state.tab !== 'live';
    document.getElementById('view-model').hidden = state.tab !== 'model';
    if (state.tab === 'board') paintBoard();
    if (state.tab === 'live') paintLive();
    if (state.tab === 'model') paintModel();
    paintSheet();
  }

  function paintBoard() {
    var rows = visibleRows();
    document.getElementById('stat-showing').textContent = String(rows.length);
    document.getElementById('stat-showing-l').textContent = 'Showing';
    document.getElementById('stat-floor').textContent = String(DATA.floor_size);
    document.getElementById('stat-floor-l').textContent = 'Watchlist';
    document.getElementById('stat-early').textContent = String(DATA.early_size);
    document.getElementById('stat-early-l').textContent = 'Early, above floor';
    document.getElementById('stat-median').textContent = mult(DATA.global.trimmed_median);
    document.getElementById('stat-median-l').textContent = 'Global mcap/TVL';
    document.getElementById('shown').textContent = rows.length + ' of ' + DATA.board_size;
    document.querySelectorAll('.pill').forEach(function (pill) {
      pill.setAttribute('aria-pressed', pill.getAttribute('data-stage') === state.stage ? 'true' : 'false');
    });
    document.querySelectorAll('#thead button').forEach(function (button) {
      var key = button.getAttribute('data-sort');
      button.setAttribute('aria-sort', key === state.sort ? (state.dir === -1 ? 'descending' : 'ascending') : 'none');
    });
    var body = document.getElementById('tbody');
    body.textContent = '';
    rows.forEach(function (row) {
      var changeClass = row.change_7d === null || row.change_7d === undefined ? 'flat' : row.change_7d >= 0 ? 'up' : 'down';
      body.appendChild(el('tr', { 'data-slug': row.slug },
        el('td', { class: 'mono', text: String(row.rank) }),
        el('td', {}, el('div', { class: 'namecell' },
          el('strong', { text: row.name }),
          el('small', {}, el('span', { class: 'badge ' + row.stage, text: stageLabel(row.stage) }), ' ', chainsOf(row))
        )),
        el('td', { text: row.category || 'Uncategorized' }),
        el('td', { class: 'num right', text: money(row.tvl_usd) }),
        el('td', { class: 'num right ' + changeClass, text: pct(row.change_7d) }),
        el('td', { class: 'num right', text: mult(row.model.multiple) }),
        el('td', { class: 'right implied', text: money(row.implied_value_usd) })
      ));
    });
    document.getElementById('foot').textContent =
      'Floor is the watchlist. Early is above $' + commas(DATA.floor_usd) + ' and off that list. Scout is below the floor. Live tokens sit on Comps, not on this board.';
  }

  function peerNote(row) {
    var m = row.model;
    if (m.peer_n === 0) return 'No priced peer in this category, so the multiple is the global trimmed median of ' + mult(DATA.global.trimmed_median) + '.';
    var base = m.peer_n + ' priced peer' + (m.peer_n === 1 ? '' : 's') + '. Raw trimmed median ' + mult(m.raw_median) + '.';
    if (m.cap_hit) base += ' Capped at ' + mult(DATA.global.ratio_cap) + ' (5× the global 90th percentile) before the shrink, which leaves ' + mult(m.trimmed_median) + '.';
    if (m.shrunk) base += ' Shrunk to ' + mult(m.multiple) + ' because a category under 5 peers moves toward the global ' + mult(DATA.global.trimmed_median) + '.';
    else base += ' Used in full: ' + mult(m.multiple) + '.';
    return base;
  }

  function paintSheet() {
    var sheet = document.getElementById('sheet');
    var row = DATA.rows.filter(function (item) { return item.slug === state.selected; })[0];
    if (!row || state.tab !== 'board') {
      sheet.hidden = true;
      sheet.textContent = '';
      return;
    }
    var check = impliedOf(row);
    var parts = splitStep(row.farm_steps[0]);
    void parts;
    sheet.hidden = false;
    sheet.textContent = '';
    var steps = el('ol', { class: 'steps' });
    row.farm_steps.forEach(function (text, index) {
      var piece = splitStep(text);
      steps.appendChild(el('li', {},
        el('span', { class: 'idx', text: String(index + 1).padStart(2, '0') }),
        el('div', { class: 'step' },
          el('p', { text: piece.action }),
          el('p', { class: 'when', text: 'Cost ' + piece.cost + ' · Time ' + piece.time })
        )
      ));
    });
    sheet.appendChild(el('div', { class: 'sheet-head' },
      el('div', {},
        el('span', { class: 'badge ' + row.stage, text: stageLabel(row.stage) }),
        el('h2', { text: row.name }),
        el('p', { class: 'meta', text: (row.category || 'Uncategorized') + ' · ' + chainsOf(row) + ' · listed ' + (row.listed_at || 'unknown') })
      ),
      el('button', {
        type: 'button', class: 'close', text: 'Close',
        onclick: function () { state.selected = null; writeHash(); paint(); }
      })
    ));
    sheet.appendChild(el('div', { class: 'grid' },
      el('section', { class: 'panel' },
        el('h3', { text: 'Implied value' }),
        el('p', { class: 'big', text: money(row.implied_value_usd) }),
        el('p', { class: 'band', text: 'Band ' + money(row.low_usd) + ' – ' + money(row.high_usd) + ' · ±' + Math.round(row.model.half_width * 100) + '%' }),
        el('p', { class: 'math', text: commas(row.tvl_usd) + ' × ' + row.model.multiple.toFixed(4) + ' × ' + row.model.growth_mult.toFixed(4) + ' × ' + row.model.maturity_mult.toFixed(4) }),
        check === row.implied_value_usd
          ? el('p', { class: 'note', text: 'impliedOf matches the board at ' + money(check) + '.' })
          : el('p', { class: 'note warn', text: 'impliedOf recomputes ' + money(check) + ', board says ' + money(row.implied_value_usd) + '.' }),
        el('dl', {},
          el('dt', { text: 'TVL' }), el('dd', { text: money(row.tvl_usd) }),
          el('dt', { text: '7-day' }), el('dd', { text: pct(row.change_7d) + ' → growth ' + row.model.growth_mult.toFixed(4) }),
          el('dt', { text: 'Seasoning' }), el('dd', { text: row.model.months.toFixed(1) + ' months' + (row.model.months > 30 ? ', capped at 30' : '') + ' → ' + row.model.maturity_mult.toFixed(4) }),
          el('dt', { text: 'Multiple' }), el('dd', { text: mult(row.model.multiple) })
        ),
        el('p', { class: 'note', text: peerNote(row) })
      ),
      el('section', { class: 'panel' },
        el('h3', { text: 'Farm plan' }),
        el('div', { class: 'chips' },
          el('span', { class: 'chip', text: money(row.capital_usd, 0) + ' capital' }),
          el('span', { class: 'chip', text: '$' + row.gas_usd + ' gas / tx' }),
          el('span', { class: 'chip', text: row.hold_days + ' day hold' }),
          el('span', { class: 'chip', text: row.chain })
        ),
        steps
      )
    ));
  }

  function liveValue(row, key) {
    if (key === 'mcap') return row.mcap_usd;
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'ratio') return row.ratio;
    return row.name.toLowerCase();
  }

  function paintLive() {
    var root = document.getElementById('live-root');
    root.textContent = '';
    var rows = DATA.live.filter(function (row) { return !state.compsOnly || row.used_in_comps; });
    rows.sort(function (a, b) {
      var av = liveValue(a, state.liveSort);
      var bv = liveValue(b, state.liveSort);
      var order = av < bv ? -1 : av > bv ? 1 : 0;
      if (order === 0) return a.slug < b.slug ? -1 : 1;
      return state.liveDir === -1 ? -order : order;
    });
    var toggle = el('button', {
      type: 'button', class: 'pill', text: state.compsOnly ? 'Comps only' : 'All priced tokens',
      'aria-pressed': state.compsOnly ? 'true' : 'false',
      onclick: function () { state.compsOnly = !state.compsOnly; writeHash(); paint(); }
    });
    root.appendChild(el('div', { class: 'controls' }, toggle, el('span', { class: 'shown', text: rows.length + ' tokens' })));
    var head = el('tr');
    [['name', 'Token'], ['category', 'Category'], ['mcap', 'Market cap'], ['tvl', 'TVL'], ['ratio', 'Mcap/TVL']].forEach(function (col) {
      head.appendChild(el('th', { class: col[0] === 'name' || col[0] === 'category' ? '' : 'right' }, el('button', {
        type: 'button', text: col[1],
        onclick: function () {
          if (state.liveSort === col[0]) state.liveDir = state.liveDir === -1 ? 1 : -1;
          else { state.liveSort = col[0]; state.liveDir = col[0] === 'name' || col[0] === 'category' ? 1 : -1; }
          paint();
        }
      })));
    });
    var body = el('tbody');
    rows.forEach(function (row) {
      body.appendChild(el('tr', {},
        el('td', {}, el('div', { class: 'namecell' }, el('strong', { text: row.name }), el('small', { text: row.used_in_comps ? 'In the comps' : 'Excluded category' }))),
        el('td', { text: row.category || 'Uncategorized' }),
        el('td', { class: 'num right', text: money(row.mcap_usd) }),
        el('td', { class: 'num right', text: money(row.tvl_usd) }),
        el('td', { class: 'num right', text: row.ratio.toFixed(2) + '×' + (row.ratio_winsor !== null && row.ratio_winsor !== row.ratio ? ' → ' + row.ratio_winsor.toFixed(2) + '×' : '') })
      ));
    });
    root.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, head), body)));
  }

  function paintModel() {
    var root = document.getElementById('model-root');
    root.textContent = '';
    var g = DATA.global;
    root.appendChild(el('div', { class: 'stats' },
      stat(String(g.n), 'Priced comps'),
      stat(g.p10.toFixed(2) + '×', 'Global 10th'),
      stat(g.p90.toFixed(2) + '×', 'Global 90th'),
      stat(g.ratio_cap.toFixed(2) + '×', 'Ratio cap, 5× p90'),
      stat(g.trimmed_median.toFixed(2) + '×', 'Global trimmed median')
    ));
    var cats = DATA.categories.slice().sort(function (a, b) { return b.multiple - a.multiple || (a.category < b.category ? -1 : 1); });
    var body = el('tbody');
    cats.forEach(function (cat) {
      var note = cat.cap_hit ? 'Capped' : cat.shrunk ? 'Shrunk' : 'Full';
      body.appendChild(el('tr', {},
        el('td', { text: cat.category }),
        el('td', { class: 'num right', text: String(cat.n) }),
        el('td', { class: 'num right', text: cat.raw_median === null ? 'n/a' : cat.raw_median.toFixed(2) + '×' }),
        el('td', { class: 'num right', text: mult(cat.multiple) }),
        el('td', { text: note })
      ));
    });
    root.appendChild(el('div', { class: 'table-wrap model-table' }, el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Category' }),
        el('th', { class: 'right', text: 'Peers' }),
        el('th', { class: 'right', text: 'Raw median' }),
        el('th', { class: 'right', text: 'Multiple' }),
        el('th', { text: 'Treatment' })
      )),
      body
    )));
  }

  function stat(value, label) {
    return el('div', { class: 'stat' }, el('b', { text: value }), el('span', { text: label }));
  }

  readHash();
  buildChrome();
  paint();
})();
