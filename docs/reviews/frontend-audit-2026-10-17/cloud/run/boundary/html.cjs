const { chromium, request } = require('/home/user/deca-mark/web/node_modules/@playwright/test');
const fs = require('fs');
(async () => {
  const m = JSON.parse(fs.readFileSync('/home/user/deca-mark/database/.local/web-workspace.json','utf8'));
  const routes = { overview: m.path, data: m.path+'/data', sites: m.path+'/sites', site: m.path+'/sites/fall-creek', zones: m.path+'/sites/fall-creek/zones', forms: m.path+'/forms', obs: m.path+'/data/'+m.observations[0], team: m.path+'/team', o: '/o' };
  for (const base of ['http://127.0.0.1:3000','http://127.0.0.1:3001','http://127.0.0.1:3002','http://127.0.0.1:3003','http://127.0.0.1:3004']) {
    const api = await request.newContext({ storageState: '/home/user/deca-mark/web/e2e/.auth/manager.json' });
    for (const [k,p] of Object.entries(routes)) {
      const t=Date.now(); const r = await api.get(base+p, { maxRedirects: 0 });
      const html = await r.text();
      const ms = Date.now()-t;
      const c = (re)=> (html.match(re)||[]).length;
      console.log(base.slice(-4), k.padEnd(9), r.status(), ms+'ms', html.length+'B',
        'fallbackProject='+c(/Loading the project/g), 'fallbackOrg='+c(/Loading the organization/g), 'B:templates='+c(/<template id="B:/g), '$RC='+c(/\$RC\(/g), 'S:segments='+c(/<div hidden id="S:/g), 'dehydratedBoundary$?='+c(/<!--\$\?-->/g), 'complete$='+c(/<!--\$-->/g));
    }
    await api.dispose();
  }
})();
