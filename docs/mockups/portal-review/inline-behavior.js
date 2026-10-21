/* Presentation adaptation only; source-owned route and mutation models remain unchanged. */
let inlineCatalogPage=0;
const originalFilterCatalog=filterCatalog;
function showInlineCatalogPage(){
  const list=$('#catalog-results');
  if(!list)return;
  const entries=[...list.children];
  const perPage=18;
  const pages=Math.max(1,Math.ceil(entries.length/perPage));
  inlineCatalogPage=Math.min(inlineCatalogPage,pages-1);
  entries.forEach((item,i)=>item.hidden=i<inlineCatalogPage*perPage||i>=(inlineCatalogPage+1)*perPage);
  $('#inline-catalog-pages')?.remove();
  list.insertAdjacentHTML('afterend',`<div id="inline-catalog-pages" class="inline-catalog-pages"><button type="button" class="button small" data-inline-page="previous" ${inlineCatalogPage===0?'disabled':''}>Previous screens</button><span class="meta">Page ${inlineCatalogPage+1} of ${pages}</span><button type="button" class="button small" data-inline-page="next" ${inlineCatalogPage+1===pages?'disabled':''}>Next screens</button></div>`);
}
filterCatalog=function(){inlineCatalogPage=0;originalFilterCatalog();showInlineCatalogPage();};
reviewRoot.addEventListener('click',event=>{
  const button=event.target.closest('[data-inline-page]');
  if(button){inlineCatalogPage+=button.dataset.inlinePage==='next'?1:-1;showInlineCatalogPage();}
});
// Voice transitions replace only their session panel; initialize the supplied icons there too.
const originalVoiceRepaint=voiceRepaint;
voiceRepaint=function(...args){
  originalVoiceRepaint(...args);
  if(globalThis.lucide)lucide.createIcons({attrs:{width:18,height:18}});
};
