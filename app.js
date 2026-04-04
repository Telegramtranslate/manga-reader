const API_BASE="/api/anilibria";
const MEDIA_PROXY_BASE="/api/anilibria-media";
const ORIGIN_BASE="https://anilibria.top";
const SITE_URL="https://color-manga-cloud.vercel.app";
const DEFAULT_SEO_TITLE="AnimeCloud — аниме с русской озвучкой";
const DEFAULT_SEO_DESCRIPTION="AnimeCloud — каталог аниме с русской озвучкой, быстрым мобильным интерфейсом, расписанием, подборками и встроенным плеером на базе AniLibria.";
const VIEW_SEO={
  home:{title:DEFAULT_SEO_TITLE,description:DEFAULT_SEO_DESCRIPTION},
  catalog:{title:"Каталог аниме с русской озвучкой — AnimeCloud",description:"Каталог аниме с русской озвучкой: популярные релизы, подбор жанров, форматы, онгоинги и быстрый поиск на AnimeCloud."},
  ongoing:{title:"Онгоинги аниме с русской озвучкой — AnimeCloud",description:"Свежие онгоинги аниме с русской озвучкой и быстрым плеером. Следите за выходом новых эпизодов на AnimeCloud."},
  top:{title:"Топ аниме с русской озвучкой — AnimeCloud",description:"Топ аниме с русской озвучкой: популярные и высоко оценённые релизы в каталоге AnimeCloud."},
  schedule:{title:"Расписание выхода аниме — AnimeCloud",description:"Расписание выхода аниме с русской озвучкой по дням недели на AnimeCloud."},
  search:{title:"Поиск аниме с русской озвучкой — AnimeCloud",description:"Поиск аниме по названию, формату и жанрам в каталоге AnimeCloud."},
  profile:{title:"Профиль зрителя — AnimeCloud",description:"Профиль, избранное и история просмотра в AnimeCloud."}
};
const CACHE_TTL=120000;
const DETAIL_TTL=300000;
const GRID_PAGE_SIZE=24;
const SEARCH_DEBOUNCE=260;
const RENDER_BATCH_SIZE=8;
const FAVORITES_STORAGE_PREFIX="animecloud_favorites";
const WATCH_PROGRESS_KEY="animecloud_watch_progress_v1";
const ADMIN_HERO_STORAGE_KEY="animecloud_admin_featured_alias";
let ignoreHashChange=false;
const responseCache=new Map();
const requestCache=new Map();
const manifestCache=new Map();

const state={currentView:"home",previousView:"home",latest:[],recommended:[],popular:[],catalogItems:[],ongoingItems:[],topItems:[],scheduleItems:[],searchResults:[],sortingOptions:[],typeOptions:[],genreOptions:[],favorites:[],authUser:null,featured:null,searchTimer:null,searchAbort:null,searchQuery:"",catalogPage:0,catalogTotal:0,catalogHasMore:false,catalogSort:"FRESH_AT_DESC",catalogType:"",catalogGenre:"",ongoingPage:0,ongoingTotal:0,ongoingHasMore:false,topPage:0,topTotal:0,topHasMore:false,referencesLoaded:false,homeLoaded:false,catalogLoaded:false,ongoingLoaded:false,topLoaded:false,scheduleLoaded:false,currentAnime:null,currentEpisode:null,currentQuality:"auto",currentSource:"anilibria",manifestBlobUrl:null,hls:null,infiniteObserver:null};

const els={
  tabs:[...document.querySelectorAll(".tab-btn[data-view]")],
  mobileTabs:[...document.querySelectorAll(".mobile-nav__btn[data-view]")],
  panels:[...document.querySelectorAll("[data-view-panel]")],
  brandBtn:document.getElementById("brand-btn"),
  refreshBtn:document.getElementById("refresh-btn"),
  searchInput:document.getElementById("search-input"),
  heroTitle:document.getElementById("hero-title"),
  heroDescription:document.getElementById("hero-description"),
  heroMeta:document.getElementById("hero-meta"),
  heroPoster:document.getElementById("hero-poster"),
  heroOpenBtn:document.getElementById("hero-open-btn"),
  heroRandomBtn:document.getElementById("hero-random-btn"),
  latestCount:document.getElementById("latest-count"),
  catalogCount:document.getElementById("catalog-count"),
  ongoingCount:document.getElementById("ongoing-count"),
  topCount:document.getElementById("top-count"),
  latestGrid:document.getElementById("latest-grid"),
  recommendedGrid:document.getElementById("recommended-grid"),
  popularGrid:document.getElementById("popular-grid"),
  continueGrid:document.getElementById("continue-grid"),
  catalogGrid:document.getElementById("catalog-grid"),
  ongoingGrid:document.getElementById("ongoing-grid"),
  topGrid:document.getElementById("top-grid"),
  scheduleGrid:document.getElementById("schedule-grid"),
  searchGrid:document.getElementById("search-grid"),
  favoritesGrid:document.getElementById("favorites-grid"),
  profileProgressGrid:document.getElementById("profile-progress-grid"),
  continueSummary:document.getElementById("continue-summary"),
  catalogSummary:document.getElementById("catalog-summary"),
  ongoingSummary:document.getElementById("ongoing-summary"),
  topSummary:document.getElementById("top-summary"),
  scheduleSummary:document.getElementById("schedule-summary"),
  searchSummary:document.getElementById("search-summary"),
  profileSummary:document.getElementById("profile-summary"),
  profileProgressSummary:document.getElementById("profile-progress-summary"),
  profileAvatar:document.getElementById("profile-avatar"),
  profileName:document.getElementById("profile-name"),
  profileRoleBadge:document.getElementById("profile-role-badge"),
  profileEmail:document.getElementById("profile-email"),
  favoritesCount:document.getElementById("favorites-count"),
  favoritesMode:document.getElementById("favorites-mode"),
  adminPanel:document.getElementById("admin-panel"),
  adminNote:document.getElementById("admin-note"),
  adminRefreshBtn:document.getElementById("admin-refresh-btn"),
  adminClearCacheBtn:document.getElementById("admin-clear-cache-btn"),
  adminClearCommentsBtn:document.getElementById("admin-clear-comments-btn"),
  adminClearProgressBtn:document.getElementById("admin-clear-progress-btn"),
  catalogSort:document.getElementById("catalog-sort"),
  catalogType:document.getElementById("catalog-type"),
  catalogGenre:document.getElementById("catalog-genre"),
  catalogMoreBtn:document.getElementById("catalog-more-btn"),
  ongoingMoreBtn:document.getElementById("ongoing-more-btn"),
  topMoreBtn:document.getElementById("top-more-btn"),
  drawer:document.getElementById("details-drawer"),
  drawerBackdrop:document.getElementById("drawer-backdrop"),
  drawerClose:document.getElementById("drawer-close"),
  detailPoster:document.getElementById("detail-poster"),
  detailTitle:document.getElementById("detail-title"),
  detailDescription:document.getElementById("detail-description"),
  detailMeta:document.getElementById("detail-meta"),
  detailChips:document.getElementById("detail-chips"),
  detailFavoriteBtn:document.getElementById("detail-favorite-btn"),
  detailShareBtn:document.getElementById("detail-share-btn"),
  detailAdminPinBtn:document.getElementById("detail-admin-pin-btn"),
  sourceSwitch:document.getElementById("source-switch"),
  voiceList:document.getElementById("voice-list"),
  crewList:document.getElementById("crew-list"),
  episodesList:document.getElementById("episodes-list"),
  playerTitle:document.getElementById("player-title"),
  playerNote:document.getElementById("player-note"),
  qualitySwitch:document.getElementById("quality-switch"),
  player:document.getElementById("anime-player"),
  externalPlayer:document.getElementById("external-player"),
  cardTemplate:document.getElementById("anime-card-template"),
  metaDescription:document.getElementById("meta-description"),
  metaRobots:document.getElementById("meta-robots"),
  canonicalLink:document.getElementById("canonical-link"),
  ogType:document.getElementById("og-type"),
  ogTitle:document.getElementById("og-title"),
  ogDescription:document.getElementById("og-description"),
  ogUrl:document.getElementById("og-url"),
  ogImage:document.getElementById("og-image"),
  twitterTitle:document.getElementById("twitter-title"),
  twitterDescription:document.getElementById("twitter-description"),
  twitterImage:document.getElementById("twitter-image"),
  structuredData:document.getElementById("structured-data")
};

