import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../run.mjs',import.meta.url),'utf8');const helper=source.slice(source.indexOf('async function clickText('),source.indexOf('async function clickNetwork('));
test('sort selection invokes the unique enabled native option without coordinate hit testing',async()=>{
 let clicks=0,disabled=false,duplicate=false;const label='Sort by latest creatives ↓';
 const option={innerText:label,children:[],getClientRects:()=>[{}],getAttribute:()=>null,get disabled(){return disabled;},click(){clicks++;}};
 const popup='.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
 const context=vm.createContext({Error,document:{body:{},querySelector:scope=>({querySelectorAll:()=>duplicate||scope==='body'?[option,option]:[option]})},getComputedStyle:()=>({visibility:'visible'}),page:{evaluate:async(fn,arg)=>fn(arg)}});
 vm.runInContext(helper+'\nglobalThis.choose=clickText;',context);
 await assert.rejects(context.choose(label),/Ambiguous/);await context.choose(label,popup);assert.equal(clicks,1);disabled=true;await assert.rejects(context.choose(label,popup),/Disabled/);assert.equal(clicks,1);disabled=false;duplicate=true;await assert.rejects(context.choose(label,popup),/Ambiguous/);assert.equal(clicks,1);
});
