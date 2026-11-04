import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, readdir, writeFile, open, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const id=new Date().toISOString().replaceAll(/[:.]/g,'-');
const output=`releases/qa/regression-${id}`;
const absolute=relative=>path.join(root,relative);
await mkdir(`${output}/runners`,{recursive:true});
await mkdir(`${output}/tmp`,{recursive:true});
await mkdir(`${output}/out/phase-e-qa`,{recursive:true});
const vite=absolute('node_modules/vite/bin/vite.js');
const servers=[], counts=[];
const performanceOnly=process.argv.includes('--performance-only');
async function port() {
  const server=createServer(); await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const value=server.address().port; await new Promise(resolve=>server.close(resolve)); return value;
}
const devPort=await port(), productionPort=await port(), baselinePort=await port();
const env={...process.env,NOTEFLOW_QA_NODE_MODULES:absolute('node_modules'),TEMP:absolute(`${output}/tmp`),TMP:absolute(`${output}/tmp`)};
async function command(name,executable,args,options={}) {
  const log=await open(`${output}/${name}.log`,'w'), started=Date.now();
  const child=spawn(executable,args,{cwd:root,env,stdio:['ignore',log.fd,log.fd],...options});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  await log.close(); if(code!==0) throw new Error(`${name} failed (${code}); see ${output}/${name}.log`);
  return {name,code,seconds:(Date.now()-started)/1000};
}
async function serve(name,args,url) {
  const log=await open(`${output}/${name}.log`,'w');
  const child=spawn(process.execPath,[vite,...args],{cwd:root,env,stdio:['ignore',log.fd,log.fd]});
  const server={name,child,log,stopping:false};servers.push(server);
  child.once('error',error=>console.error(`${name} server error: ${error.message}`));
  child.once('exit',(code,signal)=>{if(!server.stopping)console.error(`${name} server exited unexpectedly: code=${code}, signal=${signal}`);});
  for(let attempt=0;attempt<120;attempt++) {
    if(child.exitCode!==null) throw new Error(`${name} exited before readiness`);
    try {if((await fetch(url)).ok)return;} catch { /* The owned server is still starting. */ }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error(`${name} did not become ready`);
}

// Historical comparison uses actual tagged source, never the current UI as its own baseline.
async function buildBaseline() {
  const directory=absolute(`${output}/baseline`); await mkdir(directory,{recursive:true});
  const reference='v1.0.0-rc.6';
  const entries=execFileSync('git',['ls-tree','--name-only',reference],{encoding:'utf8'}).trim().split('\n');
  const include=entries.filter(name=>['src','scripts','tests','public','package.json','package-lock.json','vite.config.ts','index.html'].includes(name)||name.startsWith('tsconfig'));
  const archive=absolute(`${output}/baseline.tar`);
  execFileSync('git',['archive','--format=tar',`--output=${archive}`,reference,...include]);
  execFileSync('tar',['-xf',archive,'-C',directory]);
  // Only the build entry config is shared; application source and lockfile come from the tag.
  await copyFile('scripts/qa/post-rc6-vite.config.ts',path.join(directory,'scripts/qa/post-rc6-vite.config.ts'));
  if(performanceOnly) {
    // Equal synthetic workloads and instrumentation, never current application source.
    for(const file of ['final-ux-fixture.tsx','typing-fixtures.ts'])
      await copyFile(`scripts/qa/${file}`,path.join(directory,'scripts/qa',file));
  }
  const npmCli=process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  await command('baseline-install',process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit'],{cwd:directory});
  await command('baseline-build',process.execPath,[path.join(directory,'node_modules/vite/bin/vite.js'),'build','--config','scripts/qa/post-rc6-vite.config.ts'],{
    cwd:directory,env:{...env,NOTEFLOW_PERF_DIST:absolute(`${output}/baseline-dist`)},
  });
  return execFileSync('git',['rev-parse',`${reference}^{commit}`],{encoding:'utf8'}).trim();
}

const functionalSuites=[
  ['rc5-approved-sidebar','rc5-fluid-sidebar/results.json'],
  ['rc5-sidebar-stability','rc5-sidebar-stability/results.json'],
  ['rc5-settings-overflow','rc5-settings-overflow/results.json'],
  ['rc5-final-ui','rc5-final-ui/results.json'],
  ['rc5-corrective3','rc5-corrective3-geometry/results.json'],
  ['final-ux-geometry','final-ux-geometry/results.json'],
  ['final-ux-vision','final-ux-vision/results.json'],
  ['cas-rag-regression','cas-rag-browser-results.json'],
  ['standard-links-corrective','standard-links-corrective/results.json'],
  ['standard-markdown-acceptance','user-md-browser/results.json'],
  ['panel-motion-regression','sidebar-gate-motion-regression/results.json'],
  ['post-rc6-corrective','post-rc6-corrective/results.json'],
  ['strict-toolbar-geometry','strict-toolbar/results.json'],
  ['typing-persistence','typing-persistence-publication/results.json',['publication']],
  ['final-search-validation','final-search-validation/results.json'],
  ['native-smoke-corrective','native-smoke-corrective/results.json'],
  ['repeat-native-corrective','repeat-native-browser/results.json'],
  ['architecture-layout','architecture-layout/results.json'],
  ['compact-form-regression','compact-forms/after/results.json'],
  ['full-localization','full-localization/browser/results.json'],
  ['language-segment','language-segment/browser/results.json'],
  ['neutral-button-backgrounds','neutral-button-backgrounds/browser/results.json'],
  ['classic-vibrant-palette','classic-vibrant-soft/browser/results.json'],
  ['ai-localization','ai-localization/browser/results.json'],
  ['rag-layout-geometry'],['phase-c-editor-geometry'],['phase-c-settings-geometry'],
  ['phase-d-image-geometry'],['phase-e-geometry'],['phase-e-production-worker'],
];
const suites=performanceOnly ? [
  ['post-rc6-performance','post-rc6-perf-publication/results.json',['publication']],
  ['typing-hardening','typing-hardening-publication/results.json',['publication']],
  ['search-decorations-performance','search-decorations-publication/results.json',['publication']],
  ['loading-validation','loading-validation-publication/results.json',['publication']],
] : functionalSuites;
try {
  const baselineCommit=await buildBaseline();
  await command('production-fixture',process.execPath,[vite,'build','--config','scripts/qa/post-rc6-vite.config.ts'],{
    env:{...env,NOTEFLOW_PERF_DIST:`${output}/production`},
  });
  await serve('dev',['--host','127.0.0.1','--port',String(devPort),'--strictPort'],`http://127.0.0.1:${devPort}/scripts/qa/final-ux-fixture.html`);
  await serve('production',['preview','--outDir',`${output}/production`,'--host','127.0.0.1','--port',String(productionPort),'--strictPort'],`http://127.0.0.1:${productionPort}/scripts/qa/final-ux-fixture.html`);
  await serve('baseline',['preview','--outDir',`${output}/baseline-dist`,'--host','127.0.0.1','--port',String(baselinePort),'--strictPort'],`http://127.0.0.1:${baselinePort}/scripts/qa/final-ux-fixture.html`);
  const manifest=[];
  for(const file of await readdir('scripts/qa')) if(file.endsWith('.mjs') && file!=='run-regressions.mjs') {
    const source=await readFile(`scripts/qa/${file}`,'utf8');
    const generated=source.replaceAll('releases/qa/',`${output}/out/`).replaceAll('releases/phase-e-qa/',`${output}/out/phase-e-qa/`)
      .replaceAll('docs/images',`${output}/screenshots`).replaceAll('127.0.0.1:1420',`127.0.0.1:${devPort}`)
      .replaceAll('127.0.0.1:1431',`127.0.0.1:${baselinePort}`).replaceAll('127.0.0.1:1432',`127.0.0.1:${productionPort}`)
      .replaceAll('127.0.0.1:${baseline?1431:1420}','127.0.0.1:${baseline?'+baselinePort+':'+devPort+'}');
    await writeFile(`${output}/runners/${file}`,generated);
    manifest.push({file,sha256:createHash('sha256').update(source).digest('hex')});
  }
  await writeFile(`${output}/manifest.json`,JSON.stringify({baselineCommit,devPort,productionPort,baselinePort,
    baselineHarness:performanceOnly ? {type:'shared synthetic workload; tagged application source',sha256:createHash('sha256').update(await readFile('scripts/qa/final-ux-fixture.tsx')).digest('hex')} : {type:'tagged fixture and application source'},
    sources:manifest},null,2));
  for(const [name,result,args=[]] of suites) {
    const started=Date.now(); let failure;
    try {await command(name,process.execPath,[absolute(`${output}/runners/${name}.mjs`),...args],{
      env:{...env,NOTEFLOW_TYPING_URL:`http://127.0.0.1:${productionPort}/scripts/qa/final-ux-fixture.html`,NOTEFLOW_PERF_URL:`http://127.0.0.1:${productionPort}/scripts/qa/final-ux-fixture.html`},
    });} catch(error) {failure=error.message;}
    let cases=null;
    if(!failure && result) {
      try {const data=JSON.parse(await readFile(`${output}/out/${result}`,'utf8')); cases=(data.results??data.records??data).length??null;}
      catch(error) {failure=`Missing result ledger: ${error.message}`;}
    }
    if(!failure && !result) {
      const log=await readFile(`${output}/${name}.log`,'utf8');
      const match=log.match(/(\d+) (?:real-canvas browser |browser geometry |geometry )cases passed|Phase E responsive QA: (\d+) cases passed|PASS: (\d+) rendered geometry checks/);
      if(match) cases=Number(match[1]??match[2]??match[3]);
      else if(name==='phase-e-production-worker') cases=(log.match(/^(txt|docx|pdf): production CSP worker PASS/gm)??[]).length;
    }
    const summary={name,pass:!failure,cases,seconds:(Date.now()-started)/1000,...(failure?{failure}:{})};
    counts.push(summary); await writeFile(`${output}/results.json`,JSON.stringify({counts},null,2)); console.log(JSON.stringify(summary));
    if(failure) console.error((await readFile(`${output}/${name}.log`,'utf8')).split('\n').slice(-60).join('\n'));
    assert.ok(servers.every(({child})=>child.exitCode===null && child.signalCode===null),'An owned QA server exited; see its diagnostic log');
  }
  assert.ok(counts.every(result=>result.pass),`Browser failures; see ${output}/results.json`);
  console.log(`Browser regression PASS: ${counts.length} suites; results: ${output}`);
} catch(error) {
  for(const {name} of servers)console.error(`--- ${name} server log ---\n${(await readFile(`${output}/${name}.log`,'utf8')).split('\n').slice(-120).join('\n')}`);
  throw error;
} finally {
  for(const server of servers.reverse()) {server.stopping=true;if(server.child.exitCode===null)server.child.kill();await server.log.close();}
}
