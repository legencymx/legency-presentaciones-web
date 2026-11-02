import { loadDeck, createContext, renderSlide, applyTheme, resolveMedia } from './render.js';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const key = 'legency-presentaciones-editor-v1';
const original = await loadDeck();
let state = clone(original);
let current = 0;
let selected = null;
let history = [];

try {
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (saved?.slides?.length > 0 && saved?.deck && saved?.theme && saved?.media) {
    state = saved;
    for (const [id, media] of Object.entries(original.media.media)) {
      if (!state.media.media[id]?.src && media.src) state.media.media[id] = media;
    }
    save();
  }
} catch { /* un respaldo inválido no altera la fuente */ }

function save() {
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { alert('No se pudo guardar en este navegador. Exporta tus cambios antes de cerrar.'); }
}
function checkpoint() { history.push(clone(state)); if (history.length > 20) history.shift(); }
function ctx() { return createContext(state, { base: new URL('../', import.meta.url) }); }
function render() {
  applyTheme(state.theme);
  const slide = state.slides[current];
  $('slide-no').textContent = `DIAPOSITIVA ${String(current + 1).padStart(2, '0')} / ${state.slides.length}`;
  $('slide-name').textContent = slide.title;
  const node = renderSlide(slide, ctx());
  $('canvas').replaceChildren(node);
  node.querySelectorAll('.el').forEach((el, i) => {
    el.dataset.element = slide.elements[i]?.id || '';
    el.addEventListener('click', event => { event.stopPropagation(); selected = slide.elements[i]?.id; inspect(); });
  });
  $('slides').querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === current));
  inspect();
}
function listSlides() {
  $('count').textContent = state.slides.length;
  $('slides').replaceChildren(...state.slides.map((slide, i) => {
    const b = document.createElement('button');
    b.textContent = `${String(i + 1).padStart(2, '0')}  ${slide.title}`;
    b.onclick = () => { current = i; selected = null; render(); };
    return b;
  }));
}
function syncOrder() { state.deck.slides = state.slides.map(s => s.id); save(); listSlides(); render(); }
function moveSlide(delta) {
  const to = current + delta;
  if (to < 0 || to >= state.slides.length) return;
  checkpoint();
  [state.slides[current], state.slides[to]] = [state.slides[to], state.slides[current]];
  current = to; syncOrder();
}
function field(label, element) {
  const wrap = document.createElement('div');
  const lab = document.createElement('label'); lab.className = 'field'; lab.textContent = label;
  wrap.append(lab, element); return wrap;
}
function input(type, value, onChange) {
  const el = document.createElement('input'); el.type = type; el.value = value ?? '';
  el.addEventListener('change', () => { checkpoint(); onChange(el.value); save(); render(); });
  return el;
}
function select(options, value, onChange) {
  const el = document.createElement('select');
  for (const [v, text] of options) { const op = document.createElement('option'); op.value = v; op.textContent = text; el.append(op); }
  el.value = value || '';
  el.addEventListener('change', () => { checkpoint(); onChange(el.value); save(); render(); });
  return el;
}
function inspect() {
  const fields = $('fields'); fields.replaceChildren();
  $('canvas').querySelectorAll('.el').forEach(el => el.classList.toggle('selected', el.dataset.element === selected));
  const e = state.slides[current].elements.find(x => x.id === selected);
  if (!e) { fields.textContent = 'Selecciona un texto o una imagen en la diapositiva.'; return; }
  const tag = document.createElement('small'); tag.className = 'note'; tag.textContent = `${e.type.toUpperCase()} · ${e.id}`; fields.append(tag);
  if (e.type === 'text') {
    const area = document.createElement('textarea'); area.value = e.text || '';
    area.onchange = () => { checkpoint(); e.text = area.value; save(); render(); };
    fields.append(field('Texto', area));
    fields.append(field('Tipografía', select(Object.entries(state.theme.fonts).map(([k,v]) => [k,v.family]), e.font, v => e.font = v)));
    fields.append(field('Color', select(Object.keys(state.theme.colors).map(k => [k,k]), e.color, v => e.color = v)));
    fields.append(field('Tamaño (pt)', input('number', e.size, v => e.size = Number(v))));
  } else if (e.type === 'media') {
    const m = resolveMedia(ctx(), e.media);
    const currentFile = document.createElement('small'); currentFile.className = 'note'; currentFile.textContent = `Recurso: ${e.media} · ${m?.kind || 'sin tipo'} · ${m?.src || 'sin archivo'}`; fields.append(currentFile);
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm';
    const shared = document.createElement('input'); shared.type = 'file'; shared.accept = file.accept;
    const upload = (target, all) => async () => {
      const f = target.files?.[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { alert('Este archivo supera 2 MB. Optimízalo antes de agregarlo.'); return; }
      checkpoint();
      const reader = new FileReader(); reader.onload = () => {
        const id = all ? (state.media.aliases[e.media] || e.media) : `custom-${Date.now()}`;
        state.media.media[id] = { src: reader.result, kind: f.type.startsWith('video') ? 'video' : 'image', alt: f.name, source: f.name };
        if (!all) e.media = id;
        save(); render(); listLibrary();
      }; reader.readAsDataURL(f);
    };
    file.onchange = upload(file, false);
    shared.onchange = upload(shared, true);
    fields.append(field('Reemplazar solo esta aparición', file));
    fields.append(field('Reemplazar todas las apariciones', shared));
    fields.append(field('URL de medio ya alojado (útil para MP4 grandes)', input('text', '', value => {
      const url = value.trim();
      if (!/^https:\/\//i.test(url) && !/^reference\/assets\/[\w.\-/]+$/i.test(url)) { alert('Usa una URL https:// o una ruta reference/assets/.'); return; }
      const id = `custom-url-${Date.now()}`;
      state.media.media[id] = { src: url, kind: /\.(mp4|webm)(?:[?#]|$)/i.test(url) ? 'video' : 'image', alt: '', source: url };
      e.media = id;
      listLibrary();
    })));
    fields.append(field('Recurso existente', select(Object.keys(state.media.media).map(id => [id, `${id} · ${state.media.media[id].source || ''}`]), e.media, v => e.media = v)));
    fields.append(field('Ajuste', select([['cover','Cubrir'],['contain','Completo'],['fill','Estirar']], e.fit || 'contain', v => e.fit = v)));
    fields.append(field('Encuadre (ej. 50% 50%)', input('text', e.pos || '50% 50%', v => e.pos = v)));
  } else fields.append('Este elemento decorativo se conserva tal como está.');
}
function themeFields() {
  const box = $('theme-fields'); box.replaceChildren();
  for (const [key, value] of Object.entries(state.theme.colors)) box.append(field(key, input('color', value, v => state.theme.colors[key] = v)));
  const note = document.createElement('small'); note.className = 'note'; note.textContent = 'Los colores se aplican a todas las diapositivas que usan esa variable.'; box.append(note);
}
function listLibrary() {
  const box = $('library'); box.replaceChildren();
  const used = {};
  for (const [i, slide] of state.slides.entries()) for (const e of slide.elements) if (e.type === 'media') (used[e.media] ||= []).push(i + 1);
  for (const [id, media] of Object.entries(state.media.media)) {
    const row = document.createElement('div'); row.className = 'media-row';
    if (media.kind !== 'video') { const img = document.createElement('img'); img.src = media.src; img.alt = ''; row.append(img); }
    const text = document.createElement('span'); text.textContent = `${id} · ${used[id]?.join(', ') || 'sin uso'}`; row.append(text); box.append(row);
  }
}
function download(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('reset').onclick = () => {
  if (!confirm('¿Descartar el borrador guardado en este navegador y cargar la versión compartida?')) return;
  checkpoint(); state = clone(original); current = 0; selected = null; localStorage.removeItem(key); listSlides(); render(); themeFields(); listLibrary();
};
$('undo').onclick = () => { if (!history.length) return; state = history.pop(); current = Math.min(current, state.slides.length - 1); save(); listSlides(); render(); themeFields(); listLibrary(); };
$('up').onclick = () => moveSlide(-1);
$('down').onclick = () => moveSlide(1);
$('duplicate').onclick = () => {
  checkpoint();
  const copy = clone(state.slides[current]);
  copy.id = `copy-${Date.now()}`;
  copy.title = `${copy.title} · copia`;
  state.slides.splice(current + 1, 0, copy);
  current++; selected = null; syncOrder();
};
$('remove').onclick = () => {
  if (state.slides.length === 1 || !confirm(`¿Quitar la diapositiva ${current + 1} de este borrador? Puedes recuperarla con Deshacer.`)) return;
  checkpoint(); state.slides.splice(current, 1);
  current = Math.min(current, state.slides.length - 1); selected = null; syncOrder();
};
$('export').onclick = () => download('published.json', { ...state, exportedAt: new Date().toISOString() });
$('import').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!incoming.slides?.length || !incoming.deck || !incoming.theme || !incoming.media) throw Error('Archivo incompatible');
    checkpoint(); state = { deck: incoming.deck, slides: incoming.slides, theme: incoming.theme, media: incoming.media }; save(); listSlides(); render(); themeFields(); listLibrary();
  } catch { alert('El archivo no corresponde a estas 45 diapositivas.'); }
};
listSlides(); render(); themeFields(); listLibrary();
