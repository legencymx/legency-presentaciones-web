// Visor de presentaciones: navegación, índice y vista general.
// Solo lectura en la etapa 1; no guarda nada ni se conecta a servicios.
import { loadDeck, createContext, renderSlide, applyTheme, resolveMedia } from './render.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
const bar = $('bar');

let data;
let ctx;
let current = 0;

const total = () => data.slides.length;

function slideFromHash() {
  const n = parseInt(location.hash.replace(/^#\/?/, ''), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), total()) - 1 : 0;
}

function show(i, { replace = false } = {}) {
  current = Math.min(Math.max(i, 0), total() - 1);
  const slide = data.slides[current];
  stage.replaceChildren(renderSlide(slide, ctx));
  $('counter').textContent = `${current + 1} / ${total()}`;
  $('slide-title').textContent = slide.title;
  document.title = `${current + 1}. ${slide.title} · Legency`;
  $('prev').disabled = current === 0;
  $('next').disabled = current === total() - 1;
  const hash = `#/${current + 1}`;
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash);
  for (const li of $('index-list').children) li.toggleAttribute('data-current', +li.dataset.i === current);
  for (const li of $('grid').children) li.toggleAttribute('data-current', +li.dataset.i === current);
  preload(current + 1);
  preload(current - 1);
}

const preloaded = new Set();
function preload(i) {
  const slide = data.slides[i];
  if (!slide || preloaded.has(i)) return;
  preloaded.add(i);
  for (const e of slide.elements) {
    if (e.type !== 'media') continue;
    const m = resolveMedia(ctx, e.media);
    if (m?.src && m.kind !== 'video') new Image().src = new URL(m.src, ctx.base).href;
  }
}

const next = () => show(current + 1);
const prev = () => show(current - 1);

/* ---------- Índice ---------- */
function buildIndex() {
  const list = $('index-list');
  list.replaceChildren(
    ...data.slides.map((s, i) => {
      const li = document.createElement('li');
      li.dataset.i = i;
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span>`;
      b.querySelector('.name').textContent = s.title;
      b.addEventListener('click', () => { show(i); closePanel('index'); });
      li.append(b);
      return li;
    }),
  );
}

/* ---------- Vista general ---------- */
let gridBuilt = false;
function buildGrid() {
  if (gridBuilt) return;
  gridBuilt = true;
  const thumbCtx = { ...ctx, lazy: true };
  $('grid').replaceChildren(
    ...data.slides.map((s, i) => {
      const li = document.createElement('li');
      li.dataset.i = i;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.setAttribute('aria-label', `${i + 1}. ${s.title}`);
      const frame = document.createElement('div');
      frame.className = 'thumb-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.append(renderSlide(s, thumbCtx));
      // Las miniaturas no deben recibir foco ni clics propios (enlaces, selección).
      frame.inert = true;
      const cap = document.createElement('span');
      cap.className = 'thumb-cap';
      cap.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span>`;
      cap.querySelector('.name').textContent = s.title;
      b.append(frame, cap);
      b.addEventListener('click', () => { show(i); closePanel('overview'); });
      li.append(b);
      return li;
    }),
  );
}

/* ---------- Paneles ---------- */
const panels = { index: $('index'), overview: $('overview') };
const openers = { index: $('open-index'), overview: $('open-overview') };
let lastFocus = null;

function openPanel(name) {
  for (const other of Object.keys(panels)) if (other !== name) closePanel(other, { silent: true });
  if (name === 'overview') buildGrid();
  const el = panels[name];
  lastFocus = document.activeElement;
  el.hidden = false;
  void el.offsetWidth; // fija el estado inicial para que la transición de entrada se vea
  el.classList.add('is-open');
  openers[name].setAttribute('aria-expanded', 'true');
  document.body.dataset.panel = name;
  const target = el.querySelector(`[data-i="${current}"] button`);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'center' });
}

function closePanel(name, { silent = false } = {}) {
  const el = panels[name];
  if (el.hidden) return;
  el.classList.remove('is-open');
  openers[name].setAttribute('aria-expanded', 'false');
  delete document.body.dataset.panel;
  const done = () => { if (!el.classList.contains('is-open')) el.hidden = true; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Se oculta al terminar la transición de salida (duración en viewer.css).
  if (reduce || silent) done();
  else setTimeout(done, 240);
  if (!silent) (lastFocus && document.contains(lastFocus) ? lastFocus : stage).focus?.({ preventScroll: true });
}

const togglePanel = name => (panels[name].hidden ? openPanel(name) : closePanel(name));
const openName = () => Object.keys(panels).find(k => !panels[k].hidden);

/* ---------- Pantalla completa ---------- */
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
document.addEventListener('fullscreenchange', () => {
  $('toggle-fs').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
});

/* ---------- Barra que se oculta sola ---------- */
let idleTimer;
function wake() {
  bar.classList.remove('is-idle');
  document.body.classList.remove('hide-cursor');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (bar.matches(':hover') || bar.querySelector(':focus-visible') || openName()) return;
    bar.classList.add('is-idle');
    document.body.classList.add('hide-cursor');
  }, 2200);
}
document.addEventListener('pointermove', wake);
bar.addEventListener('focusin', wake);