const formatNumber=(v)=>new Intl.NumberFormat("ru-RU").format(Number(v||0));
const escapeHtml=(v)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const absoluteUrl=(path)=>!path?"./mc-icon-512.png?v=4":/^https?:\/\//i.test(path)?path:path.startsWith("//")?`https:${path}`:ORIGIN_BASE+path;
function normalizeExternalPlayer(url){if(!url)return"";const raw=url.startsWith("//")?`https:${url}`:url;try{const parsed=new URL(raw);if(parsed.hostname.includes("kodik"))parsed.searchParams.set("translations","true");return parsed.toString();}catch{return raw;}}
function apiUrl(path,params){const url=new URL(API_BASE+path,window.location.origin);if(params)Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=="")url.searchParams.set(k,String(v));});return url.toString();}
function siteUrl(path="/"){return new URL(path,SITE_URL).toString();}
function normalizePath(path){const next=`/${String(path||"").replace(/^\/+/,"")}`.replace(/\/{2,}/g,"/");return next.length>1?next.replace(/\/+$/,""):"/";}
function getViewPath(view){return view==="home"?"/":normalizePath(view);}
function getAnimePath(alias){return `/anime/${encodeURIComponent(alias)}`;}
function routeFromLocation(){const pathname=normalizePath(location.pathname);if(pathname.startsWith("/anime/"))return{type:"anime",alias:decodeURIComponent(pathname.slice(7)),legacy:false};const views=new Set(["/","/catalog","/ongoing","/top","/schedule","/search","/profile"]);if(views.has(pathname))return{type:"view",view:pathname==="/"
?"home":pathname.slice(1),legacy:false};const rawHash=(location.hash||"").replace(/^#/,"");if(rawHash.startsWith("anime/"))return{type:"anime",alias:decodeURIComponent(rawHash.slice(6)),legacy:true};if(rawHash)return{type:"view",view:rawHash,legacy:true};return{type:"view",view:"home",legacy:false};}
function navigateTo(path,options={}){const next=normalizePath(path);if(normalizePath(location.pathname)===next&&!location.hash)return;history[options.replace?"replaceState":"pushState"]({}, "", next);}
function truncateSeoText(text,max=170){const clean=String(text||"").replace(/\s+/g," ").trim();if(clean.length<=max)return clean;return `${clean.slice(0,Math.max(0,max-1)).trim()}…`;}
function buildStructuredData(page){return JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"AnimeCloud","url":siteUrl("/"),"inLanguage":"ru","description":DEFAULT_SEO_DESCRIPTION},page]});}
function applySeo({title,description,path,image,type="website",structuredData}){const canonical=siteUrl(path||"/");document.title=title||DEFAULT_SEO_TITLE;if(els.metaDescription)els.metaDescription.content=description||DEFAULT_SEO_DESCRIPTION;if(els.metaRobots)els.metaRobots.content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";if(els.canonicalLink)els.canonicalLink.href=canonical;if(els.ogType)els.ogType.content=type;if(els.ogTitle)els.ogTitle.content=title||DEFAULT_SEO_TITLE;if(els.ogDescription)els.ogDescription.content=description||DEFAULT_SEO_DESCRIPTION;if(els.ogUrl)els.ogUrl.content=canonical;if(els.ogImage)els.ogImage.content=image||siteUrl("/mc-icon-512.png?v=4");if(els.twitterTitle)els.twitterTitle.content=title||DEFAULT_SEO_TITLE;if(els.twitterDescription)els.twitterDescription.content=description||DEFAULT_SEO_DESCRIPTION;if(els.twitterImage)els.twitterImage.content=image||siteUrl("/mc-icon-512.png?v=4");if(els.structuredData)els.structuredData.textContent=structuredData||buildStructuredData({"@type":"CollectionPage","name":title||DEFAULT_SEO_TITLE,"url":canonical,"inLanguage":"ru","description":description||DEFAULT_SEO_DESCRIPTION,"isPartOf":{"@type":"WebSite","name":"AnimeCloud","url":siteUrl("/")}});}
function updateViewSeo(view){const seo=VIEW_SEO[view]||VIEW_SEO.home;applySeo({title:seo.title,description:seo.description,path:getViewPath(view),structuredData:buildStructuredData({"@type":"CollectionPage","name":seo.title,"url":siteUrl(getViewPath(view)),"inLanguage":"ru","description":seo.description,"isPartOf":{"@type":"WebSite","name":"AnimeCloud","url":siteUrl("/")}})});}
function updateReleaseSeo(release){const description=truncateSeoText(`${release.description||DEFAULT_SEO_DESCRIPTION} ${release.genres?.length?`Жанры: ${release.genres.join(", ")}.`:""} ${release.episodesTotal?`Эпизодов: ${release.episodesTotal}.`:""}`);const path=getAnimePath(release.alias);applySeo({title:`${release.title} — смотреть онлайн с русской озвучкой | AnimeCloud`,description,path,image:release.poster||siteUrl("/mc-icon-512.png?v=4"),type:"video.other",structuredData:buildStructuredData({"@type":"TVSeries","name":release.title,"url":siteUrl(path),"description":description,"image":release.poster||siteUrl("/mc-icon-512.png?v=4"),"genre":release.genres||[],"inLanguage":"ru","numberOfEpisodes":release.episodesTotal||undefined,"dateCreated":/^\d{4}$/.test(String(release.year||""))?String(release.year):undefined,"isPartOf":{"@type":"WebSite","name":"AnimeCloud","url":siteUrl("/")}})});}
async function fetchJson(path,params,options={}){const ttl=options.ttl??CACHE_TTL;const url=apiUrl(path,params);const cached=responseCache.get(url);if(ttl>0&&cached&&Date.now()-cached.time<ttl)return cached.data;if(requestCache.has(url))return requestCache.get(url);const promise=fetch(url,{cache:"no-store",signal:options.signal}).then(async(r)=>{if(!r.ok)throw new Error(`API request failed: ${r.status}`);const data=await r.json();if(ttl>0)responseCache.set(url,{time:Date.now(),data});return data;}).finally(()=>requestCache.delete(url));requestCache.set(url,promise);return promise;}
const extractList=(payload)=>Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:[];
const extractPagination=(payload)=>payload?.meta?.pagination||{current_page:1,total_pages:1,total:extractList(payload).length};
const posterSource=(p)=>absoluteUrl(p?.optimized?.src||p?.src||p?.optimized?.preview||p?.preview||p?.optimized?.thumbnail||p?.thumbnail);
const cardPosterSource=(p)=>absoluteUrl(p?.optimized?.src||p?.src||p?.optimized?.preview||p?.preview||p?.optimized?.thumbnail||p?.thumbnail);
const thumbSource=(p)=>absoluteUrl(p?.optimized?.thumbnail||p?.thumbnail||p?.optimized?.preview||p?.preview||p?.optimized?.src||p?.src);

function buildRelease(item){
  const source=item?.release||item||{};
  const publishedEpisode=item?.published_release_episode||source.published_release_episode||null;
  const members=Array.isArray(source.members)?source.members:[];
  const genres=Array.isArray(source.genres)?source.genres.map((g)=>g?.name||g?.description||g?.value).filter(Boolean):[];
  const episodes=Array.isArray(source.episodes)?source.episodes.slice().sort((a,b)=>(a.ordinal||0)-(b.ordinal||0)).map((e)=>({...e,previewUrl:absoluteUrl(e?.preview?.optimized?.preview||e?.preview?.preview||e?.preview?.optimized?.src||e?.preview?.src||e?.preview?.optimized?.thumbnail||e?.preview?.thumbnail)})):[];
  return {id:source.id,alias:source.alias,title:source.name?.main||source.name?.english||"Без названия",year:source.year||"—",type:source.type?.description||source.type?.value||"Не указано",typeValue:source.type?.value||"",season:source.season?.description||"",age:source.age_rating?.label||"—",ageValue:source.age_rating?.value||"",ongoing:Boolean(source.is_ongoing||source.is_in_production),statusLabel:source.is_ongoing||source.is_in_production?"Онгоинг":"Завершён",publishDay:source.publish_day?.description||"",publishDayValue:source.publish_day?.value||0,description:source.description||"Описание пока не заполнено.",poster:posterSource(source.poster),cardPoster:cardPosterSource(source.poster),thumb:thumbSource(source.poster),genres,episodesTotal:source.episodes_total||episodes.length||0,averageDuration:source.average_duration_of_episode||0,favorites:source.added_in_users_favorites||0,externalPlayer:normalizeExternalPlayer(source.external_player),voices:members.filter((m)=>m?.role?.value==="voicing").map((m)=>m.nickname).filter(Boolean),crew:members.map((m)=>({name:m?.nickname,role:m?.role?.description||m?.role?.value||"Команда"})).filter((m)=>m.name),episodes,publishedEpisode:publishedEpisode?{ordinal:publishedEpisode.ordinal||0,name:publishedEpisode.name||"Без названия",duration:publishedEpisode.duration||0}:null,nextEpisodeNumber:item?.next_release_episode_number||source.next_release_episode_number||null};
}

const buildReleases=(payload)=>extractList(payload).map(buildRelease);
function formatClock(seconds){const value=Math.max(0,Math.floor(Number(seconds||0)));const hours=Math.floor(value/3600);const minutes=Math.floor((value%3600)/60);const secs=value%60;return hours?`${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}`:`${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;}
const formatDurationMinutes=(m)=>m?`${m} мин.`:"";
const formatEpisodeDuration=(s)=>s?`${Math.max(1,Math.round(s/60))} мин.`:"";
function shouldPreferFastStart(){const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;const saveData=Boolean(connection?.saveData);const effectiveType=String(connection?.effectiveType||"");const downlink=Number(connection?.downlink||0);if(saveData||effectiveType==="slow-2g"||effectiveType==="2g"||effectiveType==="3g")return true;if(downlink&&downlink<4)return true;return Boolean(window.matchMedia?.("(max-width: 860px)").matches&&(!downlink||downlink<6));}
function pickPreferredQuality(options){if(!options.length)return"";if(state.currentQuality&&state.currentQuality!=="auto"&&options.some((item)=>item.key===state.currentQuality))return state.currentQuality;if(shouldPreferFastStart()&&options.some((item)=>item.key==="480"))return"480";if(options.some((item)=>item.key==="720"))return"720";if(options.some((item)=>item.key==="1080"))return"1080";return options[0].key;}
function createEmptyState(message){const n=document.createElement("div");n.className="empty-state";n.textContent=message;return n;}
function scheduleChunkAppend(target,nodes){const token=`${Date.now()}-${Math.random()}`;target.dataset.renderToken=token;let index=0;const appendBatch=()=>{if(target.dataset.renderToken!==token)return;const fragment=document.createDocumentFragment();const end=Math.min(index+RENDER_BATCH_SIZE,nodes.length);while(index<end){fragment.appendChild(nodes[index]);index+=1;}target.appendChild(fragment);if(index<nodes.length)requestAnimationFrame(appendBatch);};requestAnimationFrame(appendBatch);}
function createTag(text){const n=document.createElement("span");n.className="tag";n.textContent=text;return n;}
function createMetaPill(text){const n=document.createElement("span");n.className="meta-pill";n.textContent=text;return n;}
function createChip(text){const n=document.createElement("span");n.className="chip";n.textContent=text;return n;}
function readProgressMap(){try{return JSON.parse(localStorage.getItem(WATCH_PROGRESS_KEY)||"{}");}catch{return{};}}
function getProgressForAlias(alias){return alias?readProgressMap()[alias]||null:null;}
function getAllKnownReleases(){const pool=[...state.latest,...state.recommended,...state.popular,...state.catalogItems,...state.ongoingItems,...state.topItems,...state.searchResults,...state.favorites].filter(Boolean);const seen=new Set();return pool.filter((item)=>{if(!item?.alias||seen.has(item.alias))return false;seen.add(item.alias);return true;});}
function findReleaseByAlias(alias){if(!alias)return null;return getAllKnownReleases().find((item)=>item.alias===alias)||null;}
function buildProgressRelease(progress){const known=findReleaseByAlias(progress.alias);if(known)return{...known,__progress:progress};return{id:progress.alias,alias:progress.alias,title:progress.title||"Без названия",year:"",type:"Аниме",age:"",statusLabel:"Продолжить",publishDay:"",poster:progress.poster||"./mc-icon-512.png?v=4",cardPoster:progress.cardPoster||progress.poster||"./mc-icon-512.png?v=4",thumb:progress.cardPoster||progress.poster||"./mc-icon-512.png?v=4",genres:[],episodesTotal:progress.episodeOrdinal||0,__progress:progress};}
function getContinueWatchingReleases(limit=12){return Object.values(readProgressMap()).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,limit).map(buildProgressRelease);}
function progressPercent(progress){const duration=Number(progress?.duration||0);const time=Number(progress?.time||0);if(!duration||duration<=0)return 0;return Math.max(0,Math.min(100,Math.round((time/duration)*100)));}
function createSkeletonCard(){const article=document.createElement("article");article.className="anime-card anime-card--skeleton";article.setAttribute("aria-hidden","true");article.innerHTML='<div class="anime-card__action anime-card__action--skeleton"><div class="anime-card__poster-wrap skeleton-block"></div><div class="anime-card__body"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--meta"></div><div class="skeleton-tags"><span class="skeleton-pill"></span><span class="skeleton-pill"></span></div></div></div>';return article;}
function renderSkeletonGrid(target,count=8){if(!target)return;target.innerHTML="";const fragment=document.createDocumentFragment();for(let i=0;i<count;i+=1)fragment.appendChild(createSkeletonCard());target.appendChild(fragment);}
function decorateCardProgress(node,release){const progress=release?.__progress||getProgressForAlias(release?.alias);if(!progress)return node;const body=node.querySelector(".anime-card__body");if(!body||body.querySelector(".anime-card__progress"))return node;const progressNode=document.createElement("div");progressNode.className="anime-card__progress";progressNode.innerHTML=`<div class="anime-card__progress-bar"><span style="width:${progressPercent(progress)}%"></span></div><div class="anime-card__progress-meta">${escapeHtml(progress.episodeLabel||"Продолжить просмотр")} • ${escapeHtml(formatClock(progress.time||0))}</div>`;body.appendChild(progressNode);return node;}
function renderContinueWatchingSections(){const releases=getContinueWatchingReleases();const summary=releases.length?`Недосмотренных релизов: ${formatNumber(releases.length)}. Быстрый возврат к серии и времени просмотра.`:"Когда начнёте смотреть аниме, здесь появится быстрый возврат к серии.";if(els.continueSummary)els.continueSummary.textContent=summary;if(els.profileProgressSummary)els.profileProgressSummary.textContent=summary;updateGrid(els.continueGrid,releases,"Продолжение просмотра пока пусто.");updateGrid(els.profileProgressGrid,releases,"Продолжение просмотра пока пусто.");}
function decorateEpisodeProgress(release){const progress=getProgressForAlias(release?.alias);if(!progress)return;els.episodesList.querySelectorAll(".episode-btn").forEach((button)=>{const matchId=progress.episodeId&&button.dataset.episodeId===progress.episodeId;const matchOrdinal=!matchId&&String(progress.episodeOrdinal||"")===button.dataset.ordinal;if(!matchId&&!matchOrdinal)return;button.classList.add("has-progress");if(!button.querySelector(".episode-progress")){const bar=document.createElement("div");bar.className="episode-progress";bar.innerHTML=`<span style="width:${progressPercent(progress)}%"></span>`;button.appendChild(bar);}if(!button.querySelector(".episode-progress-meta")){const meta=document.createElement("small");meta.className="episode-progress-meta";meta.textContent=`Продолжить с ${formatClock(progress.time||0)}`;button.appendChild(meta);}});}
function syncHeroOpenLink(){if(state.featured&&els.heroOpenBtn)els.heroOpenBtn.dataset.alias=state.featured.alias;}
function setupInfiniteScroll(){if(state.infiniteObserver)state.infiniteObserver.disconnect();if(!("IntersectionObserver" in window))return;const buttons=[els.catalogMoreBtn,els.ongoingMoreBtn,els.topMoreBtn].filter(Boolean);state.infiniteObserver=new IntersectionObserver((entries)=>{entries.forEach((entry)=>{const button=entry.target;if(!entry.isIntersecting||button.hidden||button.disabled)return;button.click();});},{rootMargin:"280px 0px 320px"});buttons.forEach((button)=>state.infiniteObserver.observe(button));}
function registerGenres(releases){const next=new Set(state.genreOptions);(releases||[]).forEach((release)=>{(release.genres||[]).forEach((genre)=>{const label=String(genre||"").trim();if(label)next.add(label);});});const sorted=[...next].sort((a,b)=>a.localeCompare(b,"ru"));if(sorted.length===state.genreOptions.length&&sorted.every((value,index)=>value===state.genreOptions[index]))return;state.genreOptions=sorted;renderCatalogControls();}
function getFilteredCatalogItems(){if(!state.catalogGenre)return state.catalogItems;return state.catalogItems.filter((release)=>(release.genres||[]).includes(state.catalogGenre));}
function isAdminUser(){const email=String(state.authUser?.email||"").trim().toLowerCase();return Boolean(state.authUser?.isAdmin||email==="serikovmaksim94@gmail.com");}
function readAdminHeroAlias(){try{return localStorage.getItem(ADMIN_HERO_STORAGE_KEY)||"";}catch{return"";}}
function writeAdminHeroAlias(alias){try{if(alias)localStorage.setItem(ADMIN_HERO_STORAGE_KEY,alias);else localStorage.removeItem(ADMIN_HERO_STORAGE_KEY);}catch{}}
function favoriteStorageKey(){return `${FAVORITES_STORAGE_PREFIX}_${state.authUser?.localId||"guest"}`;}
function snapshotRelease(release){return {id:release.id,alias:release.alias,title:release.title,year:release.year,type:release.type,age:release.age,statusLabel:release.statusLabel,publishDay:release.publishDay,poster:release.poster,cardPoster:release.cardPoster,thumb:release.thumb,genres:release.genres||[],episodesTotal:release.episodesTotal||0};}
function loadFavorites(){try{const raw=localStorage.getItem(favoriteStorageKey());state.favorites=raw?JSON.parse(raw):[];}catch{state.favorites=[];}}
function saveFavorites(){localStorage.setItem(favoriteStorageKey(),JSON.stringify(state.favorites));renderProfile();renderFavoriteButton();}
function isFavorite(alias){return state.favorites.some((item)=>item.alias===alias);}
function toggleFavorite(release){const exists=isFavorite(release.alias);state.favorites=exists?state.favorites.filter((item)=>item.alias!==release.alias):[snapshotRelease(release),...state.favorites].slice(0,120);saveFavorites();}
function renderFavoriteButton(){if(!els.detailFavoriteBtn)return;const active=Boolean(state.currentAnime&&isFavorite(state.currentAnime.alias));els.detailFavoriteBtn.textContent=active?"Убрать из избранного":"В избранное";els.detailFavoriteBtn.classList.toggle("is-active",active);}
function renderProfile(){if(!els.favoritesGrid)return;const user=state.authUser;const admin=isAdminUser();els.profileAvatar.src=user?.photoUrl||"./mc-icon-192.png?v=4";els.profileName.textContent=user?.displayName||user?.email?.split("@")[0]||"Гость";els.profileRoleBadge.hidden=!admin;els.profileEmail.textContent=user?.email||"Вход не выполнен";els.favoritesCount.textContent=formatNumber(state.favorites.length);els.favoritesMode.textContent=admin?"Админ":user?.localId?"Аккаунт":"Локально";els.profileSummary.textContent=admin?"У этого аккаунта включён локальный админ-режим для управления сайтом в этом браузере.":user?.localId?"Избранное привязано к текущему аккаунту в этом браузере.":"Войдите, чтобы хранить свою коллекцию отдельно. Без входа избранное сохранится только в этом браузере.";els.adminPanel.hidden=!admin;if(els.adminNote)els.adminNote.textContent=admin?"Админ-инструменты применяются локально в этом браузере и в этой сборке сайта.":"Панель доступна только администратору.";updateGrid(els.favoritesGrid,state.favorites,"В избранном пока пусто.");}
function syncHash(hash){if(location.hash===hash)return;ignoreHashChange=true;location.hash=hash;setTimeout(()=>{ignoreHashChange=false;},0);}
function handleRoute(){const route=routeFromLocation();if(route.legacy){if(route.type==="anime"&&route.alias){navigateTo(getAnimePath(route.alias),{replace:true});}else{navigateTo(getViewPath(route.view||"home"),{replace:true});}}if(route.type==="anime"&&route.alias){openRelease(route.alias,{updateHistory:false}).catch(console.error);return;}if(els.drawer.classList.contains("is-open"))closeDrawer({updateHistory:false});const nextView=route.view||"home";const known=els.panels.some((panel)=>panel.dataset.viewPanel===nextView);setView(known?nextView:"home",{updateHistory:false});}

function createAnimeCard(release,index){
  const node=els.cardTemplate.content.firstElementChild.cloneNode(true);
  const button=node.querySelector(".anime-card__action");
  const poster=node.querySelector(".anime-card__poster");
  node.querySelector(".anime-card__age").textContent=release.age;
  node.querySelector(".anime-card__status").textContent=release.statusLabel;
  node.querySelector(".anime-card__title").textContent=release.title;
  node.querySelector(".anime-card__meta").textContent=[release.type,release.year,`${release.episodesTotal||"?"} эп.`].filter(Boolean).join(" • ");
  poster.src=release.cardPoster;poster.alt=release.title;poster.loading=index<4?"eager":"lazy";poster.decoding="async";poster.fetchPriority=index<2?"high":"auto";poster.srcset=`${release.cardPoster} 1x, ${release.poster} 2x`;poster.sizes="(max-width: 560px) 44vw, (max-width: 920px) 30vw, 220px";
  const tags=node.querySelector(".anime-card__tags");const values=release.genres.slice(0,2);if(!values.length&&release.publishDay)values.push(release.publishDay);values.forEach((v)=>tags.appendChild(createTag(v)));
  button.href=getAnimePath(release.alias);
  button.setAttribute("aria-label",`${release.title}: открыть релиз`);
  button.addEventListener("click",(event)=>{event.preventDefault();openRelease(release.alias).catch(console.error);});
  button.addEventListener("mouseenter",()=>prefetchRelease(release.alias),{once:true});
  button.addEventListener("focus",()=>prefetchRelease(release.alias),{once:true});
  return node;
}

function updateGrid(target,releases,emptyMessage,options={}){const append=Boolean(options.append);const offset=options.offset||0;if(!append)target.innerHTML="";if(!releases.length){if(!append)target.replaceChildren(createEmptyState(emptyMessage));return;}scheduleChunkAppend(target,releases.map((r,i)=>createAnimeCard(r,offset+i)));}
function renderHero(release){if(!release)return;const meta=[`${release.type} • ${release.year}`,release.season,`${release.episodesTotal||"?"} эп.`,release.publishDay?`Выходит: ${release.publishDay}`:"",release.age].filter(Boolean);els.heroTitle.textContent=release.title;els.heroDescription.textContent=release.description;els.heroMeta.replaceChildren(...meta.map(createMetaPill));els.heroPoster.src=release.poster;els.heroPoster.alt=release.title;}
function applyAdminHero(releases){const forcedAlias=readAdminHeroAlias();if(!forcedAlias)return null;return releases.find((release)=>release.alias===forcedAlias)||null;}
function updateStats(){els.latestCount.textContent=formatNumber(state.latest.length);els.catalogCount.textContent=formatNumber(state.catalogTotal);els.ongoingCount.textContent=formatNumber(state.ongoingTotal);els.topCount.textContent=formatNumber(state.popular.length||state.topItems.length);}
function setView(view,options={}){state.currentView=view;if(view!=="search")state.previousView=view;els.tabs.forEach((b)=>{const active=b.dataset.view===view;b.classList.toggle("is-active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});els.mobileTabs.forEach((b)=>{const active=b.dataset.view===view;b.classList.toggle("is-active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});els.panels.forEach((p)=>p.classList.toggle("is-active",p.dataset.viewPanel===view));if(options.updateHistory!==false)navigateTo(getViewPath(view),{replace:options.replaceHistory});updateViewSeo(view);if(view==="search")safeIdle(()=>els.searchInput?.focus());if(view==="profile")renderProfile();ensureViewLoaded(view).catch(console.error);}

async function ensureViewLoaded(view){
  if(view==="home"&&!state.homeLoaded)return loadHome();
  if(view==="catalog"&&!state.catalogLoaded)return loadCatalog({reset:true});
  if(view==="ongoing"&&!state.ongoingLoaded)return loadOngoing({reset:true});
  if(view==="top"&&!state.topLoaded)return loadTop({reset:true});
  if(view==="schedule"&&!state.scheduleLoaded)return loadSchedule();
  if(view==="profile")return renderProfile();
  if(view==="search"&&!state.searchQuery.trim())renderSearchEmpty();
}

async function loadReferences(force=false){
  if(state.referencesLoaded&&!force)return;
  const [sortingPayload,typesPayload]=await Promise.all([fetchJson("/anime/catalog/references/sorting",null,{ttl:DETAIL_TTL}),fetchJson("/anime/catalog/references/types",null,{ttl:DETAIL_TTL})]);
  state.sortingOptions=Array.isArray(sortingPayload)?sortingPayload:[];state.typeOptions=Array.isArray(typesPayload)?typesPayload:[];state.referencesLoaded=true;renderCatalogControls();
}

function renderCatalogControls(){
  els.catalogSort.innerHTML="";els.catalogType.innerHTML='<option value="">Все форматы</option>';els.catalogGenre.innerHTML='<option value="">Все жанры</option>';
  state.sortingOptions.forEach((o)=>{const n=document.createElement("option");n.value=o.value;n.textContent=o.label||o.description||o.value;n.selected=o.value===state.catalogSort;els.catalogSort.appendChild(n);});
  state.typeOptions.forEach((o)=>{const n=document.createElement("option");n.value=o.value;n.textContent=o.description||o.value;n.selected=o.value===state.catalogType;els.catalogType.appendChild(n);});
  state.genreOptions.forEach((genre)=>{const n=document.createElement("option");n.value=genre;n.textContent=genre;n.selected=genre===state.catalogGenre;els.catalogGenre.appendChild(n);});
}

async function loadHome(force=false){
  if(state.homeLoaded&&!force)return;
  updateGrid(els.latestGrid,[],"Загружаем последние релизы…");updateGrid(els.recommendedGrid,[],"Загружаем подборку…");updateGrid(els.popularGrid,[],"Загружаем топ…");
  const [latestPayload,recommendedPayload,popularPayload]=await Promise.all([fetchJson("/anime/releases/latest",{limit:12},{ttl:60000}),fetchJson("/anime/releases/recommended",{limit:12},{ttl:60000}),fetchJson("/anime/catalog/releases",{page:1,limit:12,"f[sorting]":"RATING_DESC"},{ttl:120000})]);
  state.latest=buildReleases(latestPayload);state.recommended=buildReleases(recommendedPayload);state.popular=buildReleases(popularPayload);registerGenres(state.latest);registerGenres(state.recommended);registerGenres(state.popular);state.featured=applyAdminHero([...state.latest,...state.recommended,...state.popular])||state.latest[0]||state.recommended[0]||state.popular[0]||null;state.catalogTotal=extractPagination(popularPayload).total||state.catalogTotal;state.homeLoaded=true;
  renderHero(state.featured);updateGrid(els.latestGrid,state.latest,"Свежие релизы пока не найдены.");updateGrid(els.recommendedGrid,state.recommended,"Подборка пока не заполнена.");updateGrid(els.popularGrid,state.popular,"Популярные релизы пока не найдены.");updateStats();
}

function buildCatalogParams(page,extra={}){const params={page,limit:GRID_PAGE_SIZE,"f[sorting]":state.catalogSort};if(state.catalogType)params["f[types]"]=state.catalogType;Object.assign(params,extra);return params;}

async function loadCatalog(options={}){
  const reset=Boolean(options.reset);const nextPage=reset?1:state.catalogPage+1;
  if(reset){state.catalogItems=[];state.catalogPage=0;state.catalogHasMore=false;els.catalogSummary.textContent="Загружаем каталог…";updateGrid(els.catalogGrid,[],"Загружаем каталог…");}
  els.catalogMoreBtn.disabled=true;const payload=await fetchJson("/anime/catalog/releases",buildCatalogParams(nextPage),{ttl:120000});const releases=buildReleases(payload);const pagination=extractPagination(payload);
  registerGenres(releases);
  state.catalogItems=reset?releases:state.catalogItems.concat(releases);state.catalogPage=pagination.current_page||nextPage;state.catalogTotal=pagination.total||state.catalogItems.length;state.catalogHasMore=state.catalogPage<(pagination.total_pages||1);state.catalogLoaded=true;
  const filteredItems=getFilteredCatalogItems();els.catalogSummary.textContent=state.catalogGenre?`Жанр: ${state.catalogGenre}. Показано ${formatNumber(filteredItems.length)} из ${formatNumber(state.catalogItems.length)} загруженных тайтлов. Страница ${state.catalogPage} из ${pagination.total_pages||1}.`:`${formatNumber(state.catalogTotal)} тайтлов. Страница ${state.catalogPage} из ${pagination.total_pages||1}.`;
  if(reset||state.catalogGenre)updateGrid(els.catalogGrid,filteredItems,state.catalogGenre?`По жанру «${state.catalogGenre}» пока ничего не найдено.`:"Каталог пуст.");else updateGrid(els.catalogGrid,releases,"Каталог пуст.",{append:true,offset:state.catalogItems.length-releases.length});
  els.catalogMoreBtn.hidden=!state.catalogHasMore;els.catalogMoreBtn.disabled=!state.catalogHasMore;updateStats();
}

async function loadOngoing(options={}){
  const reset=Boolean(options.reset);const nextPage=reset?1:state.ongoingPage+1;
  if(reset){state.ongoingItems=[];state.ongoingPage=0;state.ongoingHasMore=false;els.ongoingSummary.textContent="Загружаем онгоинги…";updateGrid(els.ongoingGrid,[],"Загружаем онгоинги…");}
  els.ongoingMoreBtn.disabled=true;const payload=await fetchJson("/anime/catalog/releases",buildCatalogParams(nextPage,{"f[publish_statuses]":"IS_ONGOING"}),{ttl:120000});const releases=buildReleases(payload);registerGenres(releases);const pagination=extractPagination(payload);
  state.ongoingItems=reset?releases:state.ongoingItems.concat(releases);state.ongoingPage=pagination.current_page||nextPage;state.ongoingTotal=pagination.total||state.ongoingItems.length;state.ongoingHasMore=state.ongoingPage<(pagination.total_pages||1);state.ongoingLoaded=true;
  els.ongoingSummary.textContent=`${formatNumber(state.ongoingTotal)} активных релизов. Страница ${state.ongoingPage} из ${pagination.total_pages||1}.`;
  if(reset)updateGrid(els.ongoingGrid,state.ongoingItems,"Онгоинги не найдены.");else updateGrid(els.ongoingGrid,releases,"Онгоинги не найдены.",{append:true,offset:state.ongoingItems.length-releases.length});
  els.ongoingMoreBtn.hidden=!state.ongoingHasMore;els.ongoingMoreBtn.disabled=!state.ongoingHasMore;updateStats();
}

async function loadTop(options={}){
  const reset=Boolean(options.reset);const nextPage=reset?1:state.topPage+1;
  if(reset){state.topItems=[];state.topPage=0;state.topHasMore=false;els.topSummary.textContent="Загружаем топ каталога…";updateGrid(els.topGrid,[],"Загружаем топ каталога…");}
  els.topMoreBtn.disabled=true;const payload=await fetchJson("/anime/catalog/releases",{page:nextPage,limit:GRID_PAGE_SIZE,"f[sorting]":"RATING_DESC"},{ttl:120000});const releases=buildReleases(payload);registerGenres(releases);const pagination=extractPagination(payload);
  state.topItems=reset?releases:state.topItems.concat(releases);state.topPage=pagination.current_page||nextPage;state.topTotal=pagination.total||state.topItems.length;state.topHasMore=state.topPage<(pagination.total_pages||1);state.topLoaded=true;
  els.topSummary.textContent=`${formatNumber(state.topTotal)} релизов в рейтинге. Страница ${state.topPage} из ${pagination.total_pages||1}.`;
  if(reset)updateGrid(els.topGrid,state.topItems,"Топ пока не заполнен.");else updateGrid(els.topGrid,releases,"Топ пока не заполнен.",{append:true,offset:state.topItems.length-releases.length});
  els.topMoreBtn.hidden=!state.topHasMore;els.topMoreBtn.disabled=!state.topHasMore;updateStats();
}

async function loadSchedule(){state.scheduleLoaded=true;els.scheduleGrid.replaceChildren(createEmptyState("Загружаем расписание…"));const payload=await fetchJson("/anime/schedule/week",null,{ttl:60000});state.scheduleItems=buildReleases(payload);renderSchedule();}
function renderSchedule(){if(!state.scheduleItems.length){els.scheduleGrid.replaceChildren(createEmptyState("Расписание пока недоступно."));return;}const groups=new Map();state.scheduleItems.slice().sort((a,b)=>{const dayDiff=(a.publishDayValue||0)-(b.publishDayValue||0);return dayDiff!==0?dayDiff:a.title.localeCompare(b.title,"ru");}).forEach((release)=>{const key=release.publishDay||"Без дня";if(!groups.has(key))groups.set(key,[]);groups.get(key).push(release);});const nodes=[];groups.forEach((releases,day)=>{const dayNode=document.createElement("section");dayNode.className="schedule-day";const title=document.createElement("h3");title.textContent=day;dayNode.appendChild(title);const list=document.createElement("div");list.className="schedule-list";releases.forEach((release)=>{const button=document.createElement("button");button.type="button";button.className="schedule-item";button.innerHTML=`<img src="${escapeHtml(release.thumb)}" alt="${escapeHtml(release.title)}" loading="lazy" decoding="async"><div class="schedule-item__body"><strong>${escapeHtml(release.title)}</strong><span>${escapeHtml(`${release.type} • ${release.year}`)}</span><small>${escapeHtml(release.publishedEpisode?`Доступна ${release.publishedEpisode.ordinal} серия`:release.nextEpisodeNumber?`Следующая серия: ${release.nextEpisodeNumber}`:`${release.episodesTotal||"?"} эп.`)}</small></div>`;button.addEventListener("click",()=>openRelease(release.alias).catch(console.error));list.appendChild(button);});dayNode.appendChild(list);nodes.push(dayNode);});els.scheduleGrid.innerHTML="";scheduleChunkAppend(els.scheduleGrid,nodes);}
function renderSearchEmpty(){updateGrid(els.searchGrid,[],"Введите название аниме, чтобы увидеть результаты.");els.searchSummary.textContent="Введите название сверху, чтобы найти релиз.";}
async function runSearch(query){const cleanQuery=query.trim();state.searchQuery=cleanQuery;if(state.searchAbort){state.searchAbort.abort();state.searchAbort=null;}if(!cleanQuery){state.searchResults=[];renderSearchEmpty();setView(state.previousView||"home");return;}const controller=new AbortController();state.searchAbort=controller;setView("search");els.searchSummary.textContent="Ищем релизы…";updateGrid(els.searchGrid,[],"Ищем релизы…");try{const payload=await fetchJson("/app/search/releases",{query:cleanQuery},{ttl:60000,signal:controller.signal});if(controller.signal.aborted)return;state.searchResults=buildReleases(payload).slice(0,36);els.searchSummary.textContent=state.searchResults.length?`Найдено ${formatNumber(state.searchResults.length)} релизов по запросу «${cleanQuery}».`:`По запросу «${cleanQuery}» ничего не найдено.`;updateGrid(els.searchGrid,state.searchResults,"Ничего не найдено.");}catch(error){if(error.name==="AbortError")return;console.error(error);els.searchSummary.textContent="Поиск временно недоступен.";updateGrid(els.searchGrid,[],"Поиск временно недоступен.");}finally{if(state.searchAbort===controller)state.searchAbort=null;}}
const prefetchRelease=(alias)=>fetchJson(`/anime/releases/${encodeURIComponent(alias)}`,null,{ttl:DETAIL_TTL}).catch(()=>{});
function openDrawer(){els.drawer.classList.add("is-open");els.drawer.setAttribute("aria-hidden","false");}
function closeDrawer(options={}){els.drawer.classList.remove("is-open");els.drawer.setAttribute("aria-hidden","true");destroyPlayer();stopExternalPlayer();if(options.updateHistory!==false)navigateTo(getViewPath(state.previousView||"home"),{replace:options.replaceHistory});updateViewSeo(state.previousView||state.currentView||"home");}
function destroyPlayer(){if(state.hls){state.hls.destroy();state.hls=null;}els.player.pause();els.player.removeAttribute("src");els.player.load();if(state.manifestBlobUrl){URL.revokeObjectURL(state.manifestBlobUrl);state.manifestBlobUrl=null;}}
function stopExternalPlayer(){els.externalPlayer.src="about:blank";els.externalPlayer.hidden=true;els.player.hidden=false;}
function showVideoSurface(){els.externalPlayer.hidden=true;els.player.hidden=false;}
function showExternalSurface(url){destroyPlayer();els.player.hidden=true;els.externalPlayer.hidden=false;els.externalPlayer.src=url;}
function buildQualityOptions(episode){const options=[{key:"1080",label:"1080p",url:episode.hls_1080},{key:"720",label:"720p",url:episode.hls_720},{key:"480",label:"480p",url:episode.hls_480}].filter((item)=>item.url);if(state.currentQuality==="auto"||!options.some((item)=>item.key===state.currentQuality))state.currentQuality=pickPreferredQuality(options);return options;}
function proxiedMediaUrl(url){const normalized=url.startsWith("//")?`https:${url}`:url;const parsed=new URL(normalized);return `${MEDIA_PROXY_BASE}${parsed.pathname}${parsed.search}`;}
function rewriteManifestLine(line,manifestUrl){if(!line||line.startsWith("#"))return line;try{const absolute=new URL(line,manifestUrl).toString();return `${window.location.origin}${proxiedMediaUrl(absolute)}`;}catch{return line;}}
async function loadManifestBlob(manifestUrl){const proxiedUrl=proxiedMediaUrl(manifestUrl);const cached=manifestCache.get(proxiedUrl);let text=cached&&Date.now()-cached.time<DETAIL_TTL?cached.text:"";if(!text){const response=await fetch(proxiedUrl,{cache:"no-store"});if(!response.ok)throw new Error(`Manifest request failed: ${response.status}`);text=await response.text();manifestCache.set(proxiedUrl,{time:Date.now(),text});}const blob=new Blob([text.split("\n").map((line)=>rewriteManifestLine(line.trim(),manifestUrl)).join("\n")],{type:"application/vnd.apple.mpegurl"});return URL.createObjectURL(blob);}
async function attachPlayer(manifestUrl){destroyPlayer();stopExternalPlayer();showVideoSurface();const blobUrl=await loadManifestBlob(manifestUrl);state.manifestBlobUrl=blobUrl;if(window.Hls&&window.Hls.isSupported()){state.hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:10,maxBufferLength:18,maxMaxBufferLength:30,manifestLoadingTimeOut:10000,fragLoadingTimeOut:15000});state.hls.loadSource(blobUrl);state.hls.attachMedia(els.player);return;}els.player.src=blobUrl;}
function buildSourceList(release){const sources=[{id:"anilibria",title:"AniLibria",note:release.voices.length?release.voices.slice(0,4).join(", "):"Русская озвучка AniLibria"}];if(release.externalPlayer)sources.push({id:"external",title:"Другие озвучки",note:"AniDub, DEEP, Studio Band и другие — если они доступны у источника"});return sources;}
function renderSourceSwitch(release){els.sourceSwitch.innerHTML="";buildSourceList(release).forEach((source)=>{const button=document.createElement("button");button.type="button";button.className=`source-btn${state.currentSource===source.id?" is-active":""}`;button.innerHTML=`<strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.note)}</small>`;button.addEventListener("click",()=>switchSource(source.id));els.sourceSwitch.appendChild(button);});}
function renderVoices(release){els.voiceList.innerHTML="";if(!release.voices.length){els.voiceList.appendChild(createEmptyState("Команда озвучки не указана."));return;}release.voices.forEach((name)=>{const pill=document.createElement("div");pill.className="voice-pill";pill.innerHTML=`<strong>${escapeHtml(name)}</strong><small>озвучка</small>`;els.voiceList.appendChild(pill);});}
function renderCrew(release){els.crewList.innerHTML="";if(!release.crew.length){els.crewList.appendChild(createEmptyState("Команда релиза не указана."));return;}release.crew.forEach((member)=>{const pill=document.createElement("div");pill.className="crew-pill";pill.innerHTML=`<strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)}</small>`;els.crewList.appendChild(pill);});}
function renderEpisodes(release){els.episodesList.innerHTML="";if(!release.episodes.length){els.episodesList.appendChild(createEmptyState("У этого релиза пока нет опубликованных серий."));return;}release.episodes.forEach((episode)=>{const button=document.createElement("button");button.type="button";button.className=`episode-btn${state.currentEpisode?.id===episode.id?" is-active":""}`;button.dataset.episodeId=episode.id||"";button.dataset.ordinal=String(episode.ordinal||"");button.innerHTML=`<strong>${escapeHtml(`${episode.ordinal} серия`)}</strong><span>${escapeHtml(episode.name||"Без названия")}</span><small>${escapeHtml(formatEpisodeDuration(episode.duration)||"Длительность не указана")}</small>`;button.addEventListener("click",()=>selectEpisode(episode).catch(console.error));els.episodesList.appendChild(button);});}
function renderDetails(release){els.detailPoster.src=release.poster;els.detailPoster.alt=release.title;els.detailTitle.textContent=release.title;els.detailDescription.textContent=release.description;const meta=[release.type,release.year,release.season,`${release.episodesTotal||"?"} эп.`,formatDurationMinutes(release.averageDuration),release.publishDay?`Выходит: ${release.publishDay}`:"",release.favorites?`${formatNumber(release.favorites)} в избранном`:"",release.age].filter(Boolean);els.detailMeta.replaceChildren(...meta.map(createMetaPill));els.detailChips.replaceChildren(...release.genres.slice(0,10).map(createChip));els.detailAdminPinBtn.hidden=!isAdminUser();if(isAdminUser())els.detailAdminPinBtn.textContent=readAdminHeroAlias()===release.alias?"Главный баннер выбран":"Сделать главным баннером";renderFavoriteButton();renderVoices(release);renderCrew(release);renderEpisodes(release);renderSourceSwitch(release);}
function renderQualityButtons(episode){const qualities=buildQualityOptions(episode);els.qualitySwitch.innerHTML="";qualities.forEach((quality)=>{const button=document.createElement("button");button.type="button";button.className=`quality-btn${state.currentQuality===quality.key?" is-active":""}`;button.textContent=quality.label;button.addEventListener("click",()=>{state.currentQuality=quality.key;selectEpisode(episode,{preserveSource:true}).catch(console.error);});els.qualitySwitch.appendChild(button);});return qualities;}
async function selectEpisode(episode,options={}){if(!state.currentAnime)return;if(!options.preserveSource)state.currentSource="anilibria";state.currentEpisode=episode;renderEpisodes(state.currentAnime);renderSourceSwitch(state.currentAnime);showVideoSurface();stopExternalPlayer();const qualities=renderQualityButtons(episode);const selected=qualities.find((q)=>q.key===state.currentQuality)||qualities[0];els.playerTitle.textContent=`${episode.ordinal} серия${episode.name?` • ${episode.name}`:""}`;window.dispatchEvent(new CustomEvent("animecloud:episode-selected",{detail:{release:state.currentAnime,episode,sourceId:state.currentSource}}));if(!selected){destroyPlayer();els.playerNote.textContent="У этой серии пока нет доступного потока.";return;}els.playerNote.textContent=`Поток запускается через ваш домен. Стартовое качество: ${selected.label}. Если нужно, переключите его вручную.`;try{await attachPlayer(selected.url);els.player.play().catch(()=>{});}catch(error){console.error(error);els.playerNote.textContent="Не удалось загрузить поток. Попробуйте другое качество или другую серию.";}}
function switchSource(sourceId){if(!state.currentAnime)return;state.currentSource=sourceId;renderSourceSwitch(state.currentAnime);window.dispatchEvent(new CustomEvent("animecloud:source-changed",{detail:{release:state.currentAnime,sourceId}}));if(sourceId==="external"&&state.currentAnime.externalPlayer){showExternalSurface(state.currentAnime.externalPlayer);els.qualitySwitch.innerHTML="";els.playerTitle.textContent="Другие озвучки";els.playerNote.textContent="Если внешний источник поддерживает AniDub, DEEP, Studio Band или другие переводы, выбирайте их внутри этого плеера.";return;}if(state.currentEpisode){selectEpisode(state.currentEpisode,{preserveSource:true}).catch(console.error);return;}if(state.currentAnime.episodes.length){selectEpisode(state.currentAnime.episodes[0],{preserveSource:true}).catch(console.error);return;}destroyPlayer();stopExternalPlayer();els.qualitySwitch.innerHTML="";els.playerTitle.textContent="Серии отсутствуют";els.playerNote.textContent="Для этого релиза пока нет опубликованных эпизодов.";}
async function openRelease(alias,options={}){const payload=await fetchJson(`/anime/releases/${encodeURIComponent(alias)}`,null,{ttl:DETAIL_TTL});const release=buildRelease(payload);state.currentAnime=release;state.currentEpisode=null;state.currentQuality="auto";state.currentSource="anilibria";renderDetails(release);window.dispatchEvent(new CustomEvent("animecloud:release-opened",{detail:{release}}));if(options.updateHash!==false)syncHash(`#anime/${encodeURIComponent(alias)}`);openDrawer();if(release.episodes.length){await selectEpisode(release.episodes[0]);return;}if(release.externalPlayer){switchSource("external");return;}destroyPlayer();stopExternalPlayer();els.qualitySwitch.innerHTML="";els.playerTitle.textContent="Серии отсутствуют";els.playerNote.textContent="Для этого релиза пока нет опубликованных эпизодов.";}
function pickRandomRelease(){const pool=[...state.latest,...state.recommended,...state.popular].filter(Boolean);if(!pool.length)return;openRelease(pool[Math.floor(Math.random()*pool.length)].alias).catch(console.error);}
function safeIdle(callback){if("requestIdleCallback"in window){window.requestIdleCallback(callback,{timeout:1200});return;}setTimeout(callback,180);}
async function refreshAll(){responseCache.clear();requestCache.clear();manifestCache.clear();state.homeLoaded=false;state.catalogLoaded=false;state.ongoingLoaded=false;state.topLoaded=false;state.scheduleLoaded=false;state.referencesLoaded=false;state.genreOptions=[];if(state.searchAbort){state.searchAbort.abort();state.searchAbort=null;}await loadReferences(true);await loadHome(true);await ensureViewLoaded(state.currentView);}
async function clearSiteRuntimeCaches(){responseCache.clear();requestCache.clear();manifestCache.clear();if("caches"in window){const keys=await caches.keys();await Promise.all(keys.map((key)=>caches.delete(key)));}}
function registerServiceWorker(){if(!("serviceWorker"in navigator))return;window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js?v=13",{updateViaCache:"none"}).catch(()=>{});});}
function bindViewButtons(buttons){buttons.forEach((button)=>button.addEventListener("click",(event)=>{event.preventDefault();setView(button.dataset.view);}));}
function bindNavigationDelegates(){document.addEventListener("click",(event)=>{const link=event.target.closest("a");if(!link)return;if(link.id==="brand-btn"){event.preventDefault();setView("home");return;}if(link.classList.contains("seo-footer__link")){const view=(link.getAttribute("href")||"/").replace(/^\/+/,"")||"home";event.preventDefault();setView(view==="home"?"home":view);}});window.addEventListener("popstate",handleRoute);window.addEventListener("hashchange",()=>{if(!ignoreHashChange)handleRoute();});window.addEventListener("animecloud:release-opened",(event)=>{const release=event.detail?.release;if(!release?.alias)return;updateReleaseSeo(release);navigateTo(getAnimePath(release.alias));});}
function bindEvents(){bindViewButtons(els.tabs);bindViewButtons(els.mobileTabs);els.brandBtn.addEventListener("click",()=>setView("home"));els.refreshBtn.addEventListener("click",()=>refreshAll().catch(console.error));els.heroOpenBtn.addEventListener("click",()=>state.featured&&openRelease(state.featured.alias).catch(console.error));els.heroRandomBtn.addEventListener("click",pickRandomRelease);els.catalogMoreBtn.addEventListener("click",()=>loadCatalog({reset:false}).catch(console.error));els.ongoingMoreBtn.addEventListener("click",()=>loadOngoing({reset:false}).catch(console.error));els.topMoreBtn.addEventListener("click",()=>loadTop({reset:false}).catch(console.error));els.catalogSort.addEventListener("change",()=>{state.catalogSort=els.catalogSort.value;state.catalogLoaded=false;loadCatalog({reset:true}).catch(console.error);});els.catalogType.addEventListener("change",()=>{state.catalogType=els.catalogType.value;state.catalogLoaded=false;loadCatalog({reset:true}).catch(console.error);});els.catalogGenre.addEventListener("change",()=>{state.catalogGenre=els.catalogGenre.value;state.catalogLoaded=false;loadCatalog({reset:true}).catch(console.error);});els.searchInput.addEventListener("input",(event)=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>runSearch(event.target.value).catch(console.error),SEARCH_DEBOUNCE);});els.drawerClose.addEventListener("click",()=>closeDrawer());els.drawerBackdrop.addEventListener("click",()=>closeDrawer());els.detailFavoriteBtn.addEventListener("click",()=>{if(state.currentAnime)toggleFavorite(state.currentAnime);});els.detailAdminPinBtn.addEventListener("click",()=>{if(!state.currentAnime||!isAdminUser())return;writeAdminHeroAlias(state.currentAnime.alias);state.featured=state.currentAnime;renderHero(state.currentAnime);els.detailAdminPinBtn.textContent="Главный баннер выбран";});els.detailShareBtn.addEventListener("click",async()=>{if(!state.currentAnime)return;const url=`${location.origin}${location.pathname}#anime/${encodeURIComponent(state.currentAnime.alias)}`;try{await navigator.clipboard.writeText(url);els.detailShareBtn.textContent="Ссылка скопирована";setTimeout(()=>{els.detailShareBtn.textContent="Скопировать ссылку";},1400);}catch{els.detailShareBtn.textContent="Не удалось скопировать";setTimeout(()=>{els.detailShareBtn.textContent="Скопировать ссылку";},1400);}});els.adminRefreshBtn.addEventListener("click",()=>refreshAll().catch(console.error));els.adminClearCacheBtn.addEventListener("click",async()=>{await clearSiteRuntimeCaches();window.dispatchEvent(new CustomEvent("animecloud:admin-cache-cleared"));await refreshAll().catch(console.error);});els.adminClearCommentsBtn.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("animecloud:admin-clear-comments")));els.adminClearProgressBtn.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("animecloud:admin-clear-progress")));window.addEventListener("hashchange",()=>{if(!ignoreHashChange)handleRoute();});window.addEventListener("animecloud:auth",(event)=>{state.authUser=event.detail?.user||null;loadFavorites();renderProfile();renderFavoriteButton();if(state.currentAnime)renderDetails(state.currentAnime);});window.addEventListener("animecloud:profile-request",()=>setView("profile"));document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&els.drawer.classList.contains("is-open"))closeDrawer();});}
async function init(){bindEvents();registerServiceWorker();try{state.authUser=JSON.parse(localStorage.getItem("animecloud_auth_v1")||"null");}catch{state.authUser=null;}loadFavorites();renderProfile();renderSearchEmpty();try{await loadReferences();await loadHome();updateStats();handleRoute();safeIdle(()=>{loadSchedule().catch(()=>{});loadTop({reset:true}).catch(()=>{});});}catch(error){console.error(error);updateGrid(els.latestGrid,[],"Не удалось загрузить домашнюю страницу.");updateGrid(els.recommendedGrid,[],"Не удалось загрузить домашнюю страницу.");updateGrid(els.popularGrid,[],"Не удалось загрузить домашнюю страницу.");}}
const createAnimeCardBase=createAnimeCard;
createAnimeCard=function(release,index){return decorateCardProgress(createAnimeCardBase(release,index),release);};
const renderEpisodesBase=renderEpisodes;
renderEpisodes=function(release){renderEpisodesBase(release);decorateEpisodeProgress(release);};
const renderHeroBase=renderHero;
renderHero=function(release){renderHeroBase(release);syncHeroOpenLink();};
const renderProfileBase=renderProfile;
renderProfile=function(){renderProfileBase();renderContinueWatchingSections();};
const loadHomeBase=loadHome;
loadHome=async function(force=false){if(!state.homeLoaded||force){renderSkeletonGrid(els.continueGrid,4);renderSkeletonGrid(els.latestGrid,6);renderSkeletonGrid(els.recommendedGrid,6);renderSkeletonGrid(els.popularGrid,6);}const result=await loadHomeBase(force);renderContinueWatchingSections();syncHeroOpenLink();return result;};
const loadCatalogBase=loadCatalog;
loadCatalog=async function(options={}){if(options?.reset)renderSkeletonGrid(els.catalogGrid,8);const result=await loadCatalogBase(options);setupInfiniteScroll();return result;};
const loadOngoingBase=loadOngoing;
loadOngoing=async function(options={}){if(options?.reset)renderSkeletonGrid(els.ongoingGrid,8);const result=await loadOngoingBase(options);setupInfiniteScroll();return result;};
const loadTopBase=loadTop;
loadTop=async function(options={}){if(options?.reset)renderSkeletonGrid(els.topGrid,8);const result=await loadTopBase(options);setupInfiniteScroll();return result;};
window.addEventListener("animecloud:progress-updated",()=>{renderContinueWatchingSections();if(state.currentAnime)decorateEpisodeProgress(state.currentAnime);});
bindNavigationDelegates();
init().catch(console.error);
