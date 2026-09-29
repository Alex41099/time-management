$(function () {
  const STORAGE_KEY = 'time-management-tasks-v4';
  const PRAYERS_CACHE_KEY = 'prayers-cache-aktobe-v19';
  const ASR_MODE_KEY = 'asr-mode';
  const AKTOBE_LAT = '50.300377';
  const AKTOBE_LNG = '57.154555';
  const NAMAZTIMES_AKTOBE_ID = 8382;
  const PALETTE = [
    '#6c8dff', '#ff6b7a', '#ffb347', '#4dd4ac',
    '#c58bff', '#ffd966', '#5ac8fa', '#ff8fb1',
    '#7bd88f', '#f28ad0', '#8ea6ff', '#ffa07a'
  ];

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CENTER = 250;
  const RING_OUT = 220;
  const RING_IN = 135;
  const NUMBERS_R = 180;
  const STEP_MIN = 15;
  const DAY_MIN = 24 * 60;
  const SLOTS_PER_DAY = DAY_MIN / STEP_MIN;

  const $svg = $('#clock');
  const svgEl = $svg[0];
  const $sectors = $('#sectors');
  const $preview = $('#preview');
  const $list = $('#task-list');
  const $editor = $('#task-editor');
  const $editorName = $('#editor-name');
  const $editorTime = $('#editor-time');

  const CAL_REST_KEY = 'calendar-rested';
  const MONTH_NAMES_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const HABITS_LOG_KEY = 'habits-log';
  const HABIT_MIN_PER_DAY = 5;
  const HABIT_MILESTONES = [7, 30, 100, 365];
  const HABIT_LEVELS = [
    { min: 0,   name: 'Новичок' },
    { min: 7,   name: 'Стабильно' },
    { min: 30,  name: 'Знаток' },
    { min: 100, name: 'Мастер' },
    { min: 365, name: 'Легенда' }
  ];
  const HABITS = [
    { id: 'belly',   icon: '🧘', title: 'Массаж живота', color: '#f472b6', goal: 'Прямая осанка, плоский живот, лёгкость в теле' },
    { id: 'quran',   icon: '📖', title: 'Чтение Корана', color: '#10b981', goal: 'Духовная сила, внутренний покой, связь с Всевышним' },
    { id: 'lecture', icon: '🎧', title: 'Слушать лекции', color: '#6c8dff', goal: 'Знания копятся каждый день — умнее, чем вчера' }
  ];

  let tasks = load();
  let prayers = [];
  let calCursor = null;

  let dragging = false;
  let dragStartSlot = null;
  let dragUnwrappedSlot = null;
  let dragLastRawSlot = null;
  let editingTaskId = null;
  let pendingRange = null;

  drawStatic();
  render();
  loadPrayers();
  playOmnitrix();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) playOmnitrix();
  });
  renderNow();
  setInterval(renderNow, 15000);
  initCalendar();
  initHabits();

  $svg.on('mousedown touchstart', function (e) {
    if (!$editor.hasClass('hidden')) return;
    if ($(e.target).hasClass('sector') || $(e.target).hasClass('sector-label')) return;

    const slot = eventToSlot(e, true);
    if (slot === null) return;
    if (slotOccupied(slot)) return;

    dragging = true;
    dragStartSlot = slot;
    dragUnwrappedSlot = slot;
    dragLastRawSlot = slot;
    drawPreview();
    e.preventDefault();
  });

  $(document).on('mousemove touchmove', function (e) {
    if (!dragging) return;
    const raw = eventToSlot(e, false);
    if (raw === null) return;

    let delta = raw - dragLastRawSlot;
    if (delta > SLOTS_PER_DAY / 2) delta -= SLOTS_PER_DAY;
    else if (delta < -SLOTS_PER_DAY / 2) delta += SLOTS_PER_DAY;
    dragUnwrappedSlot += delta;
    dragLastRawSlot = raw;

    if (dragUnwrappedSlot < dragStartSlot) dragUnwrappedSlot = dragStartSlot;
    if (dragUnwrappedSlot > dragStartSlot + SLOTS_PER_DAY) dragUnwrappedSlot = dragStartSlot + SLOTS_PER_DAY;

    drawPreview();
    e.preventDefault();
  });

  $(document).on('mouseup touchend', function () {
    if (!dragging) return;
    dragging = false;

    const range = normalizeRange(dragStartSlot, dragUnwrappedSlot);
    $preview.empty();

    if (range.length === 0) return;

    const trimmed = trimRangeAgainstTasks(range);
    if (!trimmed) return;

    pendingRange = trimmed;
    editingTaskId = null;
    openEditor(trimmed, '');
  });

  $sectors.on('click', '.sector', function (e) {
    e.stopPropagation();
    const id = $(this).data('id');
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    editingTaskId = id;
    pendingRange = { startMin: task.startMin, endMin: task.endMin };
    openEditor(pendingRange, task.name);
  });

  $('#editor-cancel').on('click', function () {
    if (editingTaskId !== null) {
      tasks = tasks.filter(t => t.id !== editingTaskId);
      save();
      render();
    }
    closeEditor();
  });

  $('#editor-save').on('click', saveEditor);

  $editorName.on('keydown', function (e) {
    if (e.key === 'Enter') saveEditor();
    if (e.key === 'Escape') closeEditor();
  });

  $list.on('click', '.remove', function () {
    const id = $(this).closest('li').data('id');
    tasks = tasks.filter(t => t.id !== id);
    save();
    render();
  });

  function saveEditor() {
    const name = $.trim($editorName.val());
    if (!name || !pendingRange) return;

    if (editingTaskId !== null) {
      const t = tasks.find(x => x.id === editingTaskId);
      if (t) t.name = name;
    } else {
      tasks.push({
        id: Date.now(),
        name: name,
        color: PALETTE[tasks.length % PALETTE.length],
        startMin: pendingRange.startMin,
        endMin: pendingRange.endMin
      });
    }

    save();
    render();
    closeEditor();
  }

  function openEditor(range, name) {
    $editorName.val(name);
    $editorTime.text(formatRange(range.startMin, range.endMin));
    $editor.removeClass('hidden');
    setTimeout(() => $editorName.focus(), 0);
  }

  function closeEditor() {
    $editor.addClass('hidden');
    pendingRange = null;
    editingTaskId = null;
  }

  function drawStatic() {
    const $bg = $('#ring-bg');
    $bg[0].appendChild(fullAnnulus(RING_IN, RING_OUT, 'ring-bg'));
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', CENTER);
    inner.setAttribute('cy', CENTER);
    inner.setAttribute('r', RING_IN - 4);
    inner.setAttribute('class', 'ring-inner-bg');
    $bg[0].appendChild(inner);

    const $ticks = $('#ticks');
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const angle = slotToAngle(i);
      const isHour = i % 4 === 0;
      const isQuarter = i % 24 === 0;
      const length = isQuarter ? 16 : isHour ? 10 : 5;
      const p1 = polar(CENTER, CENTER, RING_OUT - length, angle);
      const p2 = polar(CENTER, CENTER, RING_OUT - 2, angle);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
      line.setAttribute('class', 'tick' + (isQuarter ? ' quarter' : isHour ? ' major' : ''));
      $ticks[0].appendChild(line);
    }

    const $numbers = $('#numbers');
    for (let h = 0; h < 24; h += 2) {
      const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
      const p = polar(CENTER, CENTER, NUMBERS_R, angle);
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', p.x);
      t.setAttribute('y', p.y);
      if (h % 6 === 0) t.setAttribute('class', 'quarter');
      t.textContent = h;
      $numbers[0].appendChild(t);
    }
  }

  function render() {
    $sectors.empty();

    tasks.forEach(function (task) {
      const parts = splitAcrossMidnight(task.startMin, task.endMin);
      const longest = parts.reduce((a, b) => (b.endMin - b.startMin > a.endMin - a.startMin ? b : a));

      parts.forEach(function (part) {
        const startSlot = part.startMin / STEP_MIN;
        const endSlot = part.endMin / STEP_MIN;

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', annularPath(startSlot, endSlot, RING_IN, RING_OUT));
        path.setAttribute('fill', task.color);
        path.setAttribute('class', 'sector');
        $(path).data('id', task.id);
        $sectors[0].appendChild(path);

        if (part === longest) {
          const spanSlots = endSlot - startSlot;
          if (spanSlots >= 2) {
            const midSlot = (startSlot + endSlot) / 2;
            const midAngle = slotToAngle(midSlot);
            const labelR = (RING_IN + RING_OUT) / 2;
            const p = polar(CENTER, CENTER, labelR, midAngle);
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', p.x);
            label.setAttribute('y', p.y);
            label.setAttribute('class', 'sector-label');
            label.textContent = truncate(task.name, Math.floor(spanSlots * 1.3));
            $sectors[0].appendChild(label);
          }
        }
      });
    });

    drawList();
  }

  function drawPreview() {
    $preview.empty();
    if (dragStartSlot === null || dragUnwrappedSlot === null) return;
    const range = normalizeRange(dragStartSlot, dragUnwrappedSlot);
    if (range.length === 0) return;

    splitAcrossMidnight(range.startMin, range.endMin).forEach(function (part) {
      const startSlot = part.startMin / STEP_MIN;
      const endSlot = part.endMin / STEP_MIN;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', annularPath(startSlot, endSlot, RING_IN, RING_OUT));
      path.setAttribute('class', 'preview-sector');
      $preview[0].appendChild(path);
    });
  }

  function drawList() {
    $list.empty();
    if (tasks.length === 0) {
      $list.append('<li class="empty">Пока пусто — нарисуй первый сектор</li>');
      return;
    }

    const sorted = tasks.slice().sort((a, b) => a.startMin - b.startMin);
    sorted.forEach(function (task) {
      const $item = $('<li>').attr('data-id', task.id);
      $item.append($('<span class="dot">').css('background', task.color));
      const $info = $('<div class="info">');
      $info.append($('<div class="name">').text(task.name));
      $info.append($('<div class="time">').text(formatRange(task.startMin, task.endMin)));
      $item.append($info);
      $item.append($('<button class="remove" type="button" title="Удалить">&times;</button>'));
      $list.append($item);
    });
  }

  function eventToSlot(e, checkRadius) {
    const ev = e.originalEvent && e.originalEvent.touches ? e.originalEvent.touches[0] : e;
    if (!ev) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    const dx = p.x - CENTER;
    const dy = p.y - CENTER;

    if (checkRadius) {
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < RING_IN - 10 || r > RING_OUT + 15) return null;
    }

    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    return Math.round((angle / (Math.PI * 2)) * SLOTS_PER_DAY) % SLOTS_PER_DAY;
  }

  function normalizeRange(startSlot, endSlot) {
    if (endSlot === startSlot) endSlot = startSlot + 1;
    const startMin = startSlot * STEP_MIN;
    const endMin = endSlot * STEP_MIN;
    return { startMin, endMin, length: endMin - startMin };
  }

  function taskIntervals(startMin, endMin) {
    if (endMin <= DAY_MIN) return [[startMin, endMin]];
    return [[startMin, DAY_MIN], [0, endMin - DAY_MIN]];
  }

  function splitAcrossMidnight(startMin, endMin) {
    return taskIntervals(startMin, endMin).map(([s, e]) => ({ startMin: s, endMin: e }));
  }

  function trimRangeAgainstTasks(range) {
    const startSlot = range.startMin / STEP_MIN;
    let endSlot = range.endMin / STEP_MIN;

    const blocked = new Set();
    tasks.forEach(function (t) {
      const s = Math.round(t.startMin / STEP_MIN);
      const e = Math.round(t.endMin / STEP_MIN);
      for (let i = s; i < e; i++) blocked.add(i % SLOTS_PER_DAY);
    });

    for (let i = startSlot; i < endSlot; i++) {
      if (blocked.has(i % SLOTS_PER_DAY)) {
        endSlot = i;
        break;
      }
    }

    if (endSlot - startSlot < 1) return null;
    return { startMin: startSlot * STEP_MIN, endMin: endSlot * STEP_MIN };
  }

  function slotOccupied(slot) {
    const min = slot * STEP_MIN;
    return tasks.some(function (t) {
      return taskIntervals(t.startMin, t.endMin).some(function (iv) {
        return iv[0] <= min && iv[1] > min;
      });
    });
  }

  function slotToAngle(slot) {
    return (slot / SLOTS_PER_DAY) * Math.PI * 2 - Math.PI / 2;
  }

  function polar(cx, cy, r, angle) {
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }

  function annularPath(startSlot, endSlot, rIn, rOut) {
    const startAngle = slotToAngle(startSlot);
    const endAngle = slotToAngle(endSlot);
    const large = endSlot - startSlot > SLOTS_PER_DAY / 2 ? 1 : 0;

    const p1 = polar(CENTER, CENTER, rOut, startAngle);
    const p2 = polar(CENTER, CENTER, rOut, endAngle);
    const p3 = polar(CENTER, CENTER, rIn, endAngle);
    const p4 = polar(CENTER, CENTER, rIn, startAngle);

    return [
      'M', p1.x, p1.y,
      'A', rOut, rOut, 0, large, 1, p2.x, p2.y,
      'L', p3.x, p3.y,
      'A', rIn, rIn, 0, large, 0, p4.x, p4.y,
      'Z'
    ].join(' ');
  }

  function fullAnnulus(rIn, rOut, cls) {
    const path = document.createElementNS(SVG_NS, 'path');
    const d = [
      'M', CENTER - rOut, CENTER,
      'A', rOut, rOut, 0, 1, 0, CENTER + rOut, CENTER,
      'A', rOut, rOut, 0, 1, 0, CENTER - rOut, CENTER,
      'M', CENTER - rIn, CENTER,
      'A', rIn, rIn, 0, 1, 1, CENTER + rIn, CENTER,
      'A', rIn, rIn, 0, 1, 1, CENTER - rIn, CENTER,
      'Z'
    ].join(' ');
    path.setAttribute('d', d);
    path.setAttribute('class', cls);
    path.setAttribute('fill-rule', 'evenodd');
    return path;
  }

  function formatRange(startMin, endMin) {
    return formatTime(startMin) + ' – ' + formatTime(endMin) + '  ·  ' + formatDuration(endMin - startMin);
  }

  function formatTime(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function formatDuration(min) {
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? h + ' ч' : h + ' ч ' + rest + ' мин';
  }

  function truncate(text, max) {
    if (max < 2) return '';
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function loadPrayers() {
    const cached = getCachedPrayers();
    if (cached) {
      prayers = cached;
      applyAsrMode();
      renderPrayers();
      return;
    }

    const year = new Date().getFullYear();
    const muftyatUrl = 'https://namaz.muftyat.kz/api/times/' + year + '/' + AKTOBE_LAT + '/' + AKTOBE_LNG;
    const shafiUrl = 'https://namaztimes.kz/api/praytimes?id=' + NAMAZTIMES_AKTOBE_ID + '&type=json';

    let mDone = false, sDone = false;
    let mData = null, sData = null;

    function finish() {
      if (!mDone || !sDone) return;
      if (!mData) { showPrayerError(); return; }

      const today = todayKey();
      const idx = mData.result.findIndex(d => (d.date || '').trim() === today);
      const day = idx >= 0 ? mData.result[idx] : null;
      if (!day) { showPrayerError(); return; }
      const tomorrow = idx >= 0 ? mData.result[idx + 1] : null;

      const asrShafi = sData && sData.praytimes ? sData.praytimes.asriauual : null;
      const tahajjud = computeTahajjud(day, tomorrow);

      const ishaMin = hmToMin(day.Isha);
      const sleepStart = Number.isFinite(ishaMin) ? (ishaMin + 60) % DAY_MIN : NaN;
      const fastStart = Number.isFinite(sleepStart) ? (sleepStart - 120 + DAY_MIN) % DAY_MIN : NaN;
      const eatStart = Number.isFinite(fastStart) ? (fastStart - 30 + DAY_MIN) % DAY_MIN : NaN;

      prayers = [
        { name: 'Фаджр',        color: '#a78bfa', min: hmToMin(day.Fajr) },
        { name: 'Восход',       color: '#fb923c', min: hmToMin(day.Sunrise) },
        { name: 'Зухр',         color: '#14b8a6', min: hmToMin(day.Dhuhr) },
        { name: 'Аср (шафи)',   color: '#f472b6', min: hmToMin(asrShafi), asrRole: 'shafi' },
        { name: 'Аср (ханафи)', color: '#ef4444', min: hmToMin(day.Asr),  asrRole: 'hanafi' },
        { name: 'Магриб',       color: '#f59e0b', min: hmToMin(day.Maghrib), icon: 'glasses' },
        { name: 'Иша',          color: '#6366f1', min: ishaMin },
        tahajjud && { name: 'Тахаджуд', color: '#d4af37', range: true, startMin: tahajjud.startMin, endMin: tahajjud.endMin, hiddenInList: true },
        { name: 'Успеть поесть', color: '#84cc16', min: eatStart, routine: true,
          arc: Number.isFinite(eatStart) && Number.isFinite(fastStart)
            ? { startMin: eatStart, endMin: fastStart, color: '#84cc16' } : null },
        { name: 'Не есть',       color: '#dc2626', min: fastStart, routine: true,
          arc: Number.isFinite(fastStart) && Number.isFinite(sleepStart)
            ? { startMin: fastStart, endMin: sleepStart, color: '#dc2626' } : null },
        { name: 'Сон',           color: '#6366f1', min: sleepStart, routine: true },
        { name: 'Дневной сон',   color: '#6366f1', min: 14 * 60, routine: true }
      ].filter(p => p && (p.range ? Number.isFinite(p.startMin) && Number.isFinite(p.endMin) : Number.isFinite(p.min)));

      applyAsrMode();
      cachePrayers(prayers);
      renderPrayers();
    }

    $.getJSON(muftyatUrl)
      .done(function (res) {
        if (res && res.success && Array.isArray(res.result)) mData = res;
      })
      .always(function () { mDone = true; finish(); });

    $.getJSON(shafiUrl)
      .done(function (res) {
        if (res && res.praytimes) sData = res;
      })
      .always(function () { sDone = true; finish(); });
  }

  function applyAsrMode() {
    const mode = localStorage.getItem(ASR_MODE_KEY) || 'shafi';
    prayers.forEach(function (p) {
      if (p.asrRole) p.hidden = p.asrRole !== mode;
    });
  }

  function toggleAsr() {
    const cur = localStorage.getItem(ASR_MODE_KEY) || 'shafi';
    localStorage.setItem(ASR_MODE_KEY, cur === 'shafi' ? 'hanafi' : 'shafi');
    applyAsrMode();
    cachePrayers(prayers);
    renderPrayers();
  }

  function computeTahajjud(today, tomorrow) {
    if (!today || !tomorrow) return null;
    const maghrib = hmToMin(today.Maghrib);
    const fajrNext = hmToMin(tomorrow.Fajr);
    if (!Number.isFinite(maghrib) || !Number.isFinite(fajrNext)) return null;
    const nightLen = fajrNext + DAY_MIN - maghrib;
    const startAbs = maghrib + Math.round((2 * nightLen) / 3);
    return {
      startMin: startAbs % DAY_MIN,
      endMin: fajrNext
    };
  }

  function todayKey() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '-'
         + String(d.getMonth() + 1).padStart(2, '0') + '-'
         + d.getFullYear();
  }

  function renderPrayers() {
    renderPrayerMarkers();
    renderPrayerPanel();
    renderSleepHint();
  }

  function renderSleepHint() {
    const $g = $('#sleep-hint');
    $g.empty();
    const isha = prayers.find(p => p.name === 'Иша');
    if (!isha) return;

    const sleepStart = (isha.min + 60) % DAY_MIN;
    const sleepEnd = (sleepStart + 8 * 60) % DAY_MIN;
    const ishaWindowStart = (isha.min - 10 + DAY_MIN) % DAY_MIN;
    const ishaWindowEnd = (isha.min + 40) % DAY_MIN;

    drawHintSector(ishaWindowStart, ishaWindowEnd, '#10b981', 0.4, $g);
    drawHintSector(sleepStart, sleepEnd, '#6366f1', 0.4, $g);
    drawHintSector(14 * 60, 14 * 60 + 25, '#6366f1', 0.4, $g);

    drawHintLabel(sleepStart, sleepEnd, '#818cf8', $g);
  }

  function drawHintLabel(startMin, endMin, color, $g) {
    const startSlot = startMin / STEP_MIN;
    const startAngle = slotToAngle(startSlot);
    const pos = polar(CENTER, CENTER, RING_IN - 42, startAngle);
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', pos.x);
    label.setAttribute('y', pos.y);
    label.setAttribute('class', 'arc-label');
    label.setAttribute('fill', color);
    label.textContent = formatTime(startMin);
    $g[0].appendChild(label);
  }

  function drawHintSector(startMin, endMin, color, opacity, $g) {
    const parts = endMin <= startMin
      ? [[startMin, DAY_MIN], [0, endMin]]
      : [[startMin, endMin]];

    parts.forEach(function (seg) {
      if (seg[1] === seg[0]) return;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', annularPath(seg[0] / STEP_MIN, seg[1] / STEP_MIN, RING_IN, RING_OUT));
      path.setAttribute('fill', color);
      path.setAttribute('opacity', String(opacity));
      path.setAttribute('pointer-events', 'none');
      $g[0].appendChild(path);
    });
  }

  function renderPrayerMarkers() {
    const $g = $('#prayers');
    $g.empty();
    prayers.forEach(function (p) {
      if (p.arc) {
        let startSlot = p.arc.startMin / STEP_MIN;
        let endSlot = p.arc.endMin / STEP_MIN;
        if (endSlot <= startSlot) endSlot += SLOTS_PER_DAY;
        const rIn = RING_IN - 18;
        const rOut = RING_IN - 12;
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', annularPath(startSlot, endSlot, rIn, rOut));
        path.setAttribute('fill', p.arc.color);
        path.setAttribute('opacity', '0.75');
        path.setAttribute('pointer-events', 'none');
        $g[0].appendChild(path);

        const startAngle = slotToAngle(startSlot);
        const arcLabelPos = polar(CENTER, CENTER, RING_IN - 42, startAngle);
        const arcLabel = document.createElementNS(SVG_NS, 'text');
        arcLabel.setAttribute('x', arcLabelPos.x);
        arcLabel.setAttribute('y', arcLabelPos.y);
        arcLabel.setAttribute('class', 'arc-label');
        arcLabel.setAttribute('fill', p.arc.color);
        arcLabel.textContent = formatTime(p.arc.startMin);
        $g[0].appendChild(arcLabel);
      }

      if (p.muted || p.routine || p.hidden) return;

      if (p.range) {
        let startSlot = p.startMin / STEP_MIN;
        let endSlot = p.endMin / STEP_MIN;
        if (endSlot <= startSlot) endSlot += SLOTS_PER_DAY;
        const rIn = RING_IN - 18;
        const rOut = RING_IN - 12;
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', annularPath(startSlot, endSlot, rIn, rOut));
        path.setAttribute('fill', p.color);
        path.setAttribute('opacity', '0.7');
        path.setAttribute('pointer-events', 'none');
        $g[0].appendChild(path);

        const rangeStartAngle = slotToAngle(startSlot);
        const rangeLabelPos = polar(CENTER, CENTER, RING_IN - 42, rangeStartAngle);
        const rangeLabel = document.createElementNS(SVG_NS, 'text');
        rangeLabel.setAttribute('x', rangeLabelPos.x);
        rangeLabel.setAttribute('y', rangeLabelPos.y);
        rangeLabel.setAttribute('class', 'arc-label');
        rangeLabel.setAttribute('fill', p.color);
        rangeLabel.textContent = formatTime(p.startMin);
        $g[0].appendChild(rangeLabel);
        return;
      }

      const angle = (p.min / DAY_MIN) * Math.PI * 2 - Math.PI / 2;
      const p1 = polar(CENTER, CENTER, RING_IN - 3, angle);
      const p2 = polar(CENTER, CENTER, RING_OUT + 6, angle);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
      line.setAttribute('class', 'prayer-marker');
      line.setAttribute('stroke', p.color);
      $g[0].appendChild(line);

      const labelPos = polar(CENTER, CENTER, RING_OUT + 32, angle);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', labelPos.x);
      label.setAttribute('y', labelPos.y);
      label.setAttribute('class', 'prayer-label');
      label.setAttribute('fill', p.color);
      label.textContent = formatTime(p.min);
      $g[0].appendChild(label);

      if (p.icon === 'glasses') {
        drawGlassesIcon(labelPos.x, labelPos.y - 16, $g[0]);
      }
    });
  }

  function drawGlassesIcon(cx, cy, parent) {
    const YELLOW = '#f59e0b';
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', 'translate(' + cx + ',' + cy + ')');
    g.setAttribute('pointer-events', 'none');

    const parts = [
      { tag: 'circle', attrs: { cx: -7, cy: 0, r: 5, stroke: YELLOW, 'stroke-width': 1.4, fill: YELLOW, 'fill-opacity': 0.35 } },
      { tag: 'circle', attrs: { cx: 7,  cy: 0, r: 5, stroke: YELLOW, 'stroke-width': 1.4, fill: YELLOW, 'fill-opacity': 0.35 } },
      { tag: 'line',   attrs: { x1: -2, y1: 0, x2: 2, y2: 0, stroke: YELLOW, 'stroke-width': 1.4 } },
      { tag: 'line',   attrs: { x1: -12, y1: -2, x2: -15, y2: -4, stroke: YELLOW, 'stroke-width': 1.4, 'stroke-linecap': 'round' } },
      { tag: 'line',   attrs: { x1: 12,  y1: -2, x2: 15,  y2: -4, stroke: YELLOW, 'stroke-width': 1.4, 'stroke-linecap': 'round' } }
    ];

    parts.forEach(function (p) {
      const el = document.createElementNS(SVG_NS, p.tag);
      Object.keys(p.attrs).forEach(k => el.setAttribute(k, p.attrs[k]));
      g.appendChild(el);
    });

    parent.appendChild(g);
  }

  function renderPrayerPanel() {
    const $panel = $('#prayer-panel');
    $panel.empty();

    if (prayers.length === 0) {
      $panel.append('<div class="prayer-error">не удалось загрузить</div>');
      return;
    }

    const nowMin = currentMinuteOfDay();
    const namaz = prayers.filter(p => !p.routine && !p.hidden && !p.hiddenInList);
    const routine = prayers.filter(p => p.routine);
    const next = namaz.find(p => !p.muted && !p.range && p.min > nowMin);

  }

  function buildPrayerGroup(title, list, next) {
    const $group = $('<div class="prayer-group">');
    $group.append($('<b>').text(title));
    const $list = $('<div class="prayer-list">');
    list.forEach(function (p) {
      const $row = $('<div class="prayer-row">');
      if (p === next) $row.addClass('next');
      if (p.range) $row.addClass('range');
      if (p.asrRole) {
        $row.addClass('clickable');
        $row.attr('title', 'Нажми, чтобы переключить мазхаб');
        $row.on('click', toggleAsr);
      }
      $row.append($('<span class="prayer-dot">').css('background', p.color));
      $row.append($('<span class="prayer-name">').text(p.name));
      const timeText = p.range
        ? formatTime(p.startMin) + ' – ' + formatTime(p.endMin)
        : formatTime(p.min);
      $row.append($('<span class="prayer-time">').text(timeText));
      $list.append($row);
    });
    $group.append($list);
    return $group;
  }

  function showPrayerError() {
    const $panel = $('#prayer-panel');
    $panel.find('.prayer-loading, .prayer-error, .prayer-list').remove();
    $panel.append('<div class="prayer-error">не удалось загрузить</div>');
  }

  function hmToMin(hm) {
    if (!hm) return NaN;
    const clean = hm.split(' ')[0];
    const [h, m] = clean.split(':').map(Number);
    return h * 60 + m;
  }

  function renderNow() {
    const $g = $('#now-indicator');
    $g.empty();
    const now = currentMinuteOfDay();
    const angle = (now / DAY_MIN) * Math.PI * 2 - Math.PI / 2;
    const tip = polar(CENTER, CENTER, RING_OUT + 12, angle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', CENTER);
    line.setAttribute('y1', CENTER);
    line.setAttribute('x2', tip.x);
    line.setAttribute('y2', tip.y);
    line.setAttribute('class', 'now-hand');
    $g[0].appendChild(line);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', tip.x);
    dot.setAttribute('cy', tip.y);
    dot.setAttribute('r', 4);
    dot.setAttribute('class', 'now-hand-tip');
    $g[0].appendChild(dot);

    $('#now-label').text(formatTime(now));
    renderCountdown();
  }

  function renderCountdown() {
    const $g = $('#prayer-countdown');
    $g.empty();
    if (!prayers.length) return;

    const nowMin = currentMinuteOfDay();
    const eligible = prayers.filter(p => !p.muted && !p.routine && !p.hidden && !p.range);
    if (!eligible.length) return;

    let next = eligible.find(p => p.min > nowMin);
    let minsLeft;
    if (next) {
      minsLeft = next.min - nowMin;
    } else {
      next = eligible[0];
      minsLeft = (next.min + DAY_MIN) - nowMin;
    }

    const x = CENTER;
    const yTop = CENTER + 32;
    const yBot = CENTER + 55;

    const l1 = document.createElementNS(SVG_NS, 'text');
    l1.setAttribute('x', x);
    l1.setAttribute('y', yTop);
    l1.setAttribute('class', 'countdown-label');
    l1.setAttribute('fill', next.color);
    l1.textContent = 'до ' + next.name;
    $g[0].appendChild(l1);

    const l2 = document.createElementNS(SVG_NS, 'text');
    l2.setAttribute('x', x);
    l2.setAttribute('y', yBot);
    l2.setAttribute('class', 'countdown-value');
    l2.setAttribute('fill', next.color);
    l2.textContent = formatDuration(minsLeft);
    $g[0].appendChild(l2);
  }

  function currentMinuteOfDay() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function cachePrayers(list) {
    try {
      localStorage.setItem(PRAYERS_CACHE_KEY, JSON.stringify({
        date: new Date().toDateString(),
        list: list
      }));
    } catch (e) {}
  }

  function getCachedPrayers() {
    try {
      const raw = JSON.parse(localStorage.getItem(PRAYERS_CACHE_KEY));
      if (!raw || raw.date !== new Date().toDateString()) return null;
      return raw.list;
    } catch (e) {
      return null;
    }
  }

  function initCalendar() {
    const now = new Date();
    calCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    $('#cal-prev').on('click', function () { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
    $('#cal-next').on('click', function () { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });
    $('#cal-days').on('click', '.cal-day.rest', function () {
      const key = $(this).data('key');
      const rested = getRested();
      if (rested[key]) delete rested[key];
      else rested[key] = true;
      localStorage.setItem(CAL_REST_KEY, JSON.stringify(rested));
      renderCalendar();
    });
    renderCalendar();
  }

  function renderCalendar() {
    $('#cal-title').text(MONTH_NAMES_RU[calCursor.getMonth()] + ' ' + calCursor.getFullYear());
    const $days = $('#cal-days').empty();

    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = (first.getDay() + 6) % 7;

    const today = new Date();
    const todayKey = dateKey(today);
    const rested = getRested();

    const $weekdays = $('.cal-weekdays span').removeClass('cal-today-head');
    $weekdays.eq((today.getDay() + 6) % 7).addClass('cal-today-head');

    for (let i = 0; i < firstDow; i++) {
      $days.append('<div class="cal-day empty"></div>');
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = dateKey(date);
      const isRest = date.getDay() === 5;
      const isToday = key === todayKey;
      const classes = ['cal-day'];
      if (isRest) classes.push('rest');
      if (isToday) classes.push('today');
      if (isRest && rested[key]) classes.push('rested');
      const $cell = $('<div>').addClass(classes.join(' ')).text(d);
      if (isRest) $cell.attr('data-key', key).data('key', key);
      $days.append($cell);
    }
  }

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getRested() {
    try {
      return JSON.parse(localStorage.getItem(CAL_REST_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function initHabits() {
    renderHabits();
    $('#habits').on('click', '.habit-btn', function (e) {
      const $card = $(this).closest('.habit-card');
      const id = $card.data('id');
      const wasDone = $card.hasClass('done');
      toggleHabit(id);
      if (!wasDone) spawnConfetti($card, e);
    });
  }

  function renderHabits() {
    const $box = $('#habits').empty();
    const log = getHabitsLog();
    const today = habitDateKey(new Date());

    HABITS.forEach(function (h) {
      const record = log[h.id] || {};
      const done = !!record[today];
      const streak = computeHabitStreak(record, done);
      const totalDays = Object.keys(record).length;
      const totalMin = totalDays * HABIT_MIN_PER_DAY;
      const nextMilestone = HABIT_MILESTONES.find(m => streak < m) || HABIT_MILESTONES[HABIT_MILESTONES.length - 1];
      const prevMilestone = HABIT_MILESTONES.slice().reverse().find(m => streak >= m) || 0;
      const progress = (streak - prevMilestone) / (nextMilestone - prevMilestone);
      const level = HABIT_LEVELS.slice().reverse().find(l => streak >= l.min).name;

      const $card = $('<div class="habit-card">')
        .attr('data-id', h.id).data('id', h.id)
        .css('--habit-color', h.color);
      if (done) $card.addClass('done');

      const $top = $('<div class="habit-top">');
      $top.append(buildHabitRing(h.icon, progress));
      const $info = $('<div class="habit-body">');
      $info.append($('<h4>').text(h.title));
      $info.append($('<div class="habit-level">').text(level + ' · до ' + nextMilestone + ' дней'));
      $top.append($info);
      $card.append($top);

      $card.append($('<div class="habit-goal">').text(h.goal));

      const $stats = $('<div class="habit-stats">');
      $stats.append($('<div class="habit-stat">')
        .append($('<span class="val">').text('🔥 ' + streak))
        .append($('<span class="lbl">').text('дней подряд')));
      $stats.append($('<div class="habit-stat">')
        .append($('<span class="val">').text(formatMinutes(totalMin)))
        .append($('<span class="lbl">').text('вложено')));
      $card.append($stats);

      $card.append(buildHeatmap(record));

      $card.append($('<button class="habit-btn" type="button">').text(done ? 'Сделано сегодня' : 'Отметить сегодня'));
      $box.append($card);
    });
  }

  function buildHabitRing(icon, progress) {
    const $wrap = $('<div class="habit-ring">');
    const r = 24;
    const c = 2 * Math.PI * r;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 54 54');

    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', 27); bg.setAttribute('cy', 27); bg.setAttribute('r', r);
    bg.setAttribute('class', 'ring-bg-circle');
    svg.appendChild(bg);

    const fg = document.createElementNS(SVG_NS, 'circle');
    fg.setAttribute('cx', 27); fg.setAttribute('cy', 27); fg.setAttribute('r', r);
    fg.setAttribute('class', 'ring-fg-circle');
    fg.setAttribute('stroke-dasharray', c);
    fg.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(1, progress))));
    svg.appendChild(fg);

    $wrap[0].appendChild(svg);
    $wrap.append($('<span class="ring-icon">').text(icon));
    return $wrap;
  }

  function buildHeatmap(record) {
    const $map = $('<div class="habit-heatmap">');
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = habitDateKey(d);
      const cls = 'cell' + (record[key] ? ' done' : '') + (i === 0 ? ' today' : '');
      $map.append($('<div>').attr('class', cls).attr('title', key));
    }
    return $map;
  }

  function formatMinutes(m) {
    if (m < 60) return m + ' мин';
    const h = Math.floor(m / 60);
    return h + ' ч';
  }

  function spawnConfetti($card, e) {
    const emojis = ['✨', '🔥', '⭐', '💫', '🎉'];
    const cardRect = $card[0].getBoundingClientRect();
    const originX = (e.clientX || cardRect.left + cardRect.width / 2) - cardRect.left;
    const originY = (e.clientY || cardRect.top + cardRect.height / 2) - cardRect.top;
    for (let i = 0; i < 8; i++) {
      const $c = $('<span class="habit-confetti">')
        .text(emojis[i % emojis.length])
        .css({
          left: originX + 'px',
          top: originY + 'px',
          '--dx': (Math.random() * 160 - 80) + 'px',
          '--dy': (Math.random() * -120 - 20) + 'px'
        });
      $card.append($c);
      setTimeout(function () { $c.remove(); }, 950);
    }
  }

  function toggleHabit(id) {
    const log = getHabitsLog();
    const today = habitDateKey(new Date());
    if (!log[id]) log[id] = {};
    if (log[id][today]) delete log[id][today];
    else log[id][today] = true;
    localStorage.setItem(HABITS_LOG_KEY, JSON.stringify(log));
    renderHabits();
  }

  function computeHabitStreak(record, doneToday) {
    let streak = 0;
    const d = new Date();
    if (!doneToday) d.setDate(d.getDate() - 1);
    while (record[habitDateKey(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function habitDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getHabitsLog() {
    try {
      return JSON.parse(localStorage.getItem(HABITS_LOG_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function playOmnitrix() {
    const el = document.getElementById('omnitrix-boot');
    if (!el) return;
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
});
