// Voice Assistant (client-only) — pt-PT
// Injects a floating mic button and a minimal chat panel.
// Uses Web Speech API for STT/TTS when available; falls back to text chat.

(function(){
  const VA = {
    lang: 'pt-PT',
    greetText: 'Olá! Posso ajudar? Diz, por exemplo: "procura artigos sobre FinRL" ou "mostra-me a página de contacto".',
    listening: false,
    recog: null,
    voices: [],
    graph: null,
    pages: [],
  };

  // Elements
  let panel, btn, inputRow, inputBox, sendBtn;

  function injectStyles(){
    const css = `
    .va-btn{position:fixed;left:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:none;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;font-size:22px;z-index: 10000}
    .va-on{background:#1f6feb;color:#fff}
    .va-off{background:#eaeef3;color:#222}
    .va-panel{position:fixed;left:20px;bottom:90px;width:min(380px,92vw);max-height:60vh;overflow:auto;background:#fff;border:1px solid #dde3ea;border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.18);padding:12px 14px;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;display:none;z-index: 10000;color:#0c1b33}
    .va-row{margin:8px 0}
    .va-row.me{text-align:right}
    .va-row.ai{text-align:left}
    .va-suggest a{display:inline-block;margin:6px 6px 0 0;padding:6px 10px;border-radius:999px;background:#f2f5f9;color:#0c1b33;text-decoration:none;border:1px solid #e3e9f2;font-size:13px}
    .va-hint{opacity:.65;font-size:13px;margin-top:6px}
    .va-input{display:flex;gap:6px;align-items:center;margin-top:8px}
    .va-input input{flex:1;min-width:120px;border:1px solid #dde3ea;border-radius:12px;padding:8px 10px}
    .va-input button{border:1px solid #dde3ea;background:#f2f5f9;color:#0c1b33;border-radius:10px;padding:8px 12px;cursor:pointer}
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c])); }

  // TTS
  function loadVoices(){
    try { VA.voices = speechSynthesis.getVoices().filter(v => v.lang && (v.lang.startsWith('pt-PT') || v.lang.startsWith('pt'))); } catch {}
  }
  function speak(text){
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VA.lang;
    if (VA.voices && VA.voices.length) u.voice = VA.voices[0];
    u.rate = 1; u.pitch = 1; u.volume = 1;
    try { speechSynthesis.cancel(); } catch {}
    try { speechSynthesis.speak(u); } catch {}
  }

  // STT
  function supportedSTT(){ return 'webkitSpeechRecognition' in window; }
  function startListening(){
    if (!supportedSTT()) { showPanel(); addRow('ai','O teu navegador não suporta reconhecimento de voz. Escreve o pedido:'); return; }
    try {
      if (!VA.recog){
        const R = window.webkitSpeechRecognition; VA.recog = new R();
        VA.recog.lang = VA.lang; VA.recog.interimResults = true; VA.recog.maxAlternatives = 1; VA.recog.continuous = false;
      }
      // reset state and handlers per start to avoid stale closures
      let finalText = '';
      let handled = false;
      let timer = null; // hard timeout
      VA.recog.onstart = ()=>{
        showPanel(); hint('A ouvir…');
        if (timer) clearTimeout(timer);
        timer = setTimeout(()=>{
          hint('Sem resposta do microfone. A terminar…');
          try{ VA.recog.abort(); }catch{}
          try{ VA.recog.stop(); }catch{}
        }, 8000);
      };
      VA.recog.onaudiostart = ()=>{};
      VA.recog.onaudioend = ()=>{};
      VA.recog.onspeechstart = ()=>{};
      VA.recog.onspeechend = ()=>{ try{ VA.recog.stop(); }catch{} };
      VA.recog.onresult = (e)=>{
        let interim = '';
        for (let i=e.resultIndex;i<e.results.length;i++){
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
        }
        if (interim) hint('A ouvir: ' + interim);
        if (!handled && finalText.trim()){
          handled = true;
          VA.listening = false; setBtnState();
          const text = finalText.trim(); addRow('me', text);
          handleQuery(text);
          try{ VA.recog.stop(); }catch{}
        }
      };
      VA.recog.onnomatch = ()=>{ if (!handled){ addRow('ai','Não percebi. Podes repetir ou escrever abaixo?'); } };
      VA.recog.onend = ()=>{ if (timer) { clearTimeout(timer); timer=null; } VA.listening = false; setBtnState(); if (!handled && !finalText.trim()) addRow('ai','Não captei áudio. Verifica o microfone e tenta de novo.'); };
      VA.recog.onerror = (ev)=>{ if (timer) { clearTimeout(timer); timer=null; } VA.listening = false; setBtnState(); addRow('ai', 'Erro de reconhecimento: ' + (ev && ev.error ? ev.error : 'desconhecido')); };

      VA.listening = true; setBtnState(); VA.recog.start();
    } catch(err){ VA.listening = false; setBtnState(); console.error(err); }
  }

  function setBtnState(){ btn.classList.toggle('va-on', !!VA.listening); btn.classList.toggle('va-off', !VA.listening); }

  // UI
  function mountUI(){
    injectStyles();
    panel = document.createElement('div'); panel.id='va-panel'; panel.className='va-panel'; panel.setAttribute('aria-live','polite'); document.body.appendChild(panel);
    btn = document.createElement('button'); btn.id='va-btn'; btn.className='va-btn va-off'; btn.setAttribute('aria-label','Assistente por voz'); btn.textContent='🎤'; document.body.appendChild(btn);
    btn.addEventListener('click', ()=>{ showPanel(); if (window.speechSynthesis && speechSynthesis.speaking) try{ speechSynthesis.cancel(); }catch{}; startListening(); });

    // Fallback input always available at bottom
    inputRow = document.createElement('div'); inputRow.className='va-input';
    inputBox = document.createElement('input'); inputBox.type='text'; inputBox.placeholder='Escreve aqui quando não quiseres falar…';
    sendBtn = document.createElement('button'); sendBtn.type='button'; sendBtn.textContent='Enviar';
    inputRow.appendChild(inputBox); inputRow.appendChild(sendBtn);
    sendBtn.addEventListener('click', ()=>{ const t = (inputBox.value||'').trim(); if (!t) return; inputBox.value=''; handleQuery(t); });
    inputBox.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ e.preventDefault(); sendBtn.click(); }});
  }

  function showPanel(){
    if (panel.style.display !== 'block'){
      panel.style.display = 'block';
      if (!panel.dataset.greeted){ addRow('ai', VA.greetText); speak('Olá! Posso ajudar?'); panel.dataset.greeted='1'; }
      panel.appendChild(inputRow);
    }
  }
  function addRow(who, text, suggestions){
    const div = document.createElement('div'); div.className = 'va-row ' + who; div.innerHTML = `<div>${escapeHtml(text||'')}</div>`; panel.appendChild(div);
    if (Array.isArray(suggestions) && suggestions.length){
      const sug = document.createElement('div'); sug.className='va-row va-suggest';
      suggestions.forEach(s=>{ const a=document.createElement('a'); a.href=s.url; a.textContent=s.title; a.target='_self'; sug.appendChild(a); });
      panel.appendChild(sug);
    }
    panel.scrollTop = panel.scrollHeight;
  }
  function hint(text){ const d=document.createElement('div'); d.className='va-hint'; d.textContent=text; panel.appendChild(d); panel.scrollTop = panel.scrollHeight; }

  // Data loading & search
  async function ensureGraph(){
    if (VA.graph) return VA.graph;
    const r = await fetch('graph.json');
    if (!r.ok) throw new Error('Não consegui ler o índice');
    VA.graph = await r.json();
    VA.pages = buildPages(VA.graph);
    return VA.graph;
  }

  function buildPages(g){
    const out = [];
    const nodes = (g && g.nodes) || [];
    for (const n of nodes){
      if (n.kind === 'doc'){
        const url = encodeURI('docs/' + (n.path || ''));
        const title = n.label || (n.path||'').replace(/\.[^/.]+$/, '').replace(/[-_]+/g,' ');
        const kw = [];
        if (n.category) kw.push(String(n.category));
        if (n.sublabel) kw.push(String(n.sublabel));
        if (Array.isArray(n.categories)) kw.push(...n.categories.map(String));
        if (Array.isArray(n.tags)) kw.push(...n.tags.map(String));
        if (n.path) kw.push(String(n.path));
        // include id and slug-ish tokens
        if (n.id) kw.push(String(n.id));
        out.push({ title, url, keywords: kw });
      }
    }
    return out;
  }

  function normalizeStr(s){
    return String(s||'')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function scoreQuery(p, q){
    const hay = normalizeStr(p.title + ' ' + (p.keywords||[]).join(' '));
    const terms = normalizeStr(q).split(/\s+/).filter(Boolean);
    let score = 0;
    for (const t of terms){ if (hay.includes(t)) score += 1; }
    // small bonus for multi-term coverage
    if (score > 1) score += 0.5;
    return score;
  }

  async function handleQuery(text){
    showPanel(); addRow('me', text);
    try {
      await ensureGraph();
      const scored = VA.pages.map(p => ({ ...p, score: scoreQuery(p, text) }))
        .sort((a,b)=> b.score - a.score)
        .slice(0, 5);
      const has = scored.length && scored[0].score > 0;
      const suggestions = (has ? scored.filter(s=>s.score>0).slice(0,3) : []).map(s=>({ title: s.title, url: s.url }));
      const reply = has
        ? (suggestions.length > 1 ? 'Aqui estão algumas páginas relevantes.' : `Encontrei isto que pode ajudar.`)
        : 'Não encontrei algo muito relevante. Queres tentar com outras palavras?';
      addRow('ai', reply, suggestions);
      speak(reply);
    } catch(e){
      console.error(e);
      addRow('ai','Não consegui responder agora. Tenta outra vez.');
    }
  }

  // Boot
  function boot(){
    mountUI();
    if ('speechSynthesis' in window){
      try{ loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; } catch {}
    }
    // Optional: greet shortly after load
    setTimeout(showPanel, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