/* ---------- Teclado ---------- */
let jumpBuffer = '';
let jumpTimer;
function setJump(v) {
  jumpBuffer = v;
  const el = $('jump');
  el.hidden = !v;
  el.textContent = v ? `Ir a ${v}` : '';
  clearTimeout(jumpTimer);
  if (v) jumpTimer = setTimeout(() => setJump(''), 1800);
}

function gridMove(dx, dy) {
  const items = [...$('grid').children];
  const i = items.indexOf(document.activeElement?.closest('li'));
  if (i < 0) return;
  const cols = Math.max(1, Math.round($('grid').clientWidth / items[0].offsetWidth));
  const j = Math.min(Math.max(i + dx + dy * cols, 0), items.length - 1);
  items[j].querySelector('button').focus();
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('help').open) return;
  const panel = openName();
  const k = e.key;

  if (k === 'Escape') { if (panel) { e.preventDefault(); closePanel(panel); } setJump(''); return; }
  if (panel === 'overview') {
    const moves = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (moves[k]) { e.preventDefault(); gridMove(...moves[k]); return; }
    if (k === 'g' || k === 'G') { e.preventDefault(); closePanel('overview'); }
    return;
  }
  if (panel === 'index') {
    if (k === 'i' || k === 'I') { e.preventDefault(); closePanel('index'); }
    return;
  }
  if (e.target.closest?.('button, a, input, select, textarea') && (k === ' ' || k === 'Enter') && !jumpBuffer) return;

  if (/^[0-9]$/.test(k)) { e.preventDefault(); setJump((jumpBuffer + k).slice(-2)); return; }
  if (k === 'Enter' && jumpBuffer) { e.preventDefault(); show(parseInt(jumpBuffer, 10) - 1); setJump(''); return; }

  switch (k) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
      e.preventDefault(); if (e.shiftKey && k === ' ') prev(); else next(); break;
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
      e.preventDefault(); prev(); break;
    case 'Home': e.preventDefault(); show(0); break;
    case 'End': e.preventDefault(); show(total() - 1); break;
    case 'g': case 'G': case 'o': case 'O': e.preventDefault(); openPanel('overview'); break;
    case 'i': case 'I': e.preventDefault(); openPanel('index'); break;
    case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
    case '?': e.preventDefault(); $('help').showModal(); break;
  }
});

/* ---------- Gestos táctiles ---------- */
let touch = null;
stage.addEventListener('touchstart', e => { touch = e.touches[0]; }, { passive: true });
stage.addEventListener('touchend', e => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.clientX;
  const dy = t.clientY - touch.clientY;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
  touch = null;
});

/* ---------- Arranque ---------- */
$('prev').addEventListener('click', prev);
$('next').addEventListener('click', next);
$('open-index').addEventListener('click', () => togglePanel('index'));
$('open-overview').addEventListener('click', () => togglePanel('overview'));
$('toggle-fs').addEventListener('click', toggleFullscreen);
$('open-help').addEventListener('click', () => $('help').showModal());
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closePanel(b.dataset.close));
window.addEventListener('popstate', () => show(slideFromHash(), { replace: true }));
stage.tabIndex = -1;

try {
  data = await loadDeck();
  if (new URLSearchParams(location.search).has('preview')) {
    try {
      const draft = JSON.parse(localStorage.getItem('legency-presentaciones-editor-v1') || 'null');
      if (draft?.slides?.length > 0 && draft.deck && draft.theme && draft.media) {
        for (const [id, media] of Object.entries(data.media.media)) {
          if (!draft.media.media[id]?.src && media.src) draft.media.media[id] = media;
        }
        data = draft;
      }
    } catch { /* conserva el archivo fuente si el borrador local no se puede leer */ }
  }
  applyTheme(data.theme);
  ctx = createContext(data);
  $('overview-title').textContent = `Vista general · ${total()} diapositivas`;
  buildIndex();
  show(slideFromHash(), { replace: true });
  wake();
  document.body.dataset.ready = '1';
} catch (err) {
  const el = $('error');
  el.hidden = false;
  el.textContent = `No se pudo abrir la presentación. ${err.message}. Revisa que el servidor local esté corriendo (npm start).`;
  console.error(err);
}
