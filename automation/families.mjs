// Persist only public ad IDs and hashes of observed media paths, never signed media URLs.
export function mergeFamily(groups,keys) {
  const merged=new Set(keys);
  for(let i=0;i<groups.length;) {
    if(groups[i].some(key=>merged.has(key))) {for(const key of groups[i])merged.add(key);groups.splice(i,1);i=0;}
    else i++;
  }
  const family=[...merged].sort();groups.push(family);return family;
}
