// Render de diapositivas: convierte el modelo de contenido (JSON) en HTML/CSS.
// Todas las medidas del modelo están en puntos del lienzo original (720 × 405 pt).
// El lienzo escala con container queries: 1 pt = 100cqw / 720.

const W = 720;
const H = 405;

/** Contexto compartido: { theme, media, deck } ya cargados. */
export function createContext({ theme, media, deck }, opts = {}) {
  return {
    theme, deck,
    media: media.media,
    aliases: media.aliases || {},
    base: opts.base || new URL('../', import.meta.url),
    lazy: !!opts.lazy,
  };
}

export function resolveMedia(ctx, id) {
  const key = ctx.aliases[id] || id;
  return ctx.media[key] ? { id: key, ...ctx.media[key] } : null;
}

/** Nombre de token → var(--c-token). Hex, rgb() y transparent pasan tal cual. */
export function color(value, tone) {
  if (!value) return null;
  if (value === 'tone') return tone ? `var(--c-${tone})` : 'currentColor';
  if (/^(#|rgb|hsl|transparent|currentColor|var\()/.test(value)) return value;
  return `var(--c-${value})`;
}

const pt = n => `calc(var(--pt) * ${n})`;

function place(node, e) {
  const [x, y, w, h] = e.box;
  node.style.left = `${(x / W) * 100}%`;
  node.style.top = `${(y / H) * 100}%`;
  node.style.width = `${(w / W) * 100}%`;
  node.style.height = `${(h / H) * 100}%`;
  const t = [];
  if (e.rotate) t.push(`rotate(${e.rotate}deg)`);
  if (e.flipX) t.push('scaleX(-1)');
  if (t.length) node.style.transform = t.join(' ');
  if (e.opacity != null) node.style.opacity = e.opacity;
  if (e.blend) node.style.mixBlendMode = e.blend;
  if (e.z != null) node.style.zIndex = e.z;
}

function boxDecor(node, e, tone) {
  if (e.fill) node.style.background = color(e.fill, tone);
  if (e.radius != null) node.style.borderRadius = typeof e.radius === 'string' ? e.radius : pt(e.radius);
  if (e.border) node.style.border = `${pt(e.border[0])} solid ${color(e.border[1], tone)}`;
}

const escapeHtml = s =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Marcado mínimo para editores:
 *   ==texto==  → resaltado (usa e.mark: { fill, color })
 *   **texto**  → acento de color (usa e.accent y e.accentWeight)
 *   ^^texto^^  → superíndice (p. ej. ®)
 *   \n         → salto de línea · \n\n → nuevo párrafo (separación "pgap" en pt)
 */
export function inline(text) {
  const line = t =>
    escapeHtml(t)
      .replace(/==(.+?)==/gs, '<mark class="mk">$1</mark>')
      .replace(/\*\*(.+?)\*\*/gs, '<span class="acc">$1</span>')
      .replace(/\^\^(.+?)\^\^/gs, '<sup>$1</sup>')
      .replace(/\n/g, '<br>');
  // Una línea en blanco separa párrafos (el espacio entre ellos lo define "pgap").
  const paras = text.split(/\n\n/);
  return paras.length === 1 ? line(text) : paras.map(p => `<p>${line(p)}</p>`).join('');
}

function renderText(e, ctx, tone) {
  const node = document.createElement('div');
  node.className = 'el el-text';
  const preset = ctx.theme.text[e.font] || ctx.theme.text.sans;
  const fontKey = preset.font;
  node.style.fontFamily = `var(--f-${fontKey})`;
  node.style.fontSize = pt(e.size || 12);
  node.style.lineHeight = e.lh ?? preset.lh;
  if (e.weight) node.style.fontWeight = e.weight;
  if (e.wdth) node.style.fontStretch = `${e.wdth}%`;
  if (e.ls != null) node.style.letterSpacing = `${e.ls}em`;
  if (e.align) node.style.textAlign = e.align;
  if (e.case) node.style.textTransform = e.case;
  if (e.wrap === false) node.style.whiteSpace = 'nowrap';
  node.style.color = color(e.color || 'ink', tone);
  if (e.valign) node.style.justifyContent = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[e.valign];
  if (e.pad != null) {
    const p = Array.isArray(e.pad) ? e.pad : [e.pad];
    node.style.padding = p.map(pt).join(' ');
  }
  boxDecor(node, e, tone);
  if (e.mark) {
    node.style.setProperty('--mk-bg', color(e.mark.fill || 'green', tone));
    node.style.setProperty('--mk-fg', color(e.mark.color || 'inherit', tone));
  }
  if (e.mark?.pad) node.style.setProperty('--mk-pad', e.mark.pad.map(pt).join(' '));
  if (e.accent) node.style.setProperty('--acc', color(e.accent, tone));
  if (e.accentWeight) node.style.setProperty('--acc-w', e.accentWeight);
  if (e.pgap != null) node.style.setProperty('--pgap', pt(e.pgap));
  if (e.breakWord) node.style.overflowWrap = 'anywhere';

  const inner = document.createElement('div');
  inner.className = 'txt';
  if (e.lineFill) {
    // Fondo por línea (estilo cinta de rotulador). Va en una capa aparte, debajo del texto,
    // para que el fondo de una línea no tape los descendentes de la anterior.
    const html = `<span class="line-fill">${inline(e.text)}</span>`;
    inner.innerHTML = `<div class="lf-bg" aria-hidden="true">${html}</div><div class="lf-text">${html}</div>`;
    inner.style.setProperty('--lf-bg', color(e.lineFill, tone));
    if (e.lineFillPad != null) inner.style.setProperty('--lf-pad', pt(e.lineFillPad));
  } else {
    inner.innerHTML = inline(e.text);
  }
  node.append(inner);
  return node;
}

function renderMedia(e, ctx, tone) {
  let id = e.media;
  if (id === 'tone-logo') id = ctx.deck.tones?.[tone]?.logo;
  const m = resolveMedia(ctx, id);
  const node = document.createElement('div');
  node.className = 'el el-media';
  boxDecor(node, e, tone);
  if (e.shadow) node.style.filter = 'drop-shadow(0 0.4cqw 0.8cqw rgb(0 0 0 / 0.35))';

  if (!m || !m.src) {
    node.classList.add('is-missing');
    if (e.missingLabel) node.style.setProperty('--missing-align', e.missingLabel === 'top' ? 'start' : 'end');
    node.innerHTML = `<span>Falta medio<br><b>${escapeHtml(m?.label || id || 'sin id')}</b></span>`;
    node.title = m?.source || 'Medio no encontrado en content/media.json';
    return node;
  }

  let media;
  if (m.kind === 'video') {
    media = document.createElement('video');
    Object.assign(media, { muted: true, loop: true, playsInline: true, preload: 'metadata' });
    media.autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!media.autoplay) media.controls = true;
  } else {
    media = document.createElement('img');
    media.alt = e.alt ?? m.alt ?? '';
    media.decoding = 'async';
    if (ctx.lazy) media.loading = 'lazy';
  }
  media.src = new URL(m.src, ctx.base).href;
  if (e.crop) {
    // Recorte estilo Google Slides: [izq, arriba, der, abajo] como fracción del archivo original.
    const [l, t, r, b] = e.crop;
    const sw = 1 - l - r, sh = 1 - t - b;
    Object.assign(media.style, {
      position: 'absolute', maxWidth: 'none',
      width: `${100 / sw}%`, height: `${100 / sh}%`,
      left: `${(-l / sw) * 100}%`, top: `${(-t / sh) * 100}%`,
    });
    media.style.objectFit = 'fill';
  } else {
    media.style.objectFit = e.fit || 'contain';
  }
  if (e.pos) media.style.objectPosition = e.pos;
  if (e.filter) media.style.filter = FILTERS[e.filter] || e.filter;
  media.draggable = false;
  node.append(media);
  return node;
}

// Filtros con nombre para recolorear ilustraciones de un solo color.
const FILTERS = {
  white: 'brightness(0) invert(1)',
  black: 'brightness(0)',
  invert: 'invert(1)',
};

function renderShape(e, ctx, tone) {
  const node = document.createElement('div');
  node.className = 'el el-shape';
  boxDecor(node, e, tone);
  if (e.ellipse) node.style.borderRadius = '50%';
  return node;
}

const renderers = { text: renderText, media: renderMedia, shape: renderShape };

function renderElement(e, ctx, tone) {
  if (e.hidden) return null;
  const fn = renderers[e.type];
  if (!fn) return null;
  const node = fn(e, ctx, tone);
  node.dataset.el = e.id;
  place(node, e);
  if (e.link) {
    const a = document.createElement('a');
    a.href = e.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'el-link';
    a.setAttribute('aria-label', e.linkLabel || e.link);
    node.append(a);
  }
  return node;
}

/** Devuelve <section class="slide"> listo para insertar. */
export function renderSlide(slide, ctx) {
  const section = document.createElement('section');
  section.className = 'slide';
  section.dataset.slide = slide.id;
  section.style.background = color(slide.background || 'black');
  section.setAttribute('aria-label', slide.title || slide.id);

  const { header, footer, override = {} } = slide.chrome || {};
  const add = (list, tone) => {
    for (const base of list || []) {
      // Una diapositiva puede ajustar una pieza compartida sin duplicarla: chrome.override[id].
      const e = override[base.id] ? { ...base, ...override[base.id] } : base;
      const n = renderElement(e, ctx, tone);
      if (n) section.append(n);
    }
  };
  add(slide.elements);
  if (header) add(ctx.deck.chrome.header, header);
  if (footer) add(ctx.deck.chrome.footer, footer);
  return section;
}

/** Aplica colores y fuentes del tema como variables CSS e inyecta Google Fonts. */
export function applyTheme(theme, root = document.documentElement) {
  for (const [k, v] of Object.entries(theme.colors)) root.style.setProperty(`--c-${k}`, v);
  const families = [];
  for (const [k, f] of Object.entries(theme.fonts)) {
    root.style.setProperty(`--f-${k}`, `'${f.family}', ${f.fallback || 'sans-serif'}`);
    if (f.google) families.push(`family=${f.google.replace(/ /g, '+')}`);
  }
  if (families.length) {
    const href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
    let link = document.getElementById('theme-fonts');
    if (!link) {
      link = document.createElement('link');
      link.id = 'theme-fonts';
      link.rel = 'stylesheet';
      document.head.append(link);
    }
    if (link.href !== href) link.href = href;
  }
}

/** Carga deck, tema, medios y todas las diapositivas en orden. */
export async function loadDeck(base = new URL('../content/', import.meta.url)) {
  const get = async path => {
    const res = await fetch(new URL(path, base), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
    return res.json();
  };
  const [deck, theme, media] = await Promise.all([get('deck.json'), get('theme.json'), get('media.json')]);
  const slides = await Promise.all(deck.slides.map(id => get(`slides/${id}.json`)));
  return { deck, theme, media, slides };
}
