const L = require('./lib.cjs');
const P = L.WA_PATH;
const VIS = `const vis=(s,root=document)=>{const e=root.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'};`;
const ROUTES = {
  'forms': { path: P + '/forms', pred: `${VIS} return vis('main h1') && !!Array.from(document.querySelectorAll('main a')).find(a=>/Workspace check/.test(a.textContent)) && /Forms in this project/.test(document.querySelector('main').innerText)` },
  'forms-versions': { path: P + '/forms/versions', pred: `${VIS} return vis('main h1') && vis('main table tbody tr')` },
  'forms-version-detail-published-v1': { path: P + '/forms/versions/workspace-check-v1', pred: `${VIS} return vis('main h1') && vis('section[aria-label="Collector view"]') && document.querySelector('section[aria-label="Collector view"]').getBoundingClientRect().height>200 && vis('main input')` },
  'forms-editor-draft-v2': { path: P + '/forms/versions/workspace-check-v2', pred: `${VIS} return vis('main h1') && vis('section[aria-label="Collector view"]') && document.querySelector('section[aria-label="Collector view"]').getBoundingClientRect().height>200 && vis('main input')` },
};
async function sample(b, id, vp) {
  const r = ROUTES[id];
  const ctx = await L.ctxFor(b, 'wa-manager', vp);
  const page = await ctx.newPage();
  await page.addInitScript(`(()=>{window.__m={fcp:null,lcp:null,cls:0,lt:[],usable:null};
    new PerformanceObserver(l=>{for(const e of l.getEntries()) if(e.name==='first-contentful-paint') window.__m.fcp=e.startTime}).observe({type:'paint',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__m.lcp={t:e.startTime,el:(e.element&&(e.element.tagName+(e.element.id?'#'+e.element.id:'')))||null}}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__m.cls+=e.value}).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__m.lt.push(e.duration)}).observe({type:'longtask',buffered:true});
    window.__pred=()=>{try{return (new Function(${JSON.stringify(r.pred)}))()}catch(e){return false}};
    const tick=()=>{ if(window.__m.usable===null && document.body && window.__pred()) window.__m.usable=performance.now(); if(window.__m.usable===null) requestAnimationFrame(tick)}; requestAnimationFrame(tick);
  })()`);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type }));
  cdp.on('Network.loadingFinished', e => { const q = reqs.get(e.requestId); if (q) q.bytes = e.encodedDataLength; });
  await page.goto(L.BASE + r.path, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__m.usable !== null, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { ...window.__m, ttfb: n.responseStart, docEnd: n.responseEnd, load: n.loadEventEnd, dom: document.getElementsByTagName('*').length, docBytes: n.encodedBodySize, decoded: n.decodedBodySize, url: location.pathname }; });
  const all = [...reqs.values()];
  const byType = {}; for (const q of all) { const t = q.type || 'other'; byType[t] = byType[t] || { n: 0, b: 0 }; byType[t].n++; byType[t].b += q.bytes || 0; }
  const ext = new Set(all.map(q => new URL(q.url).host).filter(h => !/^127\.0\.0\.1/.test(h)));
  const api = all.filter(q => /127\.0\.0\.1:8001/.test(q.url));
  const res = { id, vp, finalPath: m.url.replace(L.WA_PATH, '<proj>'), ttfb: Math.round(m.ttfb), fcp: Math.round(m.fcp), lcp: m.lcp ? Math.round(m.lcp.t) : null, lcpEl: m.lcp?.el, usable: m.usable === null ? null : Math.round(m.usable), docEnd: Math.round(m.docEnd), load: Math.round(m.load), cls: +m.cls.toFixed(4), longTasks: m.lt.length, longTaskMs: Math.round(m.lt.reduce((a, c) => a + c, 0)), reqN: all.length, reqKB: +(all.reduce((a, c) => a + (c.bytes || 0), 0) / 1024).toFixed(1), docKB: +(m.docBytes / 1024).toFixed(1), docDecodedKB: +(m.decoded / 1024).toFixed(1), dom: m.dom, byType, browserToApi: api.length, externalHosts: [...ext] };
  await ctx.close();
  return res;
}
(async () => {
  const vp = process.argv[2] || 'desk';
  const b = await L.launch();
  // Warm-up (discarded): one visit per route so the server/API/DB are warm, as in the earlier method.
  for (const id of Object.keys(ROUTES)) await sample(b, id, vp);
  const out = [];
  for (const id of Object.keys(ROUTES)) for (let i = 0; i < 3; i++) { const r = await sample(b, id, vp); r.sample = i + 1; out.push(r); console.log(JSON.stringify(r)); }
  L.fs.writeFileSync(`${L.F}/data/perf-${vp}.json`, JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
