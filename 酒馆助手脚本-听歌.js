(function () {
  'use strict';

  /* ═══════════ 配置 ═══════════ */
  const API   = 'https://music-api.gdstudio.xyz/api.php';
  const PROXY = '';                       // 留空即可；音频被防盗链挡时才需要填反代
  const BR    = '320';                    // 128 / 192 / 320 / 740 / 999
  const TAG   = /<听个歌吧>([\s\S]*?)<\/听个歌吧>/g;

  /* 音源清单：id 是接口参数，label 是面板里显示的名字。
     官方 2026-06-26 标注的稳定源：netease、joox、bilibili。
     kuwo 已掉出稳定名单，tidal/qobuz/spotify/ytmusic 多半查得到、拿不到链接。 */
  const SOURCES = [
    { id: 'auto',     label: '聚合' },
    { id: 'netease',  label: '网易云' },
    { id: 'joox',     label: 'JOOX' },
    { id: 'bilibili', label: '哔哩' },
    { id: 'tencent',  label: 'QQ音乐' },
    { id: 'kuwo',     label: '酷我' },
    { id: 'apple',    label: 'Apple' },
    { id: 'tidal',    label: 'TIDAL' },
    { id: 'qobuz',    label: 'Qobuz' },
    { id: 'ytmusic',  label: 'YTMusic' },
    { id: 'spotify',  label: 'Spotify' }
  ];
  const AUTO    = ['netease', 'joox', 'tencent', 'kuwo'];  // 聚合模式并发搜这几个
  const DEFAULT = 'auto';

  const LRC_OFFSET = 0;       // 时轴偏移（秒）。词跑快了填正数，慢了填负数
  const LRC_TRANS  = true;    // 有中文翻译时一并显示

  const SRC_KEY = 'jhm-player-source-v1';
  const LRC_KEY = 'jhm-player-lyric-v1';
  /* ═══════════════════════════ */

  const W = window.parent || window;
  const D = W.document || document;

  const LABEL = id => (SOURCES.find(s => s.id === id) || {}).label || id;

  /* 脚本重载后旧元素还挂在父页面上，但监听器已随旧沙箱失效 → 先清干净再注入 */
  if (typeof W.__jhmCleanup === 'function') { try { W.__jhmCleanup(); } catch (e) {} }
  ['jhm-ball', 'jhm-panel', 'jhm-lrc', 'jhm-style'].forEach(id => {
    const el = D.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });

  /* ---------- 样式 ---------- */
  const css = D.createElement('style');
  css.id = 'jhm-style';
  css.textContent = `
  #jhm-ball{position:fixed;right:16px;bottom:96px;z-index:99998;width:42px;height:42px;
    border:1px solid #9c3a2e;color:#9c3a2e;border-radius:50%;background:rgba(247,242,231,.94);
    font-family:"Songti SC",STSong,SimSun,serif;font-size:17px;cursor:grab;touch-action:none;
    display:flex;align-items:center;justify-content:center;user-select:none;opacity:.62;
    box-shadow:0 2px 8px rgba(80,60,30,.2);transition:opacity .3s,transform .3s}
  #jhm-ball:hover{opacity:1;transform:scale(1.09)}
  #jhm-ball.jhm-dragging{cursor:grabbing;transition:none;transform:none}
  #jhm-ball.playing{opacity:1;animation:jhmPulse 2.4s ease-in-out infinite}
  @keyframes jhmPulse{0%,100%{box-shadow:0 2px 8px rgba(156,58,46,.28)}50%{box-shadow:0 2px 16px rgba(156,58,46,.6)}}

  /* ── 悬浮词条：跟着圆球走，三行，居中那行是当前句 ── */
  #jhm-lrc{position:fixed;z-index:99997;display:none;pointer-events:none;box-sizing:border-box;
    height:72px;overflow:hidden;padding:0 13px;
    font-family:"Songti SC","Noto Serif SC",STSong,SimSun,serif;
    background:rgba(247,242,231,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
    -webkit-mask-image:linear-gradient(180deg,transparent,#000 27%,#000 73%,transparent);
    mask-image:linear-gradient(180deg,transparent,#000 27%,#000 73%,transparent)}
  #jhm-lrc.on{display:block}
  #jhm-lrc.at-left{text-align:right;border-right:1px solid rgba(156,58,46,.5)}
  #jhm-lrc.at-right{text-align:left;border-left:1px solid rgba(156,58,46,.5)}
  #jhm-lrc.at-top{text-align:center;border-bottom:1px solid rgba(156,58,46,.5)}
  .jhm-lrc-in{position:relative;transition:transform .45s cubic-bezier(.4,0,.2,1);will-change:transform}
  .jhm-lrc-l{font-size:12.5px;line-height:1.5;padding:2px 0;letter-spacing:.02em;
    color:rgba(92,81,69,.55);transition:color .35s,opacity .35s}
  .jhm-lrc-l.on{color:#9c3a2e;font-weight:600}
  .jhm-lrc-l .tr{display:block;font-size:.85em;font-weight:400;color:rgba(120,105,80,.8);margin-top:1px}
  @media (prefers-reduced-motion:reduce){.jhm-lrc-in{transition:none}}

  #jhm-panel{position:fixed;right:16px;bottom:148px;z-index:99999;width:326px;max-width:calc(100vw - 32px);
    font-family:"Songti SC","Noto Serif SC",STSong,SimSun,serif;color:#3a332b;
    background:linear-gradient(158deg,#f8f4ea,#f1ebdd 55%,#e9e0cf);
    border:1px solid #c9bda5;box-shadow:0 4px 18px rgba(80,60,30,.24);
    display:none;overflow:hidden}
  #jhm-panel.on{display:block;animation:jhmIn .38s cubic-bezier(.4,0,.2,1) both}
  @keyframes jhmIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
  #jhm-panel:before{content:"";position:absolute;inset:6px;border:1px solid rgba(152,131,96,.3);pointer-events:none;z-index:3}

  .jhm-hd{text-align:center;padding:12px 0 10px;font-size:1.04em;font-weight:600;
    letter-spacing:.5em;text-indent:.5em;border-bottom:2px double #c8bba1;
    cursor:grab;user-select:none;touch-action:none}
  .jhm-hd.jhm-dragging{cursor:grabbing}
  .jhm-sr{display:flex;gap:7px;padding:11px 15px 7px}
  .jhm-sr input{flex:1;min-width:0;background:rgba(255,253,247,.75);border:1px solid #cdc0a8;
    padding:6px 9px;font-family:inherit;font-size:.88em;color:#3a332b;outline:none;transition:border-color .25s}
  .jhm-sr input:focus{border-color:#9c3a2e}
  .jhm-sr button{flex:none;background:none;border:1px solid #9c3a2e;color:#9c3a2e;
    padding:0 12px;font-family:inherit;font-size:.86em;cursor:pointer;transition:background .25s,color .25s}
  .jhm-sr button:hover{background:#9c3a2e;color:#f8f4ea}

  .jhm-sec{display:flex;align-items:center;justify-content:space-between;gap:10px;
    padding:2px 15px 0;font-size:.72em;color:#9a8a6d;letter-spacing:.16em}
  .jhm-pick{display:flex;align-items:center;gap:5px;letter-spacing:.1em;flex:none}
  .jhm-pick select{font-family:inherit;font-size:1.06em;color:#7a6a4e;background:transparent;
    border:0;border-bottom:1px solid #c8bba1;padding:1px 14px 1px 2px;outline:none;cursor:pointer;
    letter-spacing:.06em;-webkit-appearance:none;appearance:none;
    background-image:linear-gradient(45deg,transparent 50%,#a5977c 50%),linear-gradient(135deg,#a5977c 50%,transparent 50%);
    background-position:calc(100% - 7px) 60%,calc(100% - 3px) 60%;
    background-size:4px 4px,4px 4px;background-repeat:no-repeat;transition:color .25s,border-color .25s}
  .jhm-pick select:hover,.jhm-pick select:focus{color:#9c3a2e;border-bottom-color:#9c3a2e}
  .jhm-pick select option{background:#f6f1e5;color:#3a332b}

  .jhm-list{max-height:186px;overflow-y:auto;padding:4px 9px 8px;scrollbar-width:thin}
  .jhm-list::-webkit-scrollbar{width:4px}
  .jhm-list::-webkit-scrollbar-thumb{background:#c6b99f}
  .jhm-row{padding:6px 8px;font-size:.85em;line-height:1.45;cursor:pointer;position:relative;
    border-bottom:1px solid rgba(160,140,105,.16);transition:background .2s;animation:jhmUp .3s ease both}
  .jhm-row:last-child{border-bottom:0}
  .jhm-row:hover{background:rgba(200,180,140,.19)}
  .jhm-row .n{padding-left:11px;padding-right:16px}
  .jhm-row .a{padding-left:11px;font-size:.8em;color:#8d7e63;margin-top:1px}
  .jhm-row.cur .n{color:#9c3a2e;font-weight:600}
  .jhm-row.cur:before{content:"";position:absolute;left:1px;top:11px;width:5px;height:5px;
    background:#9c3a2e;transform:rotate(45deg);animation:jhmBeat 1.6s ease-in-out infinite}
  @keyframes jhmBeat{0%,100%{opacity:.45}50%{opacity:1}}
  @keyframes jhmUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
  .jhm-row .x{position:absolute;right:6px;top:7px;color:#b3a68c;font-size:.9em;padding:0 3px;opacity:0;transition:opacity .2s,color .2s}
  .jhm-row:hover .x{opacity:1}
  .jhm-row .x:hover{color:#9c3a2e}
  .jhm-tag{color:#a5977c;letter-spacing:.06em}
  .jhm-tag:before{content:"　·　"}

  .jhm-ft{border-top:1px solid #c8bba1;padding:9px 15px 6px;background:rgba(240,233,219,.5)}
  .jhm-now{font-size:.83em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#5c5145;min-height:1.2em}
  .jhm-bar{height:2px;background:rgba(160,140,105,.3);margin:7px 0 6px;cursor:pointer;position:relative}
  .jhm-bar i{display:block;height:100%;width:0;background:#9c3a2e;transition:width .25s linear}
  .jhm-time{display:flex;justify-content:space-between;font-size:.7em;color:#9a8a6d;letter-spacing:.06em;margin:-2px 0 5px;font-variant-numeric:tabular-nums}
  .jhm-ctl{display:flex;align-items:center;justify-content:center;gap:17px;padding-bottom:2px}
  .jhm-ctl span{cursor:pointer;color:#6d6154;font-size:.95em;transition:color .25s,transform .25s,opacity .25s;user-select:none}
  .jhm-ctl span:hover{color:#9c3a2e;transform:scale(1.15)}
  .jhm-ctl .pp{font-size:1.1em;color:#9c3a2e}
  .jhm-ctl .muted{opacity:.35}
  .jhm-src{text-align:center;font-size:.62em;color:#a5977c;letter-spacing:.1em;padding:3px 0 8px}
  .jhm-tip{padding:14px 15px;font-size:.82em;color:#9a8a6d;text-align:center;line-height:1.7}`;
  D.head.appendChild(css);

  /* ---------- 结构 ---------- */
  const ball = D.createElement('div');
  ball.id = 'jhm-ball'; ball.textContent = '曲'; ball.title = '听曲';

  const L = D.createElement('div');
  L.id = 'jhm-lrc';
  L.innerHTML = '<div class="jhm-lrc-in" id="jhm-lrc-in"></div>';

  const p = D.createElement('div');
  p.id = 'jhm-panel';
  p.innerHTML = `
    <div class="jhm-hd">聽　曲</div>
    <div class="jhm-sr">
      <input id="jhm-kw" placeholder="搜曲目、歌手、专辑" autocomplete="off">
      <button id="jhm-go">寻</button>
    </div>
    <div class="jhm-sec">
      <span id="jhm-lbl">曲　单</span>
      <span class="jhm-pick">源
        <select id="jhm-sel" title="换个音源再找">
          ${SOURCES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
      </span>
    </div>
    <div class="jhm-list" id="jhm-box"><div class="jhm-tip">曲单空空。<br>搜一首，或等他哼一句。</div></div>
    <div class="jhm-ft">
      <div class="jhm-now" id="jhm-now">—</div>
      <div class="jhm-bar" id="jhm-bar"><i id="jhm-fill"></i></div>
      <div class="jhm-time"><span id="jhm-t1">00:00</span><span id="jhm-t2">00:00</span></div>
      <div class="jhm-ctl">
        <span id="jhm-prev">◁</span><span class="pp" id="jhm-pp">▷</span><span id="jhm-next">▷|</span>
        <span id="jhm-back" title="回到曲单">≡</span>
        <span id="jhm-lrcbtn" title="悬浮歌词">词</span>
      </div>
      <div class="jhm-src">曲源　GD音乐台 music.gdstudio.xyz</div>
    </div>`;
  D.body.appendChild(ball); D.body.appendChild(L); D.body.appendChild(p);

  const $ = id => D.getElementById(id);
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const audio = new Audio(); audio.volume = 0.7;

  let queue = [], cur = -1, mode = 'queue', results = [];
  let lrcLines = [], lrcIdx = -1, lrcToken = 0;

  /* ---------- 音源选择 ---------- */
  let curSrc = DEFAULT;
  try {
    const saved = W.localStorage.getItem(SRC_KEY);
    if (saved && SOURCES.some(s => s.id === saved)) curSrc = saved;
  } catch (e) {}
  $('jhm-sel').value = curSrc;

  $('jhm-sel').addEventListener('change', e => {
    curSrc = e.target.value;
    try { W.localStorage.setItem(SRC_KEY, curSrc); } catch (err) {}
    /* 换源后如果搜索框里还有词，直接用新源再找一遍 */
    if ($('jhm-kw').value.trim()) doSearch();
  });

  /* ---------- 歌词开关 ---------- */
  let lrcOn = true;
  try { lrcOn = W.localStorage.getItem(LRC_KEY) !== '0'; } catch (e) {}
  function paintLrcBtn() { $('jhm-lrcbtn').classList.toggle('muted', !lrcOn); }
  paintLrcBtn();
  $('jhm-lrcbtn').onclick = () => {
    lrcOn = !lrcOn;
    try { W.localStorage.setItem(LRC_KEY, lrcOn ? '1' : '0'); } catch (e) {}
    paintLrcBtn(); positionLyric();
  };

  /* ---------- 拖动与定位 ---------- */
  const EDGE = 8, GAP = 10, POS_KEY = 'jhm-player-position-v1';
  const dragCleanups = [];
  let suppressBallClick = false;

  const viewport = () => ({
    w: W.innerWidth || D.documentElement.clientWidth,
    h: W.innerHeight || D.documentElement.clientHeight
  });
  const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));

  function applyBallPosition(x, y) {
    const v = viewport();
    x = clamp(x, EDGE, v.w - ball.offsetWidth - EDGE);
    y = clamp(y, EDGE, v.h - ball.offsetHeight - EDGE);
    ball.style.left = x + 'px';
    ball.style.top = y + 'px';
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
    positionLyric();
  }

  function positionPanel() {
    if (!p.classList.contains('on')) return;
    const v = viewport();
    const bw = ball.offsetWidth, bh = ball.offsetHeight;
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const bx = ball.offsetLeft, by = ball.offsetTop;
    let x = bx + bw - pw;
    let y = by - ph - GAP;

    /* 上方放不下时改放在圆球下方。 */
    if (y < EDGE && by + bh + GAP + ph <= v.h - EDGE) y = by + bh + GAP;
    x = clamp(x, EDGE, v.w - pw - EDGE);
    y = clamp(y, EDGE, v.h - ph - EDGE);
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.right = 'auto';
    p.style.bottom = 'auto';
  }

  /* 词条挨着圆球放：哪边宽往哪边贴，两边都窄就压在圆球上方。 */
  function positionLyric() {
    if (!lrcOn || !lrcLines.length) { L.classList.remove('on'); return; }
    const v = viewport();
    const bx = ball.offsetLeft, by = ball.offsetTop;
    const bw = ball.offsetWidth, bh = ball.offsetHeight;
    const roomL = bx - EDGE - GAP;
    const roomR = v.w - (bx + bw) - EDGE - GAP;
    let side;
    if (Math.max(roomL, roomR) < 150) side = 'top';
    else side = roomL >= roomR ? 'left' : 'right';

    /* 压在上方时会和面板打架，面板开着就先让位。 */
    if (side === 'top' && p.classList.contains('on')) { L.classList.remove('on'); return; }

    L.classList.add('on');
    L.classList.remove('at-left', 'at-right', 'at-top');
    L.classList.add('at-' + side);

    const w = side === 'top'
      ? Math.min(300, v.w - 2 * EDGE)
      : Math.min(260, side === 'left' ? roomL : roomR);
    L.style.width = w + 'px';

    const h = L.offsetHeight;
    let x, y;
    if (side === 'left')  { x = bx - GAP - w;  y = by + bh / 2 - h / 2; }
    if (side === 'right') { x = bx + bw + GAP; y = by + bh / 2 - h / 2; }
    if (side === 'top')   { x = bx + bw / 2 - w / 2; y = by - GAP - h; }
    L.style.left = clamp(x, EDGE, v.w - w - EDGE) + 'px';
    L.style.top  = clamp(y, EDGE, v.h - h - EDGE) + 'px';

    scrollLyric();
  }

  function setBallPosition(x, y) {
    applyBallPosition(x, y);
    positionPanel();
  }

  function setPanelPosition(x, y) {
    const v = viewport();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const bw = ball.offsetWidth, bh = ball.offsetHeight;

    /* 标题栏拖动时，圆球跟在面板右下方。 */
    x = clamp(x, EDGE, v.w - pw - EDGE);
    y = clamp(y, EDGE, v.h - ph - GAP - bh - EDGE);
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.right = 'auto';
    p.style.bottom = 'auto';
    applyBallPosition(x + pw - bw, y + ph + GAP);
  }

  function savePosition() {
    try {
      W.localStorage.setItem(POS_KEY, JSON.stringify({
        x: ball.offsetLeft,
        y: ball.offsetTop
      }));
    } catch (e) {}
  }

  function bindDrag(handle, readPosition, movePosition, isBall) {
    let drag = null;

    const onDown = e => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const start = readPosition();
      drag = {
        id: e.pointerId,
        px: e.clientX,
        py: e.clientY,
        x: start.x,
        y: start.y,
        moved: false
      };
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const onMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      e.preventDefault();
      handle.classList.add('jhm-dragging');
      movePosition(drag.x + dx, drag.y + dy);
    };
    const onEnd = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      handle.classList.remove('jhm-dragging');
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) {
        savePosition();
        if (isBall) {
          suppressBallClick = true;
          W.setTimeout(() => { suppressBallClick = false; }, 0);
        }
      }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
    dragCleanups.push(() => {
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
    });
  }

  const initialRect = ball.getBoundingClientRect();
  let initialPosition = { x: initialRect.left, y: initialRect.top };
  try {
    const saved = JSON.parse(W.localStorage.getItem(POS_KEY));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) initialPosition = saved;
  } catch (e) {}
  setBallPosition(initialPosition.x, initialPosition.y);

  bindDrag(ball, () => ({
    x: ball.offsetLeft,
    y: ball.offsetTop
  }), setBallPosition, true);
  bindDrag(p.querySelector('.jhm-hd'), () => ({
    x: p.offsetLeft,
    y: p.offsetTop
  }), setPanelPosition, false);

  const onViewportResize = () => setBallPosition(ball.offsetLeft, ball.offsetTop);
  W.addEventListener('resize', onViewportResize);

  /* ---------- 接口 ---------- */
  function api(q) {
    let u = API + '?' + new URLSearchParams(q).toString();
    if (PROXY) u = PROXY + encodeURIComponent(u);
    return fetch(u).then(r => r.json());
  }

  const artist = t => Array.isArray(t.artist) ? t.artist.join(' / ') : (t.artist || '');
  const srcOf  = t => t.source || 'netease';
  const key    = t => srcOf(t) + ':' + t.id;

  const cache = new Map();

  /* 单源搜索。空结果不写缓存 —— 否则一次限频就把这个关键词钉死了。 */
  async function searchOne(src, kw, n) {
    const ck = src + '|' + kw + '|' + n;
    if (cache.has(ck)) return cache.get(ck);
    const r = await api({ types: 'search', source: src, name: kw, count: n, pages: 1 });
    const list = (Array.isArray(r) ? r : [])
      .filter(x => x && x.id)
      .map(x => Object.assign({}, x, { source: x.source || src }));
    if (list.length) cache.set(ck, list);
    return list;
  }

  /* 聚合模式：几个源同时搜，轮流各取一首，保证每个源都能露脸。 */
  async function searchAll(kw, n) {
    const per = Math.max(6, Math.ceil(n / 2));
    const settled = await Promise.allSettled(AUTO.map(s => searchOne(s, kw, per)));
    const lists = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn('[听曲] 源 ' + AUTO[i] + ' 取不到', r.reason);
      return [];
    });
    if (!lists.some(l => l.length)) {
      if (settled.every(r => r.status === 'rejected')) throw settled[0].reason;
      return [];
    }
    const out = [], seen = new Set();
    for (let i = 0; i < per; i++) {
      for (const list of lists) {
        const t = list[i];
        if (!t || seen.has(key(t))) continue;
        seen.add(key(t)); out.push(t);
      }
    }
    return out;
  }

  const search = (kw, n = 20) => curSrc === 'auto' ? searchAll(kw, n) : searchOne(curSrc, kw, n);

  /* 原词搜不到时，去掉括注、破折号再试一次 */
  const simplify = kw => kw
    .replace(/[（(【\[《].*?[）)】\]》]/g, ' ')
    .replace(/\s*[-—–~～|｜/]\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();

  async function searchSmart(kw, n) {
    let r = await search(kw, n);
    if (r.length) return r;
    const s = simplify(kw);
    if (s && s !== kw) r = await search(s, n);
    return r;
  }

  const BRS = [BR, '128', '999'];

  async function urlOf(t, brs) {
    for (const br of (brs || BRS)) {
      try {
        const r = await api({ types: 'url', source: srcOf(t), id: t.id, br });
        if (r && r.url) return r.url.replace(/^http:/, 'https:');
      } catch (err) { console.warn('[听曲] 取链失败 br=' + br, err); }
    }
    return '';
  }

  const norm = s => String(s || '').replace(/[\s（）()【】\[\]·・,，.。!！?？'"“”]/g, '').toLowerCase();

  /* 本源拿不到链接 → 换别的源找同名曲再试 */
  async function resolve(t) {
    let u = await urlOf(t);
    if (u) return u;
    const kw = (t.name + ' ' + artist(t)).trim();
    const others = AUTO.filter(s => s !== srcOf(t));
    if (curSrc !== 'auto' && !others.includes(curSrc) && curSrc !== srcOf(t)) others.unshift(curSrc);
    for (const s of others) {
      try {
        const r = await api({ types: 'search', source: s, name: kw, count: 5, pages: 1 });
        if (!Array.isArray(r) || !r.length) continue;
        const cand = r.find(x => norm(x.name) === norm(t.name)) || r[0];
        cand.source = cand.source || s;
        u = await urlOf(cand, ['320']);
        if (u) { console.info('[听曲] 本源无链，改用 ' + s); return u; }
      } catch (err) { console.warn('[听曲] 换源 ' + s + ' 失败', err); }
    }
    return '';
  }

  /* ---------- 歌词 ---------- */
  const lrcCache = new Map();

  /* [mm:ss.xx] 一行可能挂好几个时间戳；[ti:] [by:] 这类元信息不匹配数字，自然被滤掉 */
  function parseLrc(txt) {
    const out = [];
    if (!txt) return out;
    const re = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
    String(txt).split(/\r?\n/).forEach(line => {
      const stamps = [];
      let m; re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        stamps.push(+m[1] * 60 + parseFloat(String(m[2]).replace(':', '.')));
      }
      if (!stamps.length) return;
      const text = line.replace(/\[[^\]]*\]/g, '').trim();
      stamps.forEach(t => out.push({ t, text }));
    });
    return out.sort((a, b) => a.t - b.t);
  }

  /* 翻译按时间戳对齐，差 0.1 秒以内算同一句 */
  function mergeLrc(lyric, tlyric) {
    const a = parseLrc(lyric);
    if (!LRC_TRANS) return a;
    const b = parseLrc(tlyric);
    if (!b.length) return a;
    const map = new Map();
    b.forEach(x => { if (x.text) map.set(Math.round(x.t * 10), x.text); });
    return a.map(x => {
      const k = Math.round(x.t * 10);
      const tr = map.get(k) || map.get(k + 1) || map.get(k - 1) || '';
      return (tr && tr !== x.text) ? { t: x.t, text: x.text, tr } : x;
    });
  }

  async function fetchLyric(t) {
    const id = t.lyric_id || t.id;
    const ck = srcOf(t) + ':' + id;
    if (lrcCache.has(ck)) return lrcCache.get(ck);
    let lines = [];
    try {
      const r = await api({ types: 'lyric', source: srcOf(t), id });
      lines = mergeLrc(r && r.lyric, r && r.tlyric);
    } catch (err) { console.warn('[听曲] 取词失败', err); }
    if (lines.length) lrcCache.set(ck, lines);
    return lines;
  }

  function paintLyric() {
    $('jhm-lrc-in').innerHTML = lrcLines.map((l, i) =>
      `<div class="jhm-lrc-l" data-l="${i}">${esc(l.text) || '&nbsp;'}` +
      (l.tr ? `<span class="tr">${esc(l.tr)}</span>` : '') + '</div>').join('');
  }

  /* 把当前句挪到词条正中 */
  function scrollLyric() {
    const inner = $('jhm-lrc-in');
    const el = inner.querySelector('[data-l="' + lrcIdx + '"]') || inner.firstElementChild;
    inner.querySelectorAll('.on').forEach(n => n.classList.remove('on'));
    if (!el) { inner.style.transform = 'none'; return; }
    if (lrcIdx >= 0) el.classList.add('on');
    inner.style.transform =
      'translateY(' + (L.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2)) + 'px)';
  }

  function syncLyric() {
    if (!lrcLines.length) return;
    const t = audio.currentTime + LRC_OFFSET;
    let i = lrcIdx;
    if (i < 0 || i >= lrcLines.length || t < lrcLines[i].t) i = -1;   // 拖过进度条就从头找
    while (i + 1 < lrcLines.length && lrcLines[i + 1].t <= t) i++;
    if (i === lrcIdx) return;
    lrcIdx = i;
    scrollLyric();
  }

  async function loadLyric(t) {
    const token = ++lrcToken;
    lrcLines = []; lrcIdx = -1;
    paintLyric(); positionLyric();
    const lines = await fetchLyric(t);
    if (token !== lrcToken) return;
    lrcLines = lines;
    if (!lines.length) console.info('[听曲] 此曲无逐句歌词：' + t.name);
    paintLyric(); positionLyric(); syncLyric();
  }

  function clearLyric() {
    lrcToken++; lrcLines = []; lrcIdx = -1;
    paintLyric(); positionLyric();
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const box = $('jhm-box'), arr = mode === 'queue' ? queue : results;
    $('jhm-lbl').textContent = mode === 'queue' ? '曲　单' : '搜　得';
    if (!arr.length) {
      box.innerHTML = `<div class="jhm-tip">${mode === 'queue'
        ? '曲单空空。<br>搜一首，或等他哼一句。'
        : (curSrc === 'auto'
            ? '几个源都没有。<br>换个写法，或单点某个源试试。'
            : '「' + esc(LABEL(curSrc)) + '」没有这首。<br>右上角换个源再找。')}</div>`;
      return;
    }
    box.innerHTML = arr.map((t, i) => `
      <div class="jhm-row ${mode === 'queue' && i === cur ? 'cur' : ''}"
           style="animation-delay:${Math.min(i, 9) * .035}s" data-i="${i}">
        <div class="n">${esc(t.name)}</div>
        <div class="a">${esc(artist(t))}<span class="jhm-tag">${esc(LABEL(srcOf(t)))}</span></div>
        ${mode === 'queue' ? '<span class="x" data-x="' + i + '">✕</span>' : ''}
      </div>`).join('');
  }

  $('jhm-box').addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (x) {
      e.stopPropagation();
      const i = +x.dataset.x;
      queue.splice(i, 1);
      if (cur === i) {
        cur = -1; audio.pause(); $('jhm-now').textContent = '—';
        ball.classList.remove('playing'); clearLyric();
      } else if (cur > i) cur--;
      render(); return;
    }
    const row = e.target.closest('[data-i]'); if (!row) return;
    const i = +row.dataset.i;
    if (mode === 'queue') play(i);
    else {
      const t = results[i];
      const at = queue.findIndex(q => key(q) === key(t));
      if (at >= 0) { mode = 'queue'; render(); play(at); }
      else { queue.push(t); mode = 'queue'; render(); play(queue.length - 1); }
    }
  });

  /* ---------- 播放 ---------- */
  async function play(i) {
    if (i < 0 || i >= queue.length) return;
    cur = i;
    const t = queue[i];
    $('jhm-now').textContent = '⟨载⟩ ' + t.name;
    $('jhm-t1').textContent = $('jhm-t2').textContent = '00:00';
    $('jhm-fill').style.width = '0%';
    mode = 'queue'; render();
    loadLyric(t);                       // 和取链并行，不必等

    let u = '';
    try { u = await resolve(t); }
    catch (err) { console.warn('[听曲] 取链异常', err); }
    if (!u) { $('jhm-now').textContent = '各源均无链接：' + t.name; return; }

    audio.src = u;
    $('jhm-now').innerHTML = esc(t.name) + '　·　' + esc(artist(t)) +
      '<span class="jhm-tag">' + esc(LABEL(srcOf(t))) + '</span>';
    $('jhm-pp').textContent = '‖';
    ball.classList.add('playing');

    try {
      await audio.play();
    } catch (err) {
      /* play() 被 load 打断时也会 reject，但声音其实已经出来了。
         等一拍，只有真的停着才算失败。 */
      setTimeout(() => {
        if (!audio.paused) return;
        console.warn('[听曲] 播放被拒', err);
        $('jhm-now').textContent = (err && err.name === 'NotAllowedError')
          ? '浏览器拦了自动播放，点一下 ▷' : '播放失败：' + t.name;
        $('jhm-pp').textContent = '▷';
        ball.classList.remove('playing');
      }, 500);
    }
  }
  const next = () => queue.length && play((cur + 1) % queue.length);
  const prev = () => queue.length && play((cur - 1 + queue.length) % queue.length);

  $('jhm-pp').onclick = () => {
    if (!audio.src) { if (queue.length) play(cur < 0 ? 0 : cur); return; }
    if (audio.paused) { audio.play(); $('jhm-pp').textContent = '‖'; ball.classList.add('playing'); }
    else { audio.pause(); $('jhm-pp').textContent = '▷'; ball.classList.remove('playing'); }
  };
  $('jhm-next').onclick = next;
  $('jhm-prev').onclick = prev;
  $('jhm-back').onclick = () => { mode = 'queue'; render(); };
  audio.addEventListener('ended', next);
  const fmt = s => {
    if (!isFinite(s) || s < 0) return '00:00';
    const m = Math.floor(s / 60), q = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (q < 10 ? '0' : '') + q;
  };
  function tick() {
    $('jhm-t1').textContent = fmt(audio.currentTime);
    $('jhm-t2').textContent = fmt(audio.duration);
    $('jhm-fill').style.width = (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%';
    syncLyric();
  }
  audio.addEventListener('timeupdate', tick);
  audio.addEventListener('loadedmetadata', tick);
  audio.addEventListener('durationchange', tick);
  audio.addEventListener('seeked', syncLyric);
  $('jhm-bar').onclick = e => {
    if (!audio.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
  };

  /* ---------- 搜索 ---------- */
  async function doSearch() {
    const kw = $('jhm-kw').value.trim(); if (!kw) return;
    $('jhm-box').innerHTML = '<div class="jhm-tip">寻曲中……</div>';
    try {
      results = await searchSmart(kw, 20);
      mode = 'search'; render();
    } catch (err) {
      console.warn('[听曲]', err);
      $('jhm-box').innerHTML = '<div class="jhm-tip">取不到。可能是限频（五分钟五十次），<br>歇一会儿，或换个源再试。</div>';
    }
  }
  $('jhm-go').onclick = doSearch;
  $('jhm-kw').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  /* ---------- 标签自动点曲 ---------- */
  async function addByName(kw, autoplay) {
    if (!kw) return;
    try {
      const r = await searchSmart(kw, 5);
      if (!r.length) { console.warn('[听曲] 未找到：' + kw); return; }
      const t = r[0];
      if (queue.some(q => key(q) === key(t))) return;
      queue.push(t);
      if (mode === 'queue') render();
      if (autoplay && (audio.paused || !audio.src)) play(queue.length - 1);
      else {
        ball.classList.add('playing');
        setTimeout(() => { if (audio.paused) ball.classList.remove('playing'); }, 3000);
      }
    } catch (err) { console.warn('[听曲] 自动点曲失败', err); }
  }

  function scan(text) {
    if (!text) return;
    TAG.lastIndex = 0;
    let m, first = audio.paused || !audio.src;
    while ((m = TAG.exec(text)) !== null) {
      addByName(m[1].trim().replace(/[《》“”"']/g, ''), first);
      first = false;
    }
  }

  async function scanMessage(id) {
    try {
      const msgs = await getChatMessages(id);
      scan(msgs && msgs[0] && msgs[0].message);
    } catch (err) { console.warn('[听曲]', err); }
  }

  if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
    eventOn(tavern_events.MESSAGE_RECEIVED, scanMessage);
    if (tavern_events.MESSAGE_SENT) {
      eventOn(tavern_events.MESSAGE_SENT, scanMessage);
    } else {
      console.warn('[听曲] 当前酒馆助手没有用户消息事件，只有 AI 回复可自动点曲。');
    }
  } else {
    console.warn('[听曲] 未取到酒馆助手事件接口，自动点曲不可用，手动搜索仍正常。');
  }

  /* ---------- 开关 ---------- */
  ball.onclick = () => {
    if (suppressBallClick) return;
    p.classList.toggle('on');
    if (p.classList.contains('on')) {
      positionPanel();
      setTimeout(() => $('jhm-kw').focus(), 260);
    }
    positionLyric();
  };

  /* ---------- 重载清理 ---------- */
  W.__jhmCleanup = function () {
    try { audio.pause(); audio.src = ''; } catch (e) {}
    dragCleanups.forEach(fn => fn());
    W.removeEventListener('resize', onViewportResize);
    [ball, L, p, css].forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); });
    W.__jhmCleanup = null;
  };
})();
