// Search the texture index. Usage: node search.mjs <terms...> [options]   (see README.md)
import { loadRows } from '../lib/lib.mjs';

const KINDS = ['objects', 'paths', 'patterns', 'terrain', 'walls', 'portals', 'lights', 'materials'];
const args = process.argv.slice(2);
const opts = { terms: [], limit: 40 };
const NUM = new Set(['--min-w', '--max-w', '--min-h', '--max-h', '--limit']);
const STR = new Set(['--pack', '--kind', '--tag']);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (NUM.has(a)) {
    opts[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = Number(args[++i]);
  } else if (STR.has(a)) {
    opts[a.slice(2)] = String(args[++i]).toLowerCase();
  } else if (a === '--colorable' || a === '--no-shadow' || a === '--files' || a === '--json' || a === '--help') {
    opts[a.slice(2)] = true;
  } else if (a.startsWith('--')) {
    console.error(`Unknown option ${a}`);
    process.exit(2);
  } else {
    opts.terms.push(a.toLowerCase());
  }
}
if (opts.help || (!opts.terms.length && !opts.pack && !opts.kind && !opts.tag)) {
  console.log('node search.mjs <terms...> [--pack s] [--kind k] [--tag T] [--colorable] [--no-shadow] [--min-w n] [--max-w n] [--min-h n] [--max-h n] [--files] [--limit n] [--json]\n' +
    'Terms are AND-ed; "a|b" = OR within a term. A term matches name, tags or pack name (substring, case-insensitive).\n' +
    `kinds: ${KINDS.join(', ')}`);
  process.exit(0);
}
if (opts.kind && !KINDS.includes(opts.kind)) {
  console.error(`--kind must be one of: ${KINDS.join(', ')}`);
  process.exit(2);
}

const termMatch = (term, r, hay) => term.split('|').some((alt) => alt && hay.includes(alt));
const tokensOf = (r) => new Set(r.name.toLowerCase().split(/[^a-z0-9]+/));

/** Score a row for ranking: whole-token name hit > substring name hit > tag/pack hit. */
function score(r) {
  const toks = tokensOf(r);
  let s = 0;
  for (const term of opts.terms) {
    for (const alt of term.split('|').filter(Boolean)) {
      if (toks.has(alt)) {
        s += 3;
      } else if (r.name.toLowerCase().includes(alt)) {
        s += 2;
      } else if (r.tags.toLowerCase().includes(alt) || r.pack.toLowerCase().includes(alt)) {
        s += 1;
      }
    }
  }
  return s;
}

const matches = loadRows().filter((r) => {
  if (opts.pack && !r.pack.toLowerCase().includes(opts.pack)) {
    return false;
  }
  if (opts.kind && r.kind !== opts.kind) {
    return false;
  }
  if (opts.tag && !r.tags.toLowerCase().split(',').includes(opts.tag)) {
    return false;
  }
  if (opts.noShadow !== undefined || opts['no-shadow']) {
    if (r.tags.split(',').includes('Shadow') || /shadow/i.test(r.name)) {
      return false;
    }
  }
  if (opts.colorable && r.colorable !== 'y') {
    return false;
  }
  if ((opts.minW && r.w < opts.minW) || (opts.maxW && r.w > opts.maxW) || (opts.minH && r.h < opts.minH) || (opts.maxH && r.h > opts.maxH)) {
    return false;
  }
  const hay = `${r.name} ${r.tags} ${r.pack}`.toLowerCase();
  return opts.terms.every((t) => termMatch(t, r, hay));
});

const range = (list, k) => {
  const v = list.map((r) => r[k]);
  const [a, b] = [Math.min(...v), Math.max(...v)];
  return a === b ? `${a}` : `${a}-${b}`;
};

if (opts.files) {
  const out = matches
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.r.pack.localeCompare(b.r.pack) || a.r.name.localeCompare(b.r.name));
  if (opts.json) {
    console.log(JSON.stringify(out.slice(0, opts.limit).map((x) => x.r), null, 1));
  } else {
    console.log(`${matches.length} files match; showing ${Math.min(opts.limit, matches.length)} (--limit to change)`);
    for (const { r } of out.slice(0, opts.limit)) {
      console.log(`[${r.pack}] ${r.kind}${r.sub ? '/' + r.sub : ''} ${r.name} ${r.w}x${r.h}${r.colorable ? ' colorable' : ''}${r.tags ? ' {' + r.tags + '}' : ''}  ${r.rel}`);
    }
  }
  process.exit(0);
}

// Family mode: group variants. BIOMES packs are collapsed into one line unless --pack is given.
const groups = new Map();
for (const r of matches) {
  const collapse = !opts.pack && r.pack.startsWith('BIOMES ');
  const packKey = collapse ? 'BIOMES' : r.pack;
  const key = `${packKey}|${r.kind}|${r.sub === 'end' ? '' : r.sub}|${r.family}`;
  if (!groups.has(key)) {
    groups.set(key, { pack: packKey, kind: r.kind, sub: r.sub === 'end' ? '' : r.sub, family: r.family, rows: [], biomes: new Set() });
  }
  const g = groups.get(key);
  g.rows.push(r);
  if (collapse) {
    g.biomes.add(r.pack.replace('BIOMES ', '').replace(' New', ''));
  }
}
const list = [...groups.values()]
  .map((g) => ({ ...g, s: Math.max(...g.rows.map(score)) }))
  .sort((a, b) => b.s - a.s || b.rows.length - a.rows.length || a.pack.localeCompare(b.pack) || a.family.localeCompare(b.family));

if (opts.json) {
  console.log(JSON.stringify(list.slice(0, opts.limit).map((g) => ({
    pack: g.pack, biomes: [...g.biomes], kind: g.kind, sub: g.sub, family: g.family, files: g.rows.length,
    w: range(g.rows, 'w'), h: range(g.rows, 'h'), tags: [...new Set(g.rows.flatMap((r) => r.tags.split(',').filter(Boolean)))],
    colorable: g.rows.some((r) => r.colorable === 'y'), example: g.rows[0].rel,
  })), null, 1));
} else {
  console.log(`${list.length} families (${matches.length} files) match; showing ${Math.min(opts.limit, list.length)}. Use --files for exact files/paths, --limit to see more.`);
  for (const g of list.slice(0, opts.limit)) {
    const tags = [...new Set(g.rows.flatMap((r) => r.tags.split(',').filter(Boolean)))];
    const col = g.rows.every((r) => r.colorable === 'y') ? ' colorable' : g.rows.some((r) => r.colorable === 'y') ? ' some-colorable' : '';
    const biomes = g.biomes.size ? `(${[...g.biomes].sort().join(',')})` : '';
    const body = g.rows.filter((r) => r.sub !== 'end');
    const main = body.length ? body : g.rows;
    const caps = g.rows.length - main.length;
    const names = main.length > 1 ? `${main[0].name} .. ${main.at(-1).name}` : main[0].name;
    console.log(`[${g.pack}${biomes}] ${g.kind}${g.sub ? '/' + g.sub : ''} ${g.family} x${main.length}${caps ? ' +end cap' : ''} ${range(main, 'w')}x${range(main, 'h')}px${col}${tags.length ? ' {' + tags.join(',') + '}' : ''} e.g. ${names}`);
  }
}
