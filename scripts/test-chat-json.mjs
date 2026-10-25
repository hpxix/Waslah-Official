import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

// Exercise the real client and Axios transforms without network requests.
const bundled=await build({stdin:{contents:readFileSync('src/lib/directus.ts','utf8')+'\nexport {client as fixtureClient};',resolveDir:process.cwd()+'/src/lib',loader:'ts'},bundle:true,write:false,format:'cjs',platform:'browser',define:{'import.meta.env':'{}'}});
const fixture={exports:{}};
new Function('module','exports',bundled.outputFiles[0].text)(fixture,fixture.exports);
const api=fixture.exports;
let calls=0;
const message='find me people that would want to buy security cameras in saudi arabia riyadh';
const transcript=['user: line one\nline two\t"quoted"\\path\u0000\u0001','assistant: مرحباً\r\nكيف أساعدك؟'];
api.fixtureClient.defaults.adapter=async config=>{
  calls++;
  assert.equal(config.url,'/lead-agent/b2c/chat');
  assert.match(config.headers.get('Content-Type'),/application\/json/);
  assert.equal(typeof config.data,'string');
  assert.doesNotMatch(config.data,/[\u0000-\u001f]/);
  const payload=JSON.parse(config.data);
  assert.equal(payload.message,message);
  assert.deepEqual(payload.transcript,transcript);
  return {data:{data:{text:'Choose a count.',planning:null,ready:false,missing:[],brief:''}},status:200,statusText:'OK',headers:{},config};
};
await api.converseWithWasla(message,transcript,'en','sell','fixture-chat','b2c',undefined,'fast','b2c');
assert.equal(calls,1);
console.log('PASS: real chat Axios request preserves multiline, Arabic, quotes, backslashes and control characters in valid JSON. No network calls.');
