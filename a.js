if (!String.prototype.replaceAll) {
      String.prototype.replaceAll = function(search, replacement) {
        var target = String(this);
        if (search instanceof RegExp) return target.replace(search, replacement);
        return target.split(String(search)).join(String(replacement));
      };
    }
    if (!Array.from) {
      Array.from = function(iter) { return [].slice.call(iter); };
    }

    var state = { questions: [], currentIndex: 0, answers: {} };
    var reviewFilter = 'all';
    var LS_KEY = 'sqmocha_autosave_v1';

    function $(sel, root){ return (root || document).querySelector(sel); }
    function $all(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

    function toast(msg, timeout){
      timeout = timeout || 2600;
      var wrap = document.getElementById('toast');
      if(!wrap) return;
      var el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(function(){ try{ el.remove(); }catch(e){ wrap.removeChild(el); } }, timeout);
    }

    window.addEventListener('error', function(e){
      try{ toast('Erro JS: ' + (e.message || 'desconhecido')); }catch(_){}
    });

    function escapeHtml(str){
      return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    /**
     * Converte o campo "imagem" (string ou array) em uma lista de {url, caption}
     * Formato string: "url1::legenda1|url2|url3::legenda3"
     * Formato array: ["url", {url:"...", caption:"..."}]
     */
    function parseImageEntries(source) {
      var entries = [];
      if (Array.isArray(source)) {
        source.forEach(function(item) {
          if (typeof item === 'string') {
            entries.push({ url: item.trim(), caption: '' });
          } else if (item && item.url) {
            entries.push({ url: String(item.url).trim(), caption: item.caption ? String(item.caption) : '' });
          }
        });
      } else if (typeof source === 'string') {
        var parts = source.split('|');
        parts.forEach(function(part) {
          var trimmed = part.trim();
          if (!trimmed) return;
          var splitIdx = trimmed.indexOf('::');
          if (splitIdx !== -1) {
            var url = trimmed.substring(0, splitIdx).trim();
            var caption = trimmed.substring(splitIdx + 2).trim();
            entries.push({ url: url, caption: caption });
          } else {
            entries.push({ url: trimmed, caption: '' });
          }
        });
      }
      return entries;
    }

    function renderImages(container, imageSource) {
      container.innerHTML = '';
      container.classList.remove('single-image');

      var entries = parseImageEntries(imageSource);
      if (entries.length === 0) {
        container.style.display = 'none';
        return;
      }

      var safeEntries = [];
      for (var i = 0; i < entries.length; i++) {
        var src = entries[i].url;
        if (!src) continue;
        if (src.toLowerCase().includes('<img')) {
          try {
            var tmp = document.createElement('div');
            tmp.innerHTML = src;
            var imgTag = tmp.querySelector('img');
            if (imgTag && imgTag.getAttribute('src')) {
              src = imgTag.getAttribute('src');
            }
          } catch(e) {}
        }
        var lowered = src.toLowerCase();
        if (lowered.startsWith('javascript:') || lowered.startsWith('vbscript:')) continue;
        var isValid = /^(https?:|data:image\/|\/|\.\.?\/)/i.test(src) || !/^[a-z]+:/i.test(src);
        if (isValid) {
          safeEntries.push({ url: src, caption: entries[i].caption || '' });
        }
      }

      if (safeEntries.length === 0) {
        container.style.display = 'none';
        return;
      }

      safeEntries.forEach(function(entry, index) {
        var imgDiv = document.createElement('div');
        imgDiv.className = 'gallery-image';
        imgDiv.setAttribute('tabindex', '0');
        imgDiv.setAttribute('role', 'button');
        var ariaLabel = 'Ampliar imagem ' + (index+1);
        if (entry.caption) ariaLabel += ' - ' + entry.caption;
        imgDiv.setAttribute('aria-label', ariaLabel);
        imgDiv.dataset.src = entry.url;

        var img = new Image();
        img.alt = entry.caption || ('Imagem ' + (index+1) + ' da questão');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = entry.url;
        img.onerror = function() { imgDiv.style.display = 'none'; };

        imgDiv.appendChild(img);

        if (entry.caption) {
          var captionEl = document.createElement('div');
          captionEl.className = 'img-caption';
          captionEl.textContent = entry.caption;
          imgDiv.appendChild(captionEl);
        }

        imgDiv.addEventListener('click', function(e) {
          e.stopPropagation();
          openZoom(entry.url);
        });
        imgDiv.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openZoom(entry.url);
          }
        });

        container.appendChild(imgDiv);
      });

      if (safeEntries.length === 1) {
        container.classList.add('single-image');
      }
      container.style.display = 'flex';
    }

    function toggleMenu(){
      var sb = document.getElementById('sidebar');
      var ov = document.getElementById('overlay');
      if(!sb || !ov) return;
      var open = sb.classList.toggle('open');
      ov.style.display = open ? 'block' : 'none';
    }

    function toggleAccordion(id){
      var content = document.getElementById(id);
      var key = String(id).replace('acc-','');
      var arrow = document.getElementById('arrow-' + key);
      if(!content) return;

      if(content.style.maxHeight && content.style.maxHeight !== '0px'){
        content.style.maxHeight = null;
        if(arrow) arrow.style.transform = 'rotate(0deg)';
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        if(arrow) arrow.style.transform = 'rotate(90deg)';
      }
    }

    function setAccordionOpen(id, open){
      var content = document.getElementById(id);
      var key = String(id).replace('acc-','');
      var arrow = document.getElementById('arrow-' + key);
      if(!content) return;

      if(open){
        content.style.maxHeight = content.scrollHeight + 'px';
        if(arrow) arrow.style.transform = 'rotate(90deg)';
      } else {
        content.style.maxHeight = null;
        if(arrow) arrow.style.transform = 'rotate(0deg)';
      }
    }

    function initTheme(){
      var prefersDark = false;
      if (window.matchMedia) {
        prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      if (!document.body.getAttribute('data-theme')) {
        document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      }
      var t = document.body.getAttribute('data-theme');
      var icon = document.getElementById('themeIcon');
      if(icon) icon.textContent = (t === 'dark') ? '🌙' : '☀️';
    }

    function toggleTheme(){
      var t = document.body.getAttribute('data-theme');
      var next = (t === 'dark') ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      var icon = document.getElementById('themeIcon');
      if(icon) icon.textContent = (next === 'dark') ? '🌙' : '☀️';
      persistLocal();
    }

    function toggleStatsModal(){
      var m = document.getElementById('statsModal');
      if(!m) return;
      m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
      updateStats();
    }

    /* ============================================================
       ZOOM APRIMORADO - PAN & ZOOM COM RODA DO MOUSE / TOUCH
       ============================================================ */
    var zoomState = { scale: 1, x: 0, y: 0, panning: false, startX: 0, startY: 0 };
    var initialPinchDist = null;
    var initialScale = 1;

    function openZoom(imgSrc) {
      var modal = document.getElementById('imageModal');
      var modalImg = document.getElementById('modalImg');
      if (!modal || !modalImg) return;
      
      if (!imgSrc) {
        var firstImg = document.querySelector('#imgContainer .gallery-image img');
        if (firstImg) imgSrc = firstImg.src;
      }
      if (!imgSrc) return;
      
      modalImg.src = imgSrc;
      
      zoomState = { scale: 1, x: 0, y: 0, panning: false, startX: 0, startY: 0 };
      modalImg.style.transition = 'none';
      modalImg.style.transform = 'translate(0px, 0px) scale(1)';
      
      modal.style.display = 'flex';
    }

    function closeZoomModal() {
      document.getElementById('imageModal').style.display = 'none';
    }

    function updateZoomTransform() {
      var img = document.getElementById('modalImg');
      img.style.transform = 'translate(' + zoomState.x + 'px, ' + zoomState.y + 'px) scale(' + zoomState.scale + ')';
    }

    function initZoomEvents() {
      var modal = document.getElementById('imageModal');
      var img = document.getElementById('modalImg');

      modal.addEventListener('wheel', function(e) {
        e.preventDefault();
        img.style.transition = 'transform 0.1s ease-out';
        var delta = Math.sign(e.deltaY) * -1;
        zoomState.scale += delta * 0.25;
        zoomState.scale = Math.max(1, Math.min(zoomState.scale, 8));
        
        if(zoomState.scale === 1){ zoomState.x = 0; zoomState.y = 0; }
        updateZoomTransform();
      }, { passive: false });

      modal.addEventListener('mousedown', function(e) {
        if(e.target.closest('.close-zoom-btn')) return;
        e.preventDefault();
        zoomState.panning = true;
        zoomState.startX = e.clientX - zoomState.x;
        zoomState.startY = e.clientY - zoomState.y;
        img.style.transition = 'none';
      });

      window.addEventListener('mouseup', function() {
        zoomState.panning = false;
      });

      window.addEventListener('mousemove', function(e) {
        if(!zoomState.panning) return;
        zoomState.x = e.clientX - zoomState.startX;
        zoomState.y = e.clientY - zoomState.startY;
        updateZoomTransform();
      });

      modal.addEventListener('touchstart', function(e) {
        if(e.target.closest('.close-zoom-btn')) return;
        
        if (e.touches.length === 1) {
          zoomState.panning = true;
          zoomState.startX = e.touches[0].clientX - zoomState.x;
          zoomState.startY = e.touches[0].clientY - zoomState.y;
          img.style.transition = 'none';
        } else if (e.touches.length === 2) {
          zoomState.panning = false;
          initialPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialScale = zoomState.scale;
          img.style.transition = 'none';
        }
      }, { passive: false });

      window.addEventListener('touchend', function() {
        zoomState.panning = false;
        initialPinchDist = null;
      });

      window.addEventListener('touchmove', function(e) {
        if (e.touches.length === 1 && zoomState.panning) {
          zoomState.x = e.touches[0].clientX - zoomState.startX;
          zoomState.y = e.touches[0].clientY - zoomState.startY;
          updateZoomTransform();
        } else if (e.touches.length === 2 && initialPinchDist) {
          var currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          var ratio = currentDist / initialPinchDist;
          zoomState.scale = Math.max(1, Math.min(initialScale * ratio, 8));
          
          if(zoomState.scale === 1){ zoomState.x = 0; zoomState.y = 0; }
          updateZoomTransform();
        }
      }, { passive: false });

      img.addEventListener('dblclick', function() {
        img.style.transition = 'transform 0.3s ease';
        if(zoomState.scale > 1) {
          zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0;
        } else {
          zoomState.scale = 2.5;
        }
        updateZoomTransform();
      });
    }

    /* ============================================================
       PARSER E LÓGICAS DO QUIZ
       ============================================================ */
    function parseCSVSmart(text){
      var lines = text.split(/\r?\n/).filter(function(x){ return x && x.trim(); });
      if(!lines.length) return [];
      var head = lines[0];
      var semi = (head.match(/;/g) || []).length;
      var comma = (head.match(/,/g) || []).length;
      var sep = semi > comma ? ';' : ',';

      function parseLine(line){
        var out = [];
        var cur = '';
        var inQuotes = false;
        for (var i=0;i<line.length;i++){
          var ch = line[i];
          if(ch === '"'){
            if(inQuotes && line[i+1] === '"'){ cur += '"'; i++; }
            else { inQuotes = !inQuotes; }
          } else if(ch === sep && !inQuotes){
            out.push(cur);
            cur = '';
          } else {
            cur += ch;
          }
        }
        out.push(cur);
        return out.map(function(s){ return String(s).trim(); });
      }

      var rows = lines.map(parseLine);
      return rows.slice(1).map(function(col){
        return {
          id: col[0],
          pergunta: col[1],
          alternativas: [col[2], col[3], col[4], col[5], col[6]].filter(function(x){ return x && x.trim(); }),
          gabarito: (col[7] || '').trim().toUpperCase(),
          comentario: col[8] || '',
          dissertativa: !col[2],
          imagem: col[9] || ''
        };
      });
    }

    function handleFile(input, type){
      var reader = new FileReader();
      reader.onload = function(e){
        try{
          state.questions = (type === 'json') ? JSON.parse(e.target.result) : parseCSVSmart(e.target.result);
          state.currentIndex = 0;
          state.answers = {};
          switchView('quiz');
          render();
          toggleMenu();
          toast('Questões carregadas.');
        }catch(err){
          console.error(err);
          toast('Erro ao ler arquivo.');
        } finally {
          try{ input.value = ''; }catch(_){ }
        }
      };
      reader.readAsText(input.files[0]);
    }

    function importCode(){
      try{
        state.questions = JSON.parse(document.getElementById('codePaste').value);
        state.currentIndex = 0;
        state.answers = {};
        switchView('quiz');
        render();
        toggleMenu();
        toast('Questões injetadas.');
      }catch(e){
        toast('Erro JSON no INJETAR.');
      }
    }

    function render(){
      var emptyActions = document.getElementById('emptyStateActions');
      
      if(!state.questions.length) {
        if(emptyActions) emptyActions.style.display = 'block';
        var qMeta = document.getElementById('qMeta');
        var qText = document.getElementById('qText');
        var imgDiv = document.getElementById('imgContainer');
        var optDiv = document.getElementById('options');
        var areaDiss = document.getElementById('areaDissertativa');
        var responseBox = document.getElementById('userResponseBox');
        var feedback = document.getElementById('feedback');
        if(qMeta) qMeta.textContent = '';
        if(qText) qText.innerHTML = 'Aguardando questões...';
        if(imgDiv) imgDiv.style.display = 'none';
        if(optDiv) optDiv.style.display = 'none';
        if(areaDiss) areaDiss.style.display = 'none';
        if(responseBox) responseBox.style.display = 'none';
        if(feedback) feedback.style.display = 'none';
        updateStats();
        return;
      }
      
      if(emptyActions) emptyActions.style.display = 'none';
      
      var q = state.questions[state.currentIndex];
      var userAns = state.answers[q.id];

      var qMeta = document.getElementById('qMeta');
      var qText = document.getElementById('qText');
      if(qMeta) qMeta.textContent = 'QUESTÃO ' + (state.currentIndex+1) + ' DE ' + state.questions.length;
      
      if(qText) qText.innerHTML = q.pergunta;

      var imgDiv = document.getElementById('imgContainer');
      if(imgDiv) renderImages(imgDiv, q.imagem);

      var optDiv = document.getElementById('options');
      var areaDiss = document.getElementById('areaDissertativa');
      var responseBox = document.getElementById('userResponseBox');

      if(q.dissertativa){
        if(optDiv) optDiv.style.display = 'none';
        if(userAns){
          if(areaDiss) areaDiss.style.display = 'none';
          if(responseBox) responseBox.style.display = 'block';
          var urt = document.getElementById('userResponseText');
          if(urt) urt.textContent = userAns;
        } else {
          if(areaDiss) areaDiss.style.display = 'block';
          if(responseBox) responseBox.style.display = 'none';
        }
      } else {
        if(areaDiss) areaDiss.style.display = 'none';
        if(responseBox) responseBox.style.display = 'none';
        if(optDiv){
          optDiv.style.display = 'flex';
          optDiv.innerHTML = '';
          var letters = ['A','B','C','D','E'];
          for (var i=0;i<letters.length;i++){
            if(!q.alternativas[i]) continue;
            (function(L, idx){
              var btn = document.createElement('button');
              btn.className = 'btn-opt';
              btn.type = 'button';
              btn.innerHTML = '<span class="opt-letter">' + L + '</span> <span>' + escapeHtml(q.alternativas[idx]) + '</span>';

              if(userAns){
                if(L === q.gabarito) btn.classList.add('correct');
                else if(userAns === L) btn.classList.add('wrong');
                btn.disabled = true;
              }
              btn.onclick = function(){
                if(!state.answers[q.id]){
                  state.answers[q.id] = L;
                  render();
                  persistLocal();
                }
              };
              optDiv.appendChild(btn);
            })(letters[i], i);
          }
        }
      }

      var feedback = document.getElementById('feedback');
      if(feedback) feedback.style.display = userAns ? 'block' : 'none';
      var comment = document.getElementById('commentText');
      if(comment) comment.innerHTML = q.comentario || '';

      updateStats();
      persistLocal();
    }

    function submitDissertativa(){
      if(!state.questions.length) return;
      var q = state.questions[state.currentIndex];
      var ta = document.getElementById('txtResposta');
      var val = (ta ? ta.value : '').trim();
      if(!val){ toast('Escreva sua resposta!'); return; }
      state.answers[q.id] = val;
      if(ta) ta.value = '';
      render();
    }

    function changeQ(dir){ goToIdx(state.currentIndex + dir); }
    function goToIdx(n){
      if(n>=0 && n<state.questions.length){
        state.currentIndex = n;
        render();
        window.scrollTo(0,0);
      }
    }

    function updateStats(){
      var total = state.questions.length || 1;
      var doneCount = Object.keys(state.answers).length;
      var pct = (doneCount / total) * 100;

      var bar = document.getElementById('progressBar');
      if(bar) bar.style.width = pct + '%';

      var pctEl = document.getElementById('txtPercent');
      if(pctEl) pctEl.textContent = Math.round(pct) + '%';

      var marker = document.getElementById('coffeeMarker');
      if(marker) marker.style.left = Math.min(pct, 100) + '%';

      var steam = document.getElementById('steam');
      if(steam) steam.style.display = (pct >= 100) ? 'block' : 'none';

      var hits = 0, miss = 0;
      for (var i=0;i<state.questions.length;i++){
        var q = state.questions[i];
        var ans = state.answers[q.id];
        if(ans){
          if(q.dissertativa) continue;
          if(ans === q.gabarito) hits++; else miss++;
        }
      }

      var sh = document.getElementById('statHits');
      var sm = document.getElementById('statMiss');
      var st = document.getElementById('statTotal');
      if(sh) sh.textContent = hits;
      if(sm) sm.textContent = miss;
      if(st) st.textContent = total;

      var sp = document.getElementById('statsPercent');
      if(sp) sp.textContent = Math.round(pct) + '%';

      var coffeeFill = document.getElementById('coffeeFill');
      if(coffeeFill) coffeeFill.style.height = pct + '%';
    }

    function switchView(view){
      var quiz = document.getElementById('quizView');
      var review = document.getElementById('reviewView');
      var library = document.getElementById('libraryView');
      var progress = document.getElementById('progressContainer');
      if(view === 'review'){
        if(quiz) quiz.style.display = 'none';
        if(review) review.style.display = 'block';
        if(library) library.style.display = 'none';
        if(progress) progress.style.display = 'none';
        buildReview();
      } else if(view === 'library') {
        if(quiz) quiz.style.display = 'none';
        if(review) review.style.display = 'none';
        if(library) library.style.display = 'block';
        if(progress) progress.style.display = 'none';
      } else {
        if(review) review.style.display = 'none';
        if(library) library.style.display = 'none';
        if(quiz) quiz.style.display = 'block';
        if(progress) progress.style.display = 'block';
      }
      window.scrollTo(0,0);
    }

    function openReview(){
      switchView('review');
      var sb = document.getElementById('sidebar');
      if(sb && sb.classList.contains('open')) toggleMenu();
    }
    
    function closeReview(){ switchView('quiz'); }

    function setFilterPillActive(key){
      var keys = ['all','hit','miss','diss'];
      for (var i=0;i<keys.length;i++){
        var el = document.getElementById('filter-' + keys[i]);
        if(!el) continue;
        if(keys[i] === key) el.classList.add('active'); else el.classList.remove('active');
      }
    }

    function setReviewFilter(key){ reviewFilter = key; setFilterPillActive(key); buildReview(); }

    function buildReview(){
      var list = document.getElementById('reviewList');
      if(!list) return;
      list.innerHTML = '';

      var sumDone = document.getElementById('sumDone');
      var sumHits = document.getElementById('sumHits');
      var sumMiss = document.getElementById('sumMiss');
      var sumDiss = document.getElementById('sumDiss');

      var done=0,hits=0,miss=0,diss=0;
      var letterIdx = {A:0,B:1,C:2,D:3,E:4};

      for (var i=0;i<state.questions.length;i++){
        var q = state.questions[i];
        var ans = state.answers[q.id];
        if(!ans) continue;
        done++;

        var isD = !!q.dissertativa;
        var status = 'diss';
        if(!isD){
          if(ans === q.gabarito){ status='hit'; hits++; }
          else { status='miss'; miss++; }
        } else diss++;

        if(reviewFilter !== 'all' && reviewFilter !== status) continue;

        var card = document.createElement('div');
        card.className = 'review-card';

        var top = document.createElement('div');
        top.className = 'review-top';

        var badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = '#' + (i+1);

        var st = document.createElement('div');
        st.className = 'status ' + status;
        st.textContent = (status==='hit' ? '✔ Acertou' : (status==='miss' ? '❌ Errou' : '📝 Dissertativa'));

        top.appendChild(badge);
        top.appendChild(st);

        var qText = document.createElement('div');
        qText.className = 'q-text';
        qText.innerHTML = q.pergunta;

        var kvYour = document.createElement('div');
        kvYour.className = 'kv';
        if(isD){
          kvYour.innerHTML = '<strong>Sua resposta:</strong> ' + escapeHtml(ans);
        } else {
          var idxY = (letterIdx[ans] !== undefined) ? letterIdx[ans] : -1;
          var yourTxt = (idxY>=0) ? (q.alternativas[idxY] || '') : '';
          kvYour.innerHTML = '<strong>Sua resposta:</strong> ' + ans + (yourTxt ? (' — ' + escapeHtml(yourTxt)) : '');
        }

        var kvGab = document.createElement('div');
        kvGab.className = 'kv';
        if(isD){
          kvGab.innerHTML = '<strong>Gabarito:</strong> — (dissertativa)';
        } else {
          var idxG = (letterIdx[q.gabarito] !== undefined) ? letterIdx[q.gabarito] : -1;
          var gabTxt = (idxG>=0) ? (q.alternativas[idxG] || '') : '';
          kvGab.innerHTML = '<strong>Gabarito:</strong> ' + q.gabarito + (gabTxt ? (' — ' + escapeHtml(gabTxt)) : '');
        }

        var kvCom = document.createElement('div');
        kvCom.className = 'kv';
        kvCom.innerHTML = '<strong>Comentário:</strong> ' + (q.comentario ? q.comentario : '—');

        var act = document.createElement('div');
        act.className = 'rev-actions';
        var go = document.createElement('button');
        go.className = 'btn-go';
        go.type = 'button';
        go.textContent = 'Ir para a questão';
        (function(idx){
          go.onclick = function(){ closeReview(); goToIdx(idx); };
        })(i);
        act.appendChild(go);

        card.appendChild(top);
        card.appendChild(qText);
        card.appendChild(kvYour);
        card.appendChild(kvGab);
        card.appendChild(kvCom);
        card.appendChild(act);

        list.appendChild(card);
      }

      if(sumDone) sumDone.textContent = done;
      if(sumHits) sumHits.textContent = hits;
      if(sumMiss) sumMiss.textContent = miss;
      if(sumDiss) sumDiss.textContent = diss;
    }

    function exportProgress(){
      if(!state.questions.length){ toast('Carregue questões antes de salvar.'); return; }
      var payload = {
        app:'SQMOCHA',
        version:1,
        savedAt:new Date().toISOString(),
        theme: document.body.getAttribute('data-theme') || 'dark',
        questions: state.questions,
        answers: state.answers,
        currentIndex: state.currentIndex
      };
      var blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sqmocha-save-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
      toast('Progresso salvo em arquivo.');
    }

    function validateProgress(data){
      if(!data || data.app !== 'SQMOCHA' || !Array.isArray(data.questions)) return false;
      var ids = {};
      for (var i=0;i<data.questions.length;i++) ids[data.questions[i].id] = true;
      var ans = data.answers || {};
      for (var k in ans){ if(ans.hasOwnProperty(k) && !ids[k]) return false; }
      return true;
    }

    function restoreFromPayload(data){
      state.questions = Array.isArray(data.questions) ? data.questions : [];
      state.answers = data.answers || {};
      var maxIdx = Math.max(state.questions.length-1,0);
      var idx = parseInt(data.currentIndex || 0, 10);
      if(isNaN(idx)) idx = 0;
      state.currentIndex = Math.min(Math.max(idx,0), maxIdx);

      if(data.theme === 'light' || data.theme === 'dark'){
        document.body.setAttribute('data-theme', data.theme);
        var icon = document.getElementById('themeIcon');
        if(icon) icon.textContent = (data.theme === 'dark') ? '🌙' : '☀️';
      }
      persistLocal();
    }

    function importProgressFile(input){
      var file = input.files && input.files[0];
      try{ input.value=''; }catch(e){}
      if(!file) return;

      var reader = new FileReader();
      reader.onload = function(e){
        try{
          var data = JSON.parse(e.target.result);
          if(!validateProgress(data)){ toast('Arquivo inválido para o SQMOCHA.'); return; }
          if(state.questions.length && Object.keys(state.answers).length){
            if(!confirm('Importar progresso substituirá o estado atual. Continuar?')) return;
          }
          restoreFromPayload(data);
          switchView('quiz');
          render();
          toggleMenu();
          toast('Progresso importado.');
        }catch(err){
          console.error(err);
          toast('Falha ao importar progresso.');
        }
      };
      reader.readAsText(file);
    }

    function persistLocal(){
      try{
        var payload = {
          app:'SQMOCHA', version:1,
          theme: document.body.getAttribute('data-theme') || 'dark',
          questions: state.questions,
          answers: state.answers,
          currentIndex: state.currentIndex,
          savedAt: Date.now()
        };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
      }catch(e){}
    }

    function restoreLocalIfAny(){
      try{
        var raw = localStorage.getItem(LS_KEY);
        if(!raw) return false;
        var data = JSON.parse(raw);
        if(!validateProgress(data)) return false;
        restoreFromPayload(data);
        render();
        toast('Progresso local restaurado.');
        return true;
      }catch(e){ return false; }
    }

    function resetQuiz(){
      if(confirm('Tem certeza que deseja reiniciar seu progresso local? Todas as respostas serão perdidas.')){
        state.answers = {};
        state.currentIndex = 0;
        persistLocal();
        render();
        toast('Progresso reiniciado.');
        toggleMenu();
      }
    }

    /* ========== BANCO DE QUESTÕES ========== */
    function openLibrary() {
      switchView('library');
      loadLibrary();
      if (document.getElementById('sidebar').classList.contains('open')) toggleMenu();
    }

    function closeLibrary() {
      switchView('quiz');
    }

    function loadLibrary() {
      const container = document.getElementById('libraryList');
      if (!container) return;
      container.innerHTML = '<div class="loading">Carregando banco de questões...</div>';

      fetch('data/index.json')
        .then(res => {
          if (!res.ok) throw new Error('Arquivo index.json não encontrado');
          return res.json();
        })
        .then(manifests => {
          if (!manifests.length) throw new Error('Nenhum conjunto cadastrado');
          renderLibrary(manifests);
        })
        .catch(err => {
          console.warn(err);
          container.innerHTML = `
            <div class="error-library">
              <p>⚠️ Não foi possível localizar a lista de questões na pasta <strong>data/</strong>.</p>
              <p>Certifique-se de que o arquivo <code>data/index.json</code> existe e contém os conjuntos disponíveis.</p>
              <button class="btn-primary" onclick="loadLibrary()">Tentar novamente</button>
            </div>
          `;
        });
    }

    function renderLibrary(manifests) {
      const container = document.getElementById('libraryList');
      if (!container) return;
      container.innerHTML = '';

      manifests.forEach(item => {
        const card = document.createElement('div');
        card.className = 'library-card';

        card.innerHTML = `
          <div class="library-card-header">
            <span class="library-badge">${item.type.toUpperCase()}</span>
            <span class="library-name">${escapeHtml(item.name)}</span>
          </div>
          <div class="library-desc">${escapeHtml(item.description || 'Sem descrição')}</div>
          <div class="library-file">📄 ${escapeHtml(item.file)}</div>
          <button class="btn-go load-this" data-file="${escapeHtml(item.file)}" data-type="${escapeHtml(item.type)}">Carregar questões</button>
        `;

        const btn = card.querySelector('.load-this');
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          loadQuestionSet(btn.dataset.file, btn.dataset.type);
        });

        container.appendChild(card);
      });
    }

    function loadQuestionSet(file, type) {
      const fullPath = `data/${file}`;
      fetch(fullPath)
        .then(res => {
          if (!res.ok) throw new Error(`Erro ao carregar ${file}`);
          if (type === 'json') return res.json();
          if (type === 'csv') return res.text();
          throw new Error('Tipo desconhecido');
        })
        .then(data => {
          let newQuestions = [];
          if (type === 'json') {
            newQuestions = data;
          } else if (type === 'csv') {
            newQuestions = parseCSVSmart(data);
          }
          if (!newQuestions.length) throw new Error('Nenhuma questão encontrada no arquivo');

          if (state.questions.length && Object.keys(state.answers).length) {
            if (!confirm(`Carregar "${file}" substituirá o progresso atual. Deseja continuar?`)) return;
          }

          state.questions = newQuestions;
          state.currentIndex = 0;
          state.answers = {};
          persistLocal();
          render();
          switchView('quiz');
          toast(`Banco "${file}" carregado com ${state.questions.length} questões.`);
        })
        .catch(err => {
          console.error(err);
          toast(`Falha ao carregar ${file}: ${err.message}`);
        });
    }

    document.addEventListener('keydown', function(e){
      var t = e.target;
      var inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if(inField) return;

      if(e.key === 'ArrowLeft'){ e.preventDefault(); changeQ(-1); }
      if(e.key === 'ArrowRight'){ e.preventDefault(); changeQ(1); }
      if(String(e.key).toLowerCase() === 'r'){ e.preventDefault(); openReview(); }
      if(String(e.key).toLowerCase() === 'q'){ e.preventDefault(); closeReview(); }
      if((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'i'){ e.preventDefault(); importCode(); }
      if((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.key).toLowerCase() === 'r'){ e.preventDefault(); resetQuiz(); }
    }, {passive:false});

    document.addEventListener('DOMContentLoaded', function(){
      initTheme();
      try{ setAccordionOpen('acc-import', false); }catch(e){}
      try{ setAccordionOpen('acc-tools', false); }catch(e){}
      try{ setAccordionOpen('acc-review', false); }catch(e){}
      try{ setAccordionOpen('acc-library', true); }catch(e){}
      setFilterPillActive('all');
      var restored = restoreLocalIfAny();
      if(!restored){ toast('Dica: use “Salvar Progresso” para exportar um arquivo.'); }

      initZoomEvents();
    });

    window.addEventListener('resize', function(){
      ['acc-import','acc-tools','acc-review','acc-library'].forEach(function(id){
        var el = document.getElementById(id);
        if(el && el.style.maxHeight) el.style.maxHeight = el.scrollHeight + 'px';
      });
    });

window.addEventListener('DOMContentLoaded', function(){
  try{
    if(state.questions && state.questions.length) return;
    if(location.protocol === 'file:') return;
    fetch('data/sq.json')
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(arr){
        if(Array.isArray(arr) && arr.length){
          state.questions = arr;
          state.currentIndex = 0;
          state.answers = {};
          render();
          toast('Questões carregadas automaticamente.');
        }
      })
      .catch(function(){});
  }catch(e){}
});