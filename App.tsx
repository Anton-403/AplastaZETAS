import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Trophy, Timer, Zap, Volume2, VolumeX, Smartphone, X, Crown, Sparkles, Info } from "lucide-react";
import zetaIconUrl from "./assets/icon_AplastaZetas.png";

type Mush = { id:number; x:number; y:number; vx:number; vy:number; size:number; hue:number; golden:boolean; expiresAt?:number };
type Pop = { id:number; x:number; y:number; text:string; golden?:boolean };
type ScoreRecord = { id:string; value:{score:number; level:number; created_at:string} };

const COLLECTION = "aplasta_zetas_scores";
const GAME_SECONDS = 60;

async function callApi(action:string, args:Record<string,unknown>){
  const res = await fetch("actions", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ action, args }) });
  const json = await res.json().catch(()=>({}));
  if(!res.ok || json?.error) throw new Error(json?.error || `Error ${res.status}`);
  return json.data;
}
function rand(min:number,max:number){ return min + Math.random()*(max-min); }
function makeMush(id:number, level:number, existing:Mush[]=[]):Mush{
  const golden = Math.random() < 1/7;
  const speed = (9 + (level-1)*3.2) * rand(.85,1.25) * (golden ? 1.35 : 1);
  const ang = rand(0, Math.PI*2);
  let x=rand(14,86), y=rand(18,82);
  // avoid stacking on spawn
  for(let i=0;i<8;i++){
    if(existing.every(m=>Math.hypot(m.x-x,m.y-y)>16)) break;
    x=rand(14,86); y=rand(18,82);
  }
  return { id, x, y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed*0.75, size: rand(56,78), hue: Math.floor(rand(0,360)), golden, expiresAt: golden ? Date.now()+2800 : undefined };
}

