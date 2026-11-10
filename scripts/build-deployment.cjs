'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative));
const installation=(process.env.CASHFLOW_INSTALLATION_NAME||'').trim();
if(installation&&(installation.length>64||/[<>"'&\r\n]/.test(installation)))throw new Error('CASHFLOW_INSTALLATION_NAME no es válido.');

let html=read('app/cashflow.src.html').toString('utf8');
function replaceOnce(before,after){
  if(!html.includes(before))throw new Error(`No se encontró el marcador de compilación: ${before.slice(0,60)}`);
  html=html.replace(before,after);
}
replaceOnce('@import url("brand/tokens/fisterra.tokens.css");',read('app/brand/tokens/fisterra.tokens.css').toString('utf8'));
for(const name of ['Montserrat-Variable-400-700.woff2','Montserrat-Variable-Italic.woff2']){
  replaceOnce(`brand/fonts/${name}`,`data:font/woff2;base64,${read(`app/brand/fonts/${name}`).toString('base64')}`);
}
replaceOnce('<!--FISTERRA_LOGO-->',read('app/brand/logo/fisterra-lockup-horizontal.svg').toString('utf8'));

// Every named customer starts without Fisterra's demonstration movements.
const data=installation?{ref:'2000-01-01',tc:0,mov:[],cartera:[]}:JSON.parse(read('data/sample/data.json').toString('utf8'));
if(installation){
  replaceOnce('<title>Fisterra · Cashflow</title>',`<title>${installation} · Cashflow</title>`);
  replaceOnce('<span class="company">FISTERRA EJEMPLO</span>',`<span class="company">${installation.toLocaleUpperCase('es-AR')}</span>`);
}
replaceOnce('/*DATA*/',JSON.stringify(data).replace(/</g,'\\u003c'));
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'dist/cashflow.html');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,html,'utf8');
process.stdout.write(`App generada para ${installation||'Fisterra Ejemplo'} en ${output}\n`);
