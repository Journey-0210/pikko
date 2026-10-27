import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResearch, researchText, researchCSV } from '../research.js';
import { sourceNote, safePage } from '../core.js';
import {inspectDownloadedOriginal} from '../vault-db.js';

test('official downloads are checked by bytes when BigSpy labels PNG as plain text or JPEG',async()=>{
  const png=new Blob([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],{type:'text/plain'});
  assert.deepEqual(await inspectDownloadedOriginal(png),{kind:'image',mime:'image/png'});
  assert.deepEqual(await inspectDownloadedOriginal(new Blob([png],{type:'image/jpeg'})),{kind:'image',mime:'image/png'});
  await assert.rejects(inspectDownloadedOriginal(new Blob(['<html>error</html>'],{type:'image/png'})));
});

test('BigSpy research preserves measured days and raw estimates, excludes unknown fields, and exports safe multiline CSV', () => {
  const input = { provider:'BigSpy',adId:'a03dc91deb7a75e33dbd06d6016d971d',advertiser:'Tambadana',runningDays:80,firstSeen:'2026-08-04',lastSeen:'2026-10-22',impressions:'1.2M',adText:'Baris satu\n"Baris dua", RM20,000',token:'secret',mediaURL:'https://private.test/file?token=secret',observedAt:'2026-10-23T09:00:00.000Z' };
  const data = normalizeResearch(input);
  assert.equal(data.runningDays,80); assert.equal(data.impressions,'1.2M'); assert.equal(data.adText,input.adText);
  assert(!('token' in data)); assert(!('mediaURL' in data));
  assert.equal(normalizeResearch({...input,adId:'not-a-public-id'}),null);
  assert.equal(normalizeResearch({...input,runningDays:'80 Days'}).runningDays,undefined);
  assert.equal(normalizeResearch({...input,runningDays:-1}).runningDays,undefined);
  assert.equal(normalizeResearch({...input,firstSeen:'2026-99-99'}).firstSeen,undefined);
  const link=safePage('https://app.bigspy.com/adspy/creative/'+data.adId+'?app_type=2&search_flag=145459&token=secret');
  assert.equal(link,'https://app.bigspy.com/adspy/creative/'+data.adId+'?app_type=2&search_flag=145459');
  assert(researchText(data,link).includes('投放天数：80'));
  assert(sourceNote({sourcePage:link,sourceLinkVersion:1,title:'广告',research:data}).includes(input.adText));
  const csv=researchCSV([{title:'=HYPERLINK("bad")',folderId:'fb',rating:4,kind:'image',sourcePage:link,research:data},{title:'old',folderId:'fb'}],()=> 'Tambadana / 2026-10 / FB');
  assert(csv.startsWith('\uFEFF')); assert(csv.includes('"\'=HYPERLINK(""bad"")"')); assert(csv.includes('"Baris satu\n""Baris dua"", RM20,000"')); assert(!csv.includes('secret')); assert(!csv.includes('"old"'));
});
