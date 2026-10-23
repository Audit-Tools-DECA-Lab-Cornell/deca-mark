const L = require('./lib.cjs');
(async () => {
  const b = await L.launch();
  await L.signIn(b, L.WA.accounts.manager.email, L.stateFile('wa-manager'));
  await L.signIn(b, L.ZR.accounts.manager.email, L.stateFile('zr-manager'));
  await b.close();
  console.log('ok');
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
