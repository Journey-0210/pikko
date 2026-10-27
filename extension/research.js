const textFields = { advertiser: 250, developer: 250, adAccount: 250, network: 80, language: 100, region: 300, dimensions: 100, headline: 500, adText: 16000, description: 2000, impressions: 80, popularity: 80, score: 80, weekScore: 80, topPercent: 40 };
export const researchFields = [['adId','广告 ID'],['advertiser','广告主'],['developer','开发商'],['adAccount','投放账号'],['network','平台'],['runningDays','投放天数'],['firstSeen','首次展示'],['lastSeen','最后展示'],['impressions','展示量（BigSpy）'],['popularity','热度'],['score','创意分数'],['weekScore','本周分数'],['topPercent','创意排名'],['region','地区'],['language','语言'],['dimensions','尺寸'],['headline','广告标题'],['adText','广告文案'],['description','广告描述'],['observedAt','采集时间']];

export function normalizeResearch(input) {
  if (!input || input.provider !== 'BigSpy' || !/^(?:[a-f0-9]{32}|\d{1,40})$/i.test(String(input.adId || ''))) return null;
  const data = { provider: 'BigSpy', adId: String(input.adId) };
  if (Number.isInteger(input.appType) && input.appType >= 1 && input.appType <= 99) data.appType = input.appType;
  if (Number.isInteger(input.searchFlag) && input.searchFlag >= 0 && input.searchFlag <= 99999999) data.searchFlag = input.searchFlag;
  for (const [key, limit] of Object.entries(textFields)) if (typeof input[key] === 'string' && input[key].trim()) data[key] = input[key].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit);
  if (typeof input.runningDays === 'number' && Number.isInteger(input.runningDays) && input.runningDays >= 0 && input.runningDays <= 100000) data.runningDays = input.runningDays;
  for (const key of ['firstSeen','lastSeen']) if (/^\d{4}-\d{2}-\d{2}$/.test(input[key] || '') && Number.isFinite(Date.parse(input[key])) && new Date(input[key]).toISOString().slice(0, 10) === input[key]) data[key] = input[key];
  if (typeof input.observedAt === 'string' && Number.isFinite(Date.parse(input.observedAt))) data.observedAt = new Date(input.observedAt).toISOString();
  return data;
}

export function researchSource(data, page) {
  const url = new URL(page);
  if (data.appType !== undefined && data.searchFlag !== undefined) return url.origin + '/adspy/creative/' + data.adId + `?app_type=${data.appType}&search_flag=${data.searchFlag}`;
  return url.origin + url.pathname;
}

export function researchText(input, source = '') {
  const data = normalizeResearch(input); if (!data) return '';
  return ['BigSpy', ...researchFields.filter(([key]) => data[key] !== undefined).map(([key, label]) => `${label}：${data[key]}`), ...(source ? [`来源：${source}`] : [])].join('\n');
}

export function researchCSV(assets, folderPath) {
  const base = ['素材名称','文件夹','星级','类型','来源链接'];
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = assets.filter(asset => normalizeResearch(asset.research)).map(asset => {
    const data = normalizeResearch(asset.research);
    return [asset.title, folderPath(asset.folderId), asset.rating || 0, asset.kind === 'video' ? '视频' : '图片', asset.sourcePage || '', ...researchFields.map(([key]) => data[key] ?? '')];
  });
  return '\uFEFF' + [[...base, ...researchFields.map(([,label]) => label)], ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
