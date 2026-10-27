import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const machineFile=`${ROOT}/automation/machine.json`;
export let machine={};
try{machine=JSON.parse(fs.readFileSync(machineFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
export const EXTENSION=machine.extensionId?`chrome-extension://${machine.extensionId}/library.html`:null;
export const FFMPEG=process.env.PIKKO_FFMPEG||machine.ffmpegPath||'ffmpeg';
export const CONFIG_PATH=path.resolve(ROOT,process.env.PIKKO_CONFIG_PATH||'automation/config.json');

export function validateConfig(config){
 const text=(value,name)=>{if(typeof value!=='string'||!value.trim())throw Error(`Missing or empty ${name}`);};
 text(config.rootFolder,'rootFolder');
 if(!Array.isArray(config.brands)||!config.brands.length)throw Error('Configure at least one verified competitor in automation/config.json; read docs/AGENT_PLAYBOOK.md');
 if(!Array.isArray(config.platforms)||!config.platforms.length)throw Error('Configure at least one platform');
 for(const brand of config.brands){text(brand.folder,'brand.folder');text(brand.query,'brand.query');if(!Array.isArray(brand.match)||!brand.match.length)throw Error('brand.match must contain verified advertiser names');for(const name of brand.match)text(name,'brand.match');if(brand.accountMatch&&!Array.isArray(brand.accountMatch))throw Error('accountMatch must be an array');if(brand.searchField&&!['Ad Info','Advertiser'].includes(brand.searchField))throw Error('Unsupported searchField');if(brand.modes&&(!Array.isArray(brand.modes)||!brand.modes.length||brand.modes.some(m=>!['top','new'].includes(m))))throw Error('Unsupported brand.modes');for(const key of ['topCount','newCount'])if(brand[key]!==undefined&&(!Number.isInteger(brand[key])||brand[key]<1))throw Error(`Invalid brand.${key}`);}
 for(const p of config.platforms){if(!['Facebook','AdMob'].includes(p.name))throw Error('This collector currently supports Facebook and AdMob only');text(p.folder,'platform.folder');}
 for(const key of ['topCount','newCount','maxCandidates'])if(!Number.isInteger(config[key])||config[key]<1)throw Error(`Invalid ${key}`);
 if(config.maxRunMs!==undefined&&(!Number.isInteger(config.maxRunMs)||config.maxRunMs<1000))throw Error('Invalid maxRunMs');
 if(config.country!==undefined)text(config.country,'country');
 if(config.industry!==undefined&&config.industry!==null)text(config.industry,'industry');
 if(config.dateRange){for(const value of [config.dateRange.start,config.dateRange.end])if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Invalid dateRange');if(config.dateRange.start>config.dateRange.end)throw Error('Date range must be chronological');}
 if(new Set(config.brands.map(b=>b.folder)).size!==config.brands.length)throw Error('Competitor folders must be unique');
 if(new Set(config.platforms.map(p=>p.folder)).size!==config.platforms.length)throw Error('Platform folders must be unique');
 return config;
}
