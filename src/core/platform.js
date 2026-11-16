export function isHostedSite(page=globalThis.location){
  return page?.protocol==='https:';
}

export function hostedSiteUrl(page=globalThis.location){
  const url=new URL('.',page.href);
  return url.href;
}
