// Production entry point for the React Router Alpha checkout only.
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=realpathSync(fileURLToPath(new URL('..',import.meta.url)));
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/logs'},...options});
const output=(cmd,args)=>run(cmd,args,{stdio:'pipe',encoding:'utf8'}).trim();
const mode=process.argv[2];
if(process.argv.length>3 || (mode && !['--check','--dry-run'].includes(mode)))throw Error('Use --check, --dry-run, or no argument.');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
if(pkg.name!=='komaplay-react-router' || pkg.scripts.build!=='WRANGLER_LOG_PATH=.wrangler/logs pnpm exec react-router build' || pkg.dependencies.vinext || pkg.dependencies.next)throw Error('Production requires the React Router Alpha package.');
if(realpathSync(output('git',['rev-parse','--show-toplevel']))!==root)throw Error('Run from the dedicated Alpha checkout.');
if(output('git',['status','--porcelain']))throw Error('Commit or remove pending changes before building production.');
const sha=output('git',['rev-parse','HEAD']);
console.log(`React Router Alpha production source: ${root}\nCommit: ${sha}\nWorker: komaplay`);
if(mode!=='--check'){
 run('pnpm',['build']);
 const config='react-router-build/server/wrangler.json';
 const built=JSON.parse(readFileSync(new URL('../'+config,import.meta.url),'utf8'));
 if(built.main!=='index.js' || built.assets?.directory!=='../client' || !['komaplay-canary','komaplay'].includes(built.name))throw Error('Unexpected React Router Worker configuration.');
 if(output('git',['status','--porcelain']))throw Error('Build changed source; review and commit before deployment.');
 run('pnpm',['exec','wrangler','deploy','--config',config,'--name','komaplay','--keep-vars','--message',`${sha} React Router Alpha`,...(mode==='--dry-run'?['--dry-run']:[])]);
}