export default function App(){
  const [phase,setPhase] = useState<"idle"|"playing"|"over">("idle");
  const [paused,setPaused] = useState(false);
  const [score,setScore] = useState(0);
  const [timeLeft,setTimeLeft] = useState(GAME_SECONDS);
  const [mushrooms,setMushrooms] = useState<Mush[]>([]);
  const [pops,setPops] = useState<Pop[]>([]);
  const [soundOn,setSoundOn] = useState(true);
  const [showInstall,setShowInstall] = useState(false);
  const [showHow,setShowHow] = useState(false);
  const [deferredPrompt,setDeferredPrompt] = useState<any>(null);
  const [isInstalled,setIsInstalled] = useState(()=> typeof window!=="undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone===true));
  const [installTab,setInstallTab] = useState<"android"|"iphone">("android");
  const [best,setBest] = useState(0);
  const [topScores,setTopScores] = useState<ScoreRecord[]>([]);
  const [saveState,setSaveState] = useState("");
  const [loadError,setLoadError] = useState("");
  const [smashes,setSmashes] = useState(0);
  const [combo,setCombo] = useState(0);

  const idRef = useRef(100);
  const audioRef = useRef<AudioContext|null>(null);
  const savedForRef = useRef<string>("");
  const mushroomsRef = useRef<Mush[]>([]);
  mushroomsRef.current = mushrooms;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const pausedRef = useRef(paused); pausedRef.current = paused;

  const level = Math.floor(score/50)+1;
  const progress = (score % 50)/50;
  const targetCount = Math.min(2+level, 10);

  const loadScores = useCallback(async()=>{
    try{
      const data = await callApi("records.list", { collection: COLLECTION, limit: 20 });
      const recs = (data?.records||[]) as ScoreRecord[];
      setTopScores(recs);
      const max = recs.reduce((a,r)=>Math.max(a, r.value?.score||0),0);
      setBest(max);
      setLoadError("");
    }catch{ setLoadError("Sin conexión: el marcador se cargará cuando vuelvas a tener red."); }
  },[]);

  useEffect(()=>{ loadScores(); },[loadScores]);

  // Instalación PWA: capturar beforeinstallprompt y detectar si ya está instalada.
  useEffect(()=>{
    const checkInstalled = ()=>{
      setIsInstalled(window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone===true || document.referrer.includes("android-app://"));
    };
    checkInstalled();
    const mq = window.matchMedia("(display-mode: standalone)");
    const onChange = ()=>checkInstalled();
    const onBefore = (e:any)=>{ e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = ()=>{ setIsInstalled(true); setDeferredPrompt(null); };
    mq.addEventListener?.("change", onChange);
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return ()=>{ mq.removeEventListener?.("change", onChange); window.removeEventListener("beforeinstallprompt", onBefore); window.removeEventListener("appinstalled", onInstalled); };
  },[]);

  const handleInstall = useCallback(async()=>{
    if(isInstalled) return;
    if(deferredPrompt){
      try{
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if(choice?.outcome==="accepted") setIsInstalled(true);
      }catch{ setShowInstall(true); }
      finally{ setDeferredPrompt(null); }
      return;
    }
    setInstallTab(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "iphone" : "android");
    setShowInstall(true);
  },[deferredPrompt,isInstalled]);

  // PWA para PWABuilder: manifest + iconos oficiales con la Zeta + metas + service worker (sin tocar el juego)
  useEffect(()=>{
    try{
      const setMeta = (name:string, content:string)=>{
        let m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
        if(!m){ m=document.createElement("meta"); m.setAttribute("name",name); document.head.appendChild(m); }
        m.setAttribute("content",content);
      };
      setMeta("theme-color","#14532d");
      setMeta("mobile-web-app-capable","yes");
      setMeta("apple-mobile-web-app-capable","yes");
      setMeta("apple-mobile-web-app-status-bar-style","black-translucent");
      setMeta("apple-mobile-web-app-title","Aplasta Zetas");
      let vp = document.querySelector('meta[name="viewport"]');
      if(!vp){ vp=document.createElement("meta"); vp.setAttribute("name","viewport"); document.head.appendChild(vp); }
      vp.setAttribute("content","width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");

      const buildIcon = (img:HTMLImageElement, size:number, paddingRatio:number)=>{
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if(!ctx) return "";
        ctx.fillStyle = "#14532d";
        ctx.fillRect(0,0,size,size);
        const pad = Math.round(size * paddingRatio);
        const box = size - pad * 2;
        const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
        return canvas.toDataURL("image/png");
      };
      const applyIcons = (icon192:string, icon512:string, maskable512:string, apple180:string)=>{
        const manifest = { name:"Aplasta Zetas", short_name:"Aplasta Zetas", description:"Aplasta hongos y hongos dorados, suma puntos y sube de nivel", start_url:"./", scope:"./", display:"standalone", orientation:"portrait", background_color:"#14532d", theme_color:"#14532d", lang:"es", categories:["games","entertainment"], icons:[{src:icon192, sizes:"192x192", type:"image/png", purpose:"any"},{src:icon512, sizes:"512x512", type:"image/png", purpose:"any"},{src:maskable512, sizes:"512x512", type:"image/png", purpose:"maskable"},{src:maskable512, sizes:"512x512", type:"image/png", purpose:"any maskable"}] };
        const blob = new Blob([JSON.stringify(manifest)], {type:"application/manifest+json"});
        const url = URL.createObjectURL(blob);
        let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if(!link){ link=document.createElement("link"); link.rel="manifest"; document.head.appendChild(link); }
        link.href=url;
        let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
        if(!apple){ apple=document.createElement("link"); apple.rel="apple-touch-icon"; document.head.appendChild(apple); }
        apple.href=apple180; apple.setAttribute("sizes","180x180");
      };
      const img = new Image();
      img.onload = ()=>{
        try{
          const icon192 = buildIcon(img, 192, 0.12);
          const icon512 = buildIcon(img, 512, 0.12);
          const maskable512 = buildIcon(img, 512, 0.22);
          const apple180 = buildIcon(img, 180, 0.12);
          if(icon192 && icon512 && maskable512 && apple180) applyIcons(icon192, icon512, maskable512, apple180);
        }catch{}
      };
      img.onerror = ()=>{};
      img.src = zetaIconUrl;
      // Service worker en blob: cache de la app para offline / instalación.
      try{
        if("serviceWorker" in navigator){
          const swCode = "const CACHE='aplasta-zetas-v1';self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(['./']);}).catch(function(){}));self.skipWaiting();});self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}).catch(function(){}));});self.addEventListener('fetch',function(e){if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(function(hit){if(hit)return hit;return fetch(e.request).then(function(res){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);}).catch(function(){});return res;}).catch(function(){return caches.match('./');});}));});";
          const swBlob = new Blob([swCode], {type:"text/javascript"});
          const swUrl = URL.createObjectURL(swBlob);
          void navigator.serviceWorker.register(swUrl, {scope:"./"}).catch(()=>{});
        }
      }catch{}
    }catch{}
  },[]);

  const playPop = useCallback((golden=false)=>{
    if(!soundOn) return;
    try{
      if(!audioRef.current) audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioRef.current;
      if(ctx.state==="suspended") void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type="sine"; osc.frequency.setValueAtTime(golden?1320:620,t); osc.frequency.exponentialRampToValueAtTime(golden?540:180,t+0.12);
      gain.gain.setValueAtTime(0.22,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.16);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t+0.17);
      const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
      osc2.type="triangle"; osc2.frequency.setValueAtTime(golden?1760:980,t); osc2.frequency.exponentialRampToValueAtTime(golden?880:420,t+0.08);
      g2.gain.setValueAtTime(0.10,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.1);
      osc2.connect(g2); g2.connect(ctx.destination); osc2.start(t); osc2.stop(t+0.11);
    }catch{}
  },[soundOn]);

  const startGame = useCallback(()=>{
    const initial: Mush[] = [];
    for(let i=0;i<3;i++) initial.push(makeMush(idRef.current++, 1, initial));
    setMushrooms(initial); setScore(0); setTimeLeft(GAME_SECONDS); setPops([]); setSmashes(0); setCombo(0);
    setPaused(false); setPhase("playing"); setSaveState(""); savedForRef.current="";
  },[]);

  const saveScore = useCallback(async(finalScore:number, finalLevel:number)=>{
    const key = `game-${finalScore}-${finalLevel}-${timeLeft}`;
    if(savedForRef.current===key || finalScore<=0) return;
    savedForRef.current=key;
    setSaveState("Guardando tu puntaje…");
    try{
      await callApi("records.create", { collection: COLLECTION, value:{ score:finalScore, level:finalLevel, created_at:new Date().toISOString() }, idempotency_key:`zetas-${finalScore}-${finalLevel}-${Date.now()}` });
      setSaveState("✅ Puntaje guardado");
      await loadScores();
    }catch(e){
      setSaveState(e instanceof Error ? `No se pudo guardar: ${e.message}` : "No se pudo guardar tu puntaje.");
      savedForRef.current="";
    }
  },[loadScores, timeLeft]);

  // Timer
  useEffect(()=>{
    if(phase!=="playing" || paused) return;
    const iv = window.setInterval(()=>{
      setTimeLeft(prev=>{
        if(prev<=1){
          window.clearInterval(iv);
          return 0;
        }
        return prev-1;
      });
    },1000);
    return ()=>window.clearInterval(iv);
  },[phase,paused]);

  // Game over when timer hits 0
  useEffect(()=>{
    if(phase==="playing" && timeLeft===0){
      setPhase("over");
      setPaused(false);
      void saveScore(score, level);
    }
  },[timeLeft, phase, score, level, saveScore]);

  // Movement loop
  useEffect(()=>{
    if(phase!=="playing" || paused) return;
    let raf=0; let last=performance.now();
    const tick=(now:number)=>{
      const dt=Math.min(0.05,(now-last)/1000); last=now;
      setMushrooms(prev=>prev.filter(m=>!m.expiresAt || Date.now()<m.expiresAt).map(m=>{
        let x=m.x+m.vx*dt, y=m.y+m.vy*dt, vx=m.vx, vy=m.vy;
        if(x<8){ x=8; vx=Math.abs(vx); } if(x>92){ x=92; vx=-Math.abs(vx); }
        if(y<10){ y=10; vy=Math.abs(vy); } if(y>90){ y=90; vy=-Math.abs(vy); }
        return {...m,x,y,vx,vy};
      }));
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[phase,paused]);

  // Keep population up: when below target, spawn
  useEffect(()=>{
    if(phase!=="playing" || paused) return;
    if(mushrooms.length < targetCount){
      const t = window.setTimeout(()=>{
        setMushrooms(prev=>{
          if(prev.length>=targetCount) return prev;
          const next=[...prev]; next.push(makeMush(idRef.current++, level, next)); return next;
        });
      }, 380);
      return ()=>window.clearTimeout(t);
    }
  },[mushrooms, phase, paused, targetCount, level]);

  // Combo decay
  useEffect(()=>{
    if(combo===0) return;
    const t=window.setTimeout(()=>setCombo(0),1800);
    return ()=>window.clearTimeout(t);
  },[combo]);

  const smash = (m:Mush, e:React.PointerEvent)=>{
    e.preventDefault();
    if(phase!=="playing" || paused) return;
    playPop(m.golden);
    try{ navigator.vibrate?.(m.golden ? 55 : 28); }catch{}
    const popId = idRef.current++;
    setPops(prev=>[...prev.slice(-5), {id:popId, x:m.x, y:m.y, text: m.golden ? "¡PUM! +15" : "¡PUM! +5", golden: m.golden}]);
    window.setTimeout(()=>setPops(prev=>prev.filter(p=>p.id!==popId)), 900);
    setMushrooms(prev=>prev.filter(x=>x.id!==m.id));
    setScore(s=>s+(m.golden ? 15 : 5)); setSmashes(s=>s+1); setCombo(c=>c+1);
    // spawn 1-2 quickly after smash
    window.setTimeout(()=>{
      setMushrooms(prev=>{
        const next=[...prev];
        const add = Math.random()<0.45 ? 2 : 1;
        for(let i=0;i<add;i++) if(next.length<10) next.push(makeMush(idRef.current++, level, next));
        return next;
      });
    }, 260);
  };

  const togglePause = ()=>{ if(phase==="playing") setPaused(p=>!p); };

  return (
    <div data-safe-area-inset-root className="h-[100dvh] w-full overflow-x-clip overflow-hidden bg-[var(--bg)] text-[var(--ink)] no-select" style={{boxSizing:"border-box", paddingTop:"var(--safe-area-inset-top)"}}>
      <div className="mx-auto flex h-full max-w-[480px] flex-col bg-[#8ed35a] relative overflow-hidden">
        {/* Sky / forest header */}
        <header className="relative shrink-0 bg-gradient-to-b from-[#1e6b2e] via-[#2f9e44] to-[#4fbf4f] px-3 pb-2 pt-2 text-white shadow-[0_6px_0_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#14532d] shadow ring-2 ring-white/70"><img src={zetaIconUrl} alt="Zeta, mascota oficial de Aplasta Zetas" className="h-full w-full object-contain p-0.5" /></div>
              <div className="min-w-0 leading-none">
                <p className="font-display text-[22px] font-extrabold tracking-tight drop-shadow [overflow-wrap:anywhere]">APLASTA ZETAS</p>
                <p className="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-100">Mushroom Smash • Bosque</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={()=>setSoundOn(s=>!s)} aria-label={soundOn?"Silenciar sonido":"Activar sonido"} className="grid h-10 w-10 place-items-center rounded-full bg-white/95 text-slate-800 shadow active:scale-90">{soundOn?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
              <button onClick={handleInstall} aria-label={isInstalled?"La app ya está instalada":"Instalar app"} className="flex h-10 items-center gap-1 rounded-full bg-[#ffcf3f] px-3 text-[12px] font-black text-[#4a2b00] shadow active:scale-95"><Smartphone size={16}/> {isInstalled?"✅ INSTALADA":"INSTALAR"}</button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white px-2 py-1.5 text-center text-[#172a18] shadow">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#6a7a68]">Puntos</p>
              <p className="font-display text-[26px] font-extrabold leading-none tabular-nums">{score}</p>
            </div>
            <div className="rounded-2xl bg-[#172a18] px-2 py-1.5 text-center text-white shadow">
              <p className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider text-yellow-300"><Zap size={11}/> Nivel</p>
              <p className="font-display text-[26px] font-extrabold leading-none">{level}</p>
            </div>
            <div className={`rounded-2xl px-2 py-1.5 text-center shadow ${timeLeft<=10 && phase==="playing" ? "bg-[#ff4d6d] text-white animate-pulse" : "bg-white text-[#172a18]"}`}>
              <p className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#6a7a68]"><Timer size={11}/> Tiempo</p>
              <p className="font-display text-[26px] font-extrabold leading-none tabular-nums">{timeLeft}s</p>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/25">
              <div className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-[#ff4d6d] transition-all duration-300" style={{width:`${Math.round(progress*100)}%`}} />
            </div>
            <span className="shrink-0 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-black text-[#172a18]">{score%50}/50 al Nv. {level+1}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold text-white/95">
            <span className="flex items-center gap-1"><Trophy size={12} className="text-yellow-300"/> Récord: <b>{best}</b></span>
            <span>🍄 {mushrooms.length} en pantalla • {smashes} aplastadas</span>
          </div>
        </header>

        {/* GAME FIELD */}
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[#7ac74f] [touch-action:none]" onContextMenu={e=>e.preventDefault()}>
          {/* decorative forest */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[6%] top-[8%] text-[30px] opacity-90">🌲</div>
            <div className="absolute right-[5%] top-[12%] text-[36px] opacity-90">🌳</div>
            <div className="absolute left-[12%] bottom-[10%] text-[26px] opacity-80">🌷</div>
            <div className="absolute right-[10%] bottom-[16%] text-[26px] opacity-80">🌼</div>
            <div className="absolute left-1/2 top-[6%] -translate-x-1/2 text-[22px] opacity-70">☁️</div>
            <div className="absolute inset-x-0 bottom-0 h-[18%] rounded-t-[50%] bg-[#5cb53a]" />
            <div className="absolute inset-x-0 bottom-0 h-[8%] bg-[#3f8f2a]" />
            <div className="absolute bottom-1 left-[18%] text-[18px]" style={{animation:"grassSway 2s infinite"}}>🌱</div>
            <div className="absolute bottom-2 right-[24%] text-[18px]" style={{animation:"grassSway 2.2s infinite"}}>🌱</div>
          </div>

          {phase==="idle" && (
            <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-black/25 p-4">
              <div className="w-full max-w-[360px] rounded-[28px] bg-[#fffdf3] p-5 text-center shadow-2xl" style={{animation:"popIn .35s ease-out"}}>
                <div className="floaty mx-auto h-[168px] w-[168px] overflow-hidden rounded-[32px] bg-[#14532d] shadow-lg ring-4 ring-[#fff3c4]"><img src={zetaIconUrl} alt="Zeta, mascota oficial de Aplasta Zetas, con explosión amarilla" className="h-full w-full object-contain p-3" /></div>
                <h2 className="font-display text-[30px] font-extrabold leading-none">¿Lista/o para<br/>aplastar?</h2>
                <p className="mt-2 text-[14px] font-bold leading-snug text-[#5a6d58]">Toca cada zeta para ganar <b className="text-[#ff4d6d]">+5 puntos</b>. Cada 50 puntos subes de nivel: más zetas y más rápidas. ¡Tienes 60 segundos!</p>
                <button onClick={startGame} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff4d6d] py-4 font-display text-[22px] font-extrabold text-white shadow-[0_6px_0_#b91c3f] active:translate-y-1 active:shadow-none"><Play size={24} fill="currentColor"/> ¡INICIAR!</button>
                <button onClick={handleInstall} aria-label={isInstalled?"La app ya está instalada":"Instalar app"} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-[20px] font-extrabold shadow-[0_6px_0_#b48a00] active:translate-y-1 active:shadow-none ${isInstalled?"bg-[#2f9e44] text-white shadow-[0_6px_0_#1b6b2e]":"bg-[#ffcf3f] text-[#4a2b00]"}`}>{isInstalled?"✅ YA ESTÁ INSTALADA":"📲 INSTALAR APP"}</button>
                {isInstalled && <p className="mt-1.5 text-[12px] font-bold text-[#5a6d58]">Ya la tienes instalada: ábrela desde tu pantalla de inicio.</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={()=>setShowHow(true)} className="rounded-xl bg-[#e9f7d4] py-2.5 text-[13px] font-black">CÓMO JUGAR</button>
                  <button onClick={handleInstall} className="rounded-xl bg-[#fff3c4] py-2.5 text-[13px] font-black">{isInstalled?"✅ YA ESTÁ INSTALADA":"📱 INSTALAR APP"}</button>
                </div>
                <div className="mt-4 rounded-2xl border-2 border-dashed border-[#2f9e44] bg-[#e9f7d4] p-3 text-left">
                  <p className="text-[13px] font-black uppercase tracking-wide">📦 Instalar como APK</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] font-bold leading-snug text-[#3a4a38]">
                    <li><b>Paso 1:</b> Copiá el link de este juego</li>
                    <li><b>Paso 2:</b> Entrá a pwabuilder.com y pegalo</li>
                    <li><b>Paso 3:</b> Package for Stores &gt; Android &gt; Descargar APK</li>
                  </ol>
                  <p className="mt-1.5 text-[12px] font-bold leading-snug text-[#5a6d58]">PWABuilder genera el APK a partir de esta PWA.</p>
                </div>
                {topScores.length>0 && (
                  <div className="mt-4 rounded-2xl bg-[#f2f8e8] p-3 text-left">
                    <p className="flex items-center gap-1 text-[12px] font-black uppercase tracking-wide"><Crown size={14} className="text-amber-500"/> Mejores puntajes</p>
                    <div className="mt-1.5 space-y-1">
                      {topScores.slice().sort((a,b)=>(b.value.score||0)-(a.value.score||0)).slice(0,3).map((r,i)=>(
                        <p key={r.id} className="flex justify-between text-[13px] font-bold"><span>{i===0?"🥇":i===1?"🥈":"🥉"} Partida • Nv. {r.value.level}</span><b>{r.value.score} pts</b></p>
                      ))}
                    </div>
                  </div>
                )}
                {loadError && <p className="mt-2 text-[12px] font-bold text-amber-700">{loadError}</p>}
              </div>
            </div>
          )}

          {phase==="playing" && paused && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
              <div className="w-full max-w-[320px] rounded-[28px] bg-white p-5 text-center shadow-2xl" style={{animation:"popIn .3s"}}>
                <p className="text-[54px] leading-none">⏸️</p>
                <h2 className="font-display text-[28px] font-extrabold">Pausa</h2>
                <p className="text-[13px] font-bold text-[#5a6d58]">Las zetas están descansando… ¡pero te esperan!</p>
                <button onClick={()=>setPaused(false)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2f9e44] py-3.5 font-display text-[20px] font-extrabold text-white shadow-[0_5px_0_#1b6b2e] active:translate-y-1 active:shadow-none"><Play size={22} fill="currentColor"/> SEGUIR</button>
                <button onClick={startGame} className="mt-2 w-full rounded-2xl bg-[#eef2e6] py-3 text-[14px] font-black">REINICIAR</button>
              </div>
            </div>
          )}

          {phase==="over" && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-4">
              <div className="w-full max-w-[360px] rounded-[28px] bg-[#fffdf3] p-5 text-center shadow-2xl" style={{animation:"popIn .35s"}}>
                <p className="text-[58px] leading-none">🏆</p>
                <h2 className="font-display text-[28px] font-extrabold leading-tight">¡Tiempo terminado!</h2>
                <p className="mt-1 text-[14px] font-bold text-[#5a6d58]">Aplastaste <b>{smashes} zetas</b> y llegaste al nivel <b>{level}</b>.</p>
                <div className="mt-3 rounded-2xl bg-[#fff3c4] py-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#7a5a00]">Tu puntaje</p>
                  <p className="font-display text-[46px] font-extrabold leading-none">{score}</p>
                </div>
                <p className="mt-2 text-[12px] font-bold text-[#5a6d58]">{saveState || (score>best ? "¡Nuevo récord! 🎉" : `Récord: ${best} puntos`)}</p>
                <button onClick={startGame} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff4d6d] py-4 font-display text-[20px] font-extrabold text-white shadow-[0_6px_0_#b91c3f] active:translate-y-1 active:shadow-none"><RotateCcw size={20}/> ¡OTRA VEZ!</button>
                <button onClick={()=>{setPhase("idle"); setMushrooms([]);}} className="mt-2 w-full rounded-2xl bg-[#eef2e6] py-3 text-[14px] font-black">VOLVER AL INICIO</button>
              </div>
            </div>
          )}

          {/* Mushrooms */}
          {mushrooms.map(m=>(
            <button
              key={m.id}
              onPointerDown={(e)=>smash(m,e)}
              aria-label={m.golden ? "Aplastar hongo dorado, +15 puntos" : "Aplastar zeta, +5 puntos"}
              className="absolute z-10 grid place-items-center rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-white"
              style={{ left:`${m.x}%`, top:`${m.y}%`, width:m.size+18, height:m.size+18, transform:"translate(-50%,-50%)", touchAction:"none", background: m.golden ? "radial-gradient(circle, rgba(255,235,130,0.95) 0%, rgba(255,200,30,0.55) 42%, rgba(255,200,30,0) 72%)" : undefined, boxShadow: m.golden ? "0 0 22px 8px rgba(255,215,0,0.85), 0 0 42px 14px rgba(255,180,0,0.45)" : undefined, outline: m.golden ? "3px solid rgba(255,223,70,0.95)" : undefined }}
            >
              <span className="mush relative grid place-items-center" style={{fontSize:m.size, lineHeight:1, filter: m.golden ? "sepia(0.85) saturate(4.5) hue-rotate(-8deg) brightness(1.22) contrast(1.05) drop-shadow(0 0 14px rgba(255,215,0,0.95)) drop-shadow(0 10px 0 rgba(0,0,0,0.18))" : undefined}}>
                <span>🍄</span>
              </span>
            </button>
          ))}

          {/* Pops */}
          {pops.map(p=>(
            <div key={p.id} className="pointer-events-none absolute z-30" style={{left:`${p.x}%`, top:`${p.y}%`}}>
              <div className="burst absolute left-0 top-0" style={{fontSize: p.golden ? 60 : 44}}>✨</div>
              <div className={`pop absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 font-display text-[18px] font-extrabold shadow-lg ${p.golden ? "bg-[#ffb703] text-[#4a2b00] shadow-[0_0_18px_rgba(255,200,0,0.9)]" : "bg-[#ff4d6d] text-white"}`}>{p.text}</div>
            </div>
          ))}

          {phase==="playing" && combo>=3 && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-[#172a18]/90 px-4 py-1.5 text-[13px] font-black text-yellow-300 shadow">🔥 ¡RACHA x{combo}! Sigue así</div>
          )}
          {phase==="playing" && !paused && (
            <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-3 py-1 text-[11px] font-black text-[#2f5a2e]">👆 TOCA LAS ZETAS • +5 CADA UNA</p>
          )}
        </main>

        {/* Controls */}
        <footer className="shrink-0 bg-[#fffdf3] px-3 pb-3 pt-2 shadow-[0_-4px_0_rgba(0,0,0,0.08)]">
          <div className="grid grid-cols-3 gap-2">
            {phase!=="playing" ? (
              <button onClick={startGame} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-[#ff4d6d] py-4 font-display text-[19px] font-extrabold text-white shadow-[0_5px_0_#b91c3f] active:translate-y-1 active:shadow-none"><Play size={22} fill="currentColor"/> {phase==="over"?"JUGAR DE NUEVO":"INICIAR"}</button>
            ) : (
              <button onClick={togglePause} className={`col-span-2 flex items-center justify-center gap-2 rounded-2xl py-4 font-display text-[19px] font-extrabold text-white shadow active:translate-y-1 active:shadow-none ${paused?"bg-[#2f9e44] shadow-[0_5px_0_#1b6b2e]":"bg-[#ffb703] text-[#4a2b00] shadow-[0_5px_0_#b48a00]"}`}>{paused?<><Play size={22} fill="currentColor"/> SEGUIR</>:<><Pause size={22} fill="currentColor"/> PAUSA</>}</button>
            )}
            <button onClick={startGame} className="flex items-center justify-center gap-1 rounded-2xl bg-[#172a18] py-4 font-display text-[15px] font-extrabold text-white active:scale-95"><RotateCcw size={18}/> REINICIAR</button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] font-bold text-[#5a6d58]">
            <button onClick={()=>setShowHow(true)} className="flex items-center gap-1 underline underline-offset-2"><Info size={13}/> Cómo jugar</button>
            <span aria-hidden>•</span>
            <button onClick={handleInstall} className="flex items-center gap-1 underline underline-offset-2"><Smartphone size={13}/> {isInstalled?"✅ Ya está instalada":"Cómo instalar"}</button>
            <span aria-hidden>•</span>
            <span className="flex items-center gap-1"><Sparkles size={13}/> Nv. {level} • {targetCount} zetas</span>
          </div>
        </footer>

        {/* Install sheet */}
        {showInstall && (
          <div className="absolute inset-0 z-40 grid items-end bg-black/50 p-3" onClick={()=>setShowInstall(false)}>
            <div className="w-full rounded-[26px] bg-white p-5 shadow-2xl" onClick={e=>e.stopPropagation()} style={{animation:"popIn .25s"}}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-display text-[22px] font-extrabold leading-none">📱 Instalar en tu celular</p><p className="mt-1 text-[13px] font-bold text-[#5a6d58]">Juega a pantalla completa, como una app.</p></div>
                <button onClick={()=>setShowInstall(false)} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef2e6]"><X size={18}/></button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Ayuda para instalar">
                <button role="tab" aria-selected={installTab==="android"} onClick={()=>setInstallTab("android")} className={`rounded-xl py-2.5 text-[13px] font-black ${installTab==="android"?"bg-[#172a18] text-white":"bg-[#eef2e6] text-[#172a18]"}`}>🤖 Android Chrome</button>
                <button role="tab" aria-selected={installTab==="iphone"} onClick={()=>setInstallTab("iphone")} className={`rounded-xl py-2.5 text-[13px] font-black ${installTab==="iphone"?"bg-[#172a18] text-white":"bg-[#eef2e6] text-[#172a18]"}`}>🍎 iPhone Safari</button>
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border-2 border-dashed border-[#2f9e44] bg-[#e9f7d4] p-3"><p className="font-black text-[14px]">📦 Instalar como APK</p><ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] font-bold leading-snug text-[#3a4a38]"><li><b>Paso 1:</b> Copiá el link de este juego</li><li><b>Paso 2:</b> Entrá a pwabuilder.com y pegalo</li><li><b>Paso 3:</b> Package for Stores &gt; Android &gt; Descargar APK</li></ol><p className="mt-1.5 text-[12px] font-bold leading-snug text-[#5a6d58]">PWABuilder genera el APK a partir de esta PWA.</p></div>
                {installTab==="android" && (<div className="rounded-2xl bg-[#e9f7d4] p-3"><p className="font-black text-[14px]">🤖 Android • Chrome</p><ol className="mt-1 list-decimal space-y-1.5 pl-5 text-[13px] font-bold leading-snug text-[#3a4a38]"><li><b>1.</b> Abrir este juego en <b>Chrome</b> (no en WhatsApp, no en Facebook, no en Meta AI)</li><li><b>2.</b> Tocar los <b>3 puntitos ⋮</b> &gt; <b>Agregar a pantalla de inicio</b> / <b>Instalar app</b></li><li><b>3.</b> Si no aparece, tocar el botón <b>INSTALAR</b> de arriba</li></ol><button onClick={handleInstall} className="mt-3 w-full rounded-xl bg-[#ffcf3f] py-3 text-[14px] font-black text-[#4a2b00] shadow active:scale-95">📲 INSTALAR AHORA</button><p className="mt-1.5 text-center text-[12px] font-bold leading-snug text-[#5a6d58]">Si Chrome muestra el aviso, confírmalo con Instalar / Agregar.</p></div>)}
                {installTab==="iphone" && (<div className="rounded-2xl bg-[#eef4ff] p-3"><p className="font-black text-[14px]">🍎 iPhone • Safari</p><ol className="mt-1 list-decimal space-y-1.5 pl-5 text-[13px] font-bold leading-snug text-[#3a4a38]"><li><b>1.</b> Abrir en <b>Safari</b></li><li><b>2.</b> Tocar <b>Compartir</b> (cuadro con flecha) &gt; <b>Agregar a pantalla de inicio</b></li><li><b>3.</b> Tocar <b>Agregar</b> arriba a la derecha para confirmar.</li></ol></div>)}
                <p className="text-center text-[12px] font-bold text-[#5a6d58]">Tip: ábrelo en Chrome (Android) o Safari (iPhone). No necesitas tienda de apps.</p>
                <button onClick={()=>setShowInstall(false)} className="w-full rounded-2xl bg-[#172a18] py-3.5 font-display text-[16px] font-extrabold text-white">¡ENTENDIDO!</button>
              </div>
            </div>
          </div>
        )}

        {/* How to play */}
        {showHow && (
          <div className="absolute inset-0 z-40 grid items-end bg-black/50 p-3" onClick={()=>setShowHow(false)}>
            <div className="w-full rounded-[26px] bg-white p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
              <div className="flex items-start justify-between"><p className="font-display text-[22px] font-extrabold">🍄 Cómo jugar</p><button onClick={()=>setShowHow(false)} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-[#eef2e6]"><X size={18}/></button></div>
              <ul className="mt-3 space-y-2 text-[14px] font-bold leading-snug text-[#3a4a38]">
                <li>👆 <b>Toca una zeta</b> para aplastarla y ganar <b>+5 puntos</b>.</li>
                <li>✨ Al aplastar, salen <b>más zetas</b> y verás “¡PUM! +5”.</li>
                <li>📈 Cada <b>50 puntos</b> subes de nivel: más zetas y más rápidas.</li>
                <li>⏱️ Tienes <b>60 segundos</b>. ¡Aplasta todo lo que puedas!</li>
                <li>🔊 Activa el sonido para escuchar el “pop” de cada zeta.</li>
              </ul>
              <button onClick={()=>{setShowHow(false); if(phase!=="playing") startGame();}} className="mt-4 w-full rounded-2xl bg-[#ff4d6d] py-3.5 font-display text-[17px] font-extrabold text-white">¡A JUGAR!</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
