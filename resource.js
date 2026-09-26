(function () {
  const INCOME = 500000;
  const HOURS_PER_DAY = 4;
  const WORK_DAYS = 22;
  const USD_RATE = 476;
  const EUR_RATE = 520;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  document.getElementById('income-value').textContent = fmt(INCOME) + ' ₸';
  document.getElementById('rate-value').textContent = fmt(Math.round(INCOME / (HOURS_PER_DAY * WORK_DAYS))) + ' ₸/ч';
  document.getElementById('free-value').textContent = '+' + ((8 - HOURS_PER_DAY) * WORK_DAYS) + ' ч/мес';
  document.getElementById('income-fx').textContent = '≈ $' + fmt(Math.round(INCOME / USD_RATE)) + ' · €' + fmt(Math.round(INCOME / EUR_RATE));

  const salaries = [
    { label: 'Учитель школы',     value: 220000 },
    { label: 'Медсестра',         value: 240000 },
    { label: 'Продавец / кассир', value: 200000 },
    { label: 'Медиана по РК',     value: 340000 },
    { label: 'Врач',              value: 380000 },
    { label: 'Инженер (Актобе)',  value: 420000 },
    { label: 'Ты',                value: INCOME, you: true },
    { label: 'Senior IT (РК)',    value: 750000 }
  ];

  const $bars = document.getElementById('income-bars');
  const max = Math.max.apply(null, salaries.map(s => s.value));
  salaries.forEach(function (s) {
    const row = document.createElement('div');
    row.className = 'bar-row' + (s.you ? ' you' : '');
    row.innerHTML =
      '<span class="bar-label">' + s.label + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + (s.value / max * 100).toFixed(1) + '%"></div></div>' +
      '<span class="bar-value">' + fmt(s.value) + ' ₸</span>';
    $bars.appendChild(row);
  });

  drawDayPie('day-yours', [
    { hours: 8,  color: '#6366f1' },
    { hours: 4,  color: '#ef4444' },
    { hours: 12, color: '#10b981' }
  ]);

  drawDayPie('day-typical', [
    { hours: 7, color: '#6366f1' },
    { hours: 9, color: '#ef4444' },
    { hours: 2, color: '#f59e0b' },
    { hours: 6, color: '#10b981' }
  ]);

  const costs = [
    { name: 'Аренда 2-комн, центр',   price: 180000 },
    { name: 'Коммуналка (зима)',      price: 25000 },
    { name: 'Продукты на 1 чел.',     price: 90000 },
    { name: 'Транспорт (авто/такси)', price: 40000 },
    { name: 'Интернет / связь',       price: 8000 },
    { name: 'Спортзал',               price: 15000 }
  ];

  const $cost = document.getElementById('cost-grid');
  costs.forEach(function (c) {
    const card = document.createElement('div');
    card.className = 'cost-card';
    const share = (c.price / INCOME * 100).toFixed(1);
    card.innerHTML =
      '<div class="cost-name">' + c.name + '</div>' +
      '<div class="cost-price">' + fmt(c.price) + ' ₸</div>' +
      '<div class="cost-share">' + share + '% дохода</div>';
    $cost.appendChild(card);
  });

  function drawDayPie(id, segs) {
    const svg = document.getElementById(id);
    const cx = 100, cy = 100, r = 80;
    let start = -Math.PI / 2;
    segs.forEach(function (seg) {
      const angle = (seg.hours / 24) * Math.PI * 2;
      const end = start + angle;
      const large = angle > Math.PI ? 1 : 0;
      const p1 = { x: cx + Math.cos(start) * r, y: cy + Math.sin(start) * r };
      const p2 = { x: cx + Math.cos(end) * r,   y: cy + Math.sin(end) * r };
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M ' + cx + ',' + cy + ' L ' + p1.x + ',' + p1.y + ' A ' + r + ',' + r + ' 0 ' + large + ',1 ' + p2.x + ',' + p2.y + ' Z');
      path.setAttribute('fill', seg.color);
      path.setAttribute('opacity', '0.85');
      svg.appendChild(path);
      start = end;
    });
    const outline = document.createElementNS(SVG_NS, 'circle');
    outline.setAttribute('cx', cx);
    outline.setAttribute('cy', cy);
    outline.setAttribute('r', r);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'rgba(255,255,255,0.1)');
    outline.setAttribute('stroke-width', '1');
    svg.appendChild(outline);
  }

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
})();
