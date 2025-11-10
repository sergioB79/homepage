// Build graph.json from categorias file (categoriasNovas.txt by default)
// Usage: node scripts/build-graph.cjs [categorias-file]

const fs = require('fs');
const path = require('path');

const CATS_FILE = process.argv[2] || 'categoriasNovas.txt';
const GRAPH_FILE = 'graph.json';
const DOCS_DIR = path.join(process.cwd(), 'docs');

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function slugify(s) {
  return (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCategoriesText(t) {
  const lines = t.split(/\r?\n/);
  const out = []; let inCats = false; let current = null; let inSub = false;
  function pushCurrent() {
    if (current) out.push({ slug: current.slug, title: current.title, subs: current.subs || [] });
    current = null; inSub = false;
  }
  for (let raw of lines) {
    const line = raw.trim();
    if (!inCats) { if (/^categories:/i.test(line)) { inCats = true; } continue; }
    if (!line) { inSub = false; continue; }
    const mSlug = line.match(/^[-]\s*slug:\s*([^\s]+)/i) || raw.match(/^\s*[-]\s*slug:\s*([^\s]+)/i);
    if (mSlug) { pushCurrent(); current = { slug: (mSlug[1] || '').trim(), title: '', subs: [] }; continue; }
    const mTitle = line.match(/^title:\s*"?(.+?)"?$/i);
    if (mTitle && current) { current.title = mTitle[1]; continue; }
    if (/^sub:\s*$/i.test(line)) { inSub = true; continue; }
    if (inSub) {
      const mItem = raw.match(/^\s*[-]\s*"?(.+?)"?\s*$/);
      if (mItem && current) { current.subs.push(mItem[1]); continue; }
    }
    if (/^tags:/i.test(line)) { pushCurrent(); break; }
  }
  pushCurrent();
  return out.filter(c => c.slug);
}

function buildGraph(baseGraph, cats) {
  const nodes = [];
  const links = [];
  const catIndex = new Map();
  // Helpers: map normalized tokens to known slugs, and known sub slugs per category
  const slugByAny = new Map();
  const subsByCat = new Map();

  // Keep only owner from baseGraph; docs are rebuilt from filesystem
  (baseGraph.nodes || []).forEach(n => {
    if (n.kind === 'owner') nodes.push(n);
  });
  // Do not preserve old doc/tag links

  // Add categories and subcategories
  for (const c of cats) {
    const catId = `cat:${c.slug}`;
    const about = (c.subs && c.subs.length) ? c.subs.slice(0, 2).join(' · ') : '';
    nodes.push({ id: catId, label: c.title || c.slug, slug: c.slug, kind: 'category', about });
    catIndex.set(c.slug, catId);
    // map normalizations
    slugByAny.set(c.slug, c.slug);
    if (c.title) slugByAny.set(slugify(c.title), c.slug);
    const set = new Set(); subsByCat.set(c.slug, set);
    for (const s of (c.subs || [])) {
      const subId = `sub:${c.slug}:${slugify(s)}`;
      nodes.push({ id: subId, label: s.replace(/^"|"$/g, ''), kind: 'subcategory', category: c.slug, about: s });
      links.push({ source: catId, target: subId, kind: 'has-sub' });
      set.add(slugify(s));
    }
  }

  // owner -> category owns
  const owner = nodes.find(n => n.kind === 'owner');
  if (owner) {
    for (const c of cats) links.push({ source: owner.id, target: `cat:${c.slug}`, kind: 'owns' });
  }

  // Auto-index docs/ for .html files and build doc nodes
  function walkDocs(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) out.push(...walkDocs(p));
      else if (/\.html?$/i.test(f)) out.push(p);
    }
    return out;
  }
  const catSlugs = new Set(cats.map(c => c.slug));
  const docFiles = walkDocs(DOCS_DIR);
  for (const abs of docFiles) {
    const rel = path.relative(DOCS_DIR, abs).replace(/\\/g, '/');
    const base = path.basename(rel).replace(/\.html?$/i, '');
    let label = base.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    const parts = rel.split('/');
    let catMaybe = parts.length > 1 ? parts[0].toLowerCase() : null;

    // Try to read metadata from the HTML file (front-matter or <meta> tags)
    const meta = parseDocMeta(abs);
    if (rel.includes('MY-HOMEPAGE-construcao-do-site')){
      console.log('[debug] meta for', rel, meta);
    }
    if (meta && meta.title) label = meta.title;
    let categoryRaw = (meta && (meta.categoria || meta.category)) ? String(meta.categoria || meta.category) : (catMaybe || 'arquivo');
    let categoryNorm = slugify(categoryRaw);
    let category = slugByAny.get(categoryNorm) || (catSlugs.has(categoryNorm) ? categoryNorm : 'arquivo');
    if (category === 'arquivo' && (meta && (meta.categoria || meta.category))) {
      console.warn(`[warn] Unknown categoria for ${rel}: "${categoryRaw}" -> using 'arquivo'`);
    }
    const subRaw = (meta && (meta.subcategoria || meta.subcategory)) ? String(meta.subcategoria || meta.subcategory) : null;
    const subcategoria = subRaw ? slugify(subRaw) : null;
    const tags = (meta && Array.isArray(meta.tags)) ? meta.tags : [];
    const id = 'doc:' + slugify(rel.replace(/\.html?$/i, '').replace(/\//g, '-'));
    nodes.push({ id, label, kind: 'doc', category, subcategory: subcategoria || undefined, tags, path: rel });
  }

  // category contains doc (by doc.category matching slug)
  nodes.filter(n => n.kind === 'doc').forEach(d => {
    if (d.category && catIndex.has(d.category)) {
      links.push({ source: `cat:${d.category}`, target: d.id, kind: 'contains' });
      if (d.subcategory) {
        const knownSubs = subsByCat.get(d.category);
        const subSlug = slugify(d.subcategory);
        if (knownSubs && knownSubs.has(subSlug)) {
          const subId = `sub:${d.category}:${subSlug}`;
          links.push({ source: subId, target: d.id, kind: 'contains' });
        }
      }
    } else if (d.category === 'arquivo') {
      // ensure arquivo category exists
      if (!catIndex.has('arquivo')) {
        const id = 'cat:arquivo';
        nodes.push({ id, label: 'Arquivo / Inbox', slug: 'arquivo', kind: 'category', about: 'Entrada automática e rascunhos.' });
        catIndex.set('arquivo', id);
        if (owner) links.push({ source: owner.id, target: id, kind: 'owns' });
      }
      links.push({ source: 'cat:arquivo', target: d.id, kind: 'contains' });
    }
  });

  return { nodes, links };
}

// Extracts metadata from an HTML file.
// Supports:
// - YAML-like front matter between leading --- lines, with keys: title, categoria, subcategoria, tags
// - <meta name="categoria" content="...">, <meta name="subcategoria" ...>, <meta name="tags" content="#a, #b">
function parseDocMeta(absPath) {
  let raw;
  try { raw = fs.readFileSync(absPath, 'utf8'); } catch { return null; }
  if (!raw) return null;
  const out = {};
  // Examine only the head of the file for speed
  const head = raw.slice(0, 20000);
  // Front matter block near the top (standalone or wrapped in an HTML comment), not necessarily at index 0
  const fm = head.match(/<!--\s*---\s*[\r\n]([\s\S]*?)[\r\n]---\s*-->/) || head.match(/(?:^|\n)\s*---\s*[\r\n]([\s\S]*?)\n---/);
  if (fm) {
    const body = fm[1];
    for (const line of body.split(/\r?\n/)) {
      const ln = line.trim();
      const mKV = ln.match(/^([a-zA-Z_]+):\s*(.+)$/);
      if (!mKV) continue;
      const k = mKV[1].toLowerCase();
      let v = mKV[2].trim();
      if (/^\[.*\]$/.test(v)) {
        // crude array parse: ["#a", "#b"] or ['#a', '#b']
        v = v.replace(/'/g, '"');
        try { out[k] = JSON.parse(v); }
        catch {
          // fallback: split by comma
          out[k] = v.replace(/^\[|\]$/g,'')
            .split(',').map(s=>s.replace(/[\#\"']/g,'').trim()).filter(Boolean);
        }
      } else {
        v = v.replace(/^\"|\"$/g, '');
        out[k] = v;
      }
    }
    return out;
  }
  // Meta tags (look near the top portion to avoid heavy scan)
  const mCat = head.match(/<meta[^>]+(?:name|property)=["'](?:categoria|category)["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const mSub = head.match(/<meta[^>]+(?:name|property)=["'](?:subcategoria|subcategory)["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const mTags = head.match(/<meta[^>]+name=["']tags["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const mTitle = head.match(/<meta[^>]+name=["']title["'][^>]*content=["']([^"']+)["'][^>]*>/i) || head.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (mCat) out.categoria = mCat[1].trim();
  if (mSub) out.subcategoria = mSub[1].trim();
  if (mTitle) out.title = mTitle[1].trim();
  if (mTags) out.tags = mTags[1].split(',').map(s => s.trim()).filter(Boolean);
  if (out.categoria || out.subcategoria || (out.tags && out.tags.length)) return out;

  // Last-resort: inline markers like "categoria: xyz" inside comments/text near the top
  // 1) Patterns in text like: categoria: dev (also matches 'category')
  const ilCat = head.match(/categoria\s*[:=]\s*["']?([^"'\r\n<]+)["']?/i) || head.match(/category\s*[:=]\s*["']?([^"'\r\n<]+)["']?/i);
  const ilSub = head.match(/subcategoria\s*[:=]\s*["']?([^"'\r\n<]+)["']?/i) || head.match(/subcategory\s*[:=]\s*["']?([^"'\r\n<]+)["']?/i);
  // 2) Badge markup like: <b>categoria:</b> dev
  const bCat = head.match(/<b>\s*categoria\s*:\s*<\/b>\s*([^<\r\n]+)/i) || head.match(/<b>\s*category\s*:\s*<\/b>\s*([^<\r\n]+)/i);
  const bSub = head.match(/<b>\s*subcategoria\s*:\s*<\/b>\s*([^<\r\n]+)/i) || head.match(/<b>\s*subcategory\s*:\s*<\/b>\s*([^<\r\n]+)/i);
  // 3) Tags in plain text forms
  const ilTags = head.match(/tags\s*[:=]\s*\[([^\]]+)\]/i) || head.match(/<meta[^>]+name=["']keywords["'][^>]*content=["']([^"']+)["'][^>]*>/i) || head.match(/tags\s*[:=]\s*([^\r\n<]+)/i);
  if (ilCat) out.categoria = ilCat[1].trim();
  if (ilSub) out.subcategoria = ilSub[1].trim();
  if (!out.categoria && bCat) out.categoria = bCat[1].trim();
  if (!out.subcategoria && bSub) out.subcategoria = bSub[1].trim();
  if (ilTags) {
    const val = ilTags[1];
    out.tags = val.split(',').map(s => s.replace(/[\#\"']/g,'').trim()).filter(Boolean);
  }
  if (Object.keys(out).length) return out;

  // 4) Naive first-lines scan: strip tags, then look for categoria: X and subcategoria: Y
  const lines = head.split(/\r?\n/).slice(0, 120);
  let firstCat = null, firstSub = null, firstTags = null;
  for (const rawLine of lines){
    const line = rawLine.replace(/<[^>]+>/g, ' '); // drop HTML tags
    if (!firstCat){ const m = line.match(/\bcategoria\b\s*[:=]\s*([^,;\s]+)/i) || line.match(/\bcategory\b\s*[:=]\s*([^,;\s]+)/i); if (m) firstCat = m[1].trim(); }
    if (!firstSub){ const m = line.match(/\bsubcategoria\b\s*[:=]\s*([^,;\s]+)/i) || line.match(/\bsubcategory\b\s*[:=]\s*([^,;\s]+)/i); if (m) firstSub = m[1].trim(); }
    if (!firstTags){ const m = line.match(/\btags\b\s*[:=]\s*([^\r\n]+)/i); if (m) firstTags = m[1]; }
    if (firstCat && firstSub && firstTags) break;
  }
  if (firstCat) out.categoria = firstCat;
  if (firstSub) out.subcategoria = firstSub;
  if (firstTags){ out.tags = firstTags.split(',').map(s => s.replace(/[\#\"']/g,'').trim()).filter(Boolean); }
  return Object.keys(out).length ? out : null;
}

function main() {
  const catsText = readText(CATS_FILE);
  if (!catsText) {
    console.error(`Categorias file not found: ${CATS_FILE}`);
    process.exit(1);
  }
  const cats = parseCategoriesText(catsText);
  if (!cats.length) {
    console.error('No categories parsed from file.');
    process.exit(1);
  }
  const base = readJSON(GRAPH_FILE) || { nodes: [], links: [] };
  const graph = buildGraph(base, cats);
  writeJSON(GRAPH_FILE, graph);
  console.log(`OK: wrote ${GRAPH_FILE} (nodes: ${graph.nodes.length}, links: ${graph.links.length})`);
}

main();
