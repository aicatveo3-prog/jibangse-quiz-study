/* 지방세 OX 퀴즈 — 독립 실행 정적 사이트 (다장 구조)
 * 챕터 목록은 chapters.js(window.CHAPTER_LIST), 장별 데이터는 quizdata-chNN.js가
 * window.QUIZ_CHAPTERS[id] = { data, theory, checklist } 로 등록하며 지연 로딩된다. */
(function () {
  "use strict";

  var STORAGE_KEY = "jibangse_theoryOn";      // 이론 토글 (전역 공통)
  var LAST_CH_KEY = "jibangse_last_chapter";  // 마지막으로 학습한 챕터 id
  var WRONG_KEY = "jibangse_wrong_v1";        // 오답노트 (전 챕터 공통, 스냅샷 저장)
  var SAVED_KEY = "jibangse_saved_v1";        // 저장함/북마크 (전 챕터 공통, 스냅샷 저장)
  function sessionKey() { return "jibangse_session_" + state.chapterId; }   // 챕터별 진행 상태
  function checkKey() { return "jibangse_checklist_" + state.chapterId; }   // 챕터별 체크리스트

  // ---- state ---------------------------------------------------------------
  var state = {
    screen: "home",   // home | toc | quiz | result | checklist
    chapterId: null,  // 현재 챕터 id (예: "ch01")
    partIndex: 0,
    answers: [],
    theoryOn: (function () {
      try {
        var v = localStorage.getItem(STORAGE_KEY);
        if (v != null) return v === "1";
      } catch (e) {}
      return true;
    })()
  };

  // 복습(오답노트/저장함) 전용 상태 — 챕터 데이터와 독립적으로 스냅샷을 풀이한다.
  var review = {
    tab: "wrong",   // 목록 화면 탭: wrong | saved
    mode: "wrong",  // 풀이 중인 세트: wrong | saved
    items: [],      // 풀이 대상 스냅샷 레코드 배열
    answers: []     // items 와 같은 길이, "O"|"X"|null
  };

  var root = document.getElementById("app");
  var lastNavKey = null;

  // ---- data accessors ------------------------------------------------------
  function chapters() { return window.CHAPTER_LIST || []; }
  function chapterMeta(id) {
    var m = null;
    chapters().forEach(function (c) { if (c.id === (id || state.chapterId)) m = c; });
    return m;
  }
  function chapterTitle() { var m = chapterMeta(); return m ? m.title : ""; }
  function currentChapter() { return (window.QUIZ_CHAPTERS || {})[state.chapterId] || null; }
  function data() { var c = currentChapter(); return (c && c.data) || []; }
  function theoryList() { var c = currentChapter(); return (c && c.theory) || []; }
  function chapterChecklist() { var c = currentChapter(); return (c && c.checklist) || null; }

  // 챕터 데이터 파일 지연 로딩 — 로드 완료 후 cb(성공 여부) 호출
  function loadChapter(id, cb) {
    if ((window.QUIZ_CHAPTERS || {})[id]) { cb(true); return; }
    var meta = chapterMeta(id);
    if (!meta) { cb(false); return; }
    var s = document.createElement("script");
    s.src = meta.file + (window.ASSET_VER ? "?v=" + window.ASSET_VER : "");
    s.onload = function () { cb(!!(window.QUIZ_CHAPTERS || {})[id]); };
    s.onerror = function () { cb(false); };
    document.body.appendChild(s);
  }

  // ---- helpers -------------------------------------------------------------
  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function label(a) { return a === "O" ? "O" : "X"; }

  // 문장 단위 줄바꿈 — 원본 breakSentences 와 동일 (white-space:pre-line 로 렌더)
  function breakSentences(text) {
    if (!text) return text || "";
    return text.replace(/([.!?✓])\s+/g, "$1\n");
  }

  // 이론 본문용 절제형 줄바꿈: 한글 문장이 끝나는 지점에서만 줄을 나누되,
  // 짧은 문장은 앞 줄에 붙여 지나친 조각화를 막는다 (white-space:pre-line 로 렌더).
  function brkPara(text) {
    if (!text || text.length < 55) return text || "";
    var marked = text.replace(/([가-힣"”』」)\]][.?!])\s+/g, "$1\n");
    var segs = marked.split("\n");
    var lines = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (lines.length && s.length < 15) lines[lines.length - 1] += " " + s;
      else lines.push(s);
    }
    return lines.join("\n");
  }

  function splitPartName(name) {
    var m = name.match(/^(PART\s*\d+)\.\s*(.*)$/);
    if (m) return { label: m[1], title: m[2] };
    return { label: "", title: name };
  }

  function parts() {
    var groups = [];
    data().forEach(function (q, i) {
      var g = null;
      for (var k = 0; k < groups.length; k++) if (groups[k].name === q.part) { g = groups[k]; break; }
      if (!g) { g = { name: q.part, items: [] }; groups.push(g); }
      var item = { gi: i };
      for (var key in q) item[key] = q[key];
      g.items.push(item);
    });
    return groups;
  }

  function freshAnswers() {
    var a = new Array(data().length);
    for (var i = 0; i < a.length; i++) a[i] = null;
    return a;
  }

  // ---- 진행 상태 저장/복원 -------------------------------------------------
  // 모바일에서 앱을 껐다 켜면(페이지 새로고침) 초기화되던 문제 해결:
  // 화면·파트·푼 답을 챕터별 localStorage 키에 저장하고 재실행 시 그대로 복원한다.
  function saveSession() {
    // 복습·로그인 화면은 특정 챕터에 속하지 않으므로 챕터 세션에 기록하지 않는다
    // (기록하면 챕터 진행 상태가 오염된다).
    if (state.screen === "review" || state.screen === "reviewQuiz" || state.screen === "login") return;
    if (!state.chapterId || !data().length) return; // 챕터 미선택·데이터 로딩 전에는 저장하지 않는다
    try {
      localStorage.setItem(sessionKey(), JSON.stringify({
        screen: state.screen,
        partIndex: state.partIndex,
        answers: state.answers
      }));
      localStorage.setItem(LAST_CH_KEY, state.chapterId);
    } catch (e) {}
  }

  // 저장본을 검증해 복원 가능한 값이면 반환, 아니면 null.
  // (문항 수가 바뀐 옛 저장본 등은 폐기하여 불일치를 방지한다.)
  function loadSession() {
    try {
      var raw = localStorage.getItem(sessionKey());
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== "object") return null;
      var validScreens = { home: 1, toc: 1, quiz: 1, result: 1, checklist: 1 };
      if (!validScreens[s.screen]) return null;
      if (!Array.isArray(s.answers) || s.answers.length !== data().length) return null;
      var pCount = parts().length;
      var pIdx = typeof s.partIndex === "number" ? s.partIndex : 0;
      if (pIdx < 0 || pIdx >= pCount) pIdx = 0;
      var ans = s.answers.map(function (a) { return a === "O" || a === "X" ? a : null; });
      return { screen: s.screen, partIndex: pIdx, answers: ans };
    } catch (e) { return null; }
  }

  // 단일 챕터 시절(v1) 저장본을 ch01 키로 1회 이관한다.
  function migrateV1() {
    try {
      if (!localStorage.getItem("jibangse_session_ch01") && localStorage.getItem("jibangse_session_v1")) {
        localStorage.setItem("jibangse_session_ch01", localStorage.getItem("jibangse_session_v1"));
        if (!localStorage.getItem(LAST_CH_KEY)) localStorage.setItem(LAST_CH_KEY, "ch01");
      }
      if (!localStorage.getItem("jibangse_checklist_ch01") && localStorage.getItem("jibangse_checklist_v1")) {
        localStorage.setItem("jibangse_checklist_ch01", localStorage.getItem("jibangse_checklist_v1"));
      }
    } catch (e) {}
  }

  // ---- 오답노트 / 저장함 (스냅샷 저장소) -----------------------------------
  // 문제를 index 가 아니라 "본문 해시 기반 id"로 식별해 자료가 수정·재배열돼도
  // 기록이 살아남게 한다. 레코드에 본문·정답·해설을 스냅샷으로 담아 챕터 데이터를
  // 로드하지 않고도 복습 목록·풀이를 그릴 수 있다.
  function hashStr(s) {
    var h = 5381, i = (s || "").length;
    while (i) h = (h * 33) ^ (s || "").charCodeAt(--i);
    return (h >>> 0).toString(36);
  }
  function noteId(chId, text) { return (chId || "?") + "-" + hashStr(text); }

  function loadNotes(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (r) { return r && r.id && r.text; }) : [];
    } catch (e) { return []; }
  }
  function saveNotes(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    if (window.QUIZ_SYNC && window.QUIZ_SYNC.onLocalChange) window.QUIZ_SYNC.onLocalChange();
  }
  function notesHas(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return true;
    return false;
  }

  // 현재 챕터의 gi 문항으로 스냅샷 레코드를 만든다.
  function buildRecord(gi) {
    var q = data()[gi];
    if (!q) return null;
    var m = chapterMeta();
    return {
      id: noteId(state.chapterId, q.text),
      chId: state.chapterId,
      chNum: m ? m.num : 0,
      chTitle: m ? m.title : "",
      part: q.part || "",
      text: q.text,
      answer: q.answer,
      exp: q.exp || "",
      ts: Date.now()
    };
  }

  function addWrong(rec) {
    if (!rec) return;
    var arr = loadNotes(WRONG_KEY);
    if (notesHas(arr, rec.id)) return;
    arr.push(rec);
    saveNotes(WRONG_KEY, arr);
  }
  function removeWrong(id) {
    var arr = loadNotes(WRONG_KEY).filter(function (r) { return r.id !== id; });
    saveNotes(WRONG_KEY, arr);
  }
  function isSaved(id) { return notesHas(loadNotes(SAVED_KEY), id); }
  // 북마크 토글 → 새 상태(true=저장됨) 반환
  function toggleSaved(rec) {
    if (!rec) return false;
    var arr = loadNotes(SAVED_KEY);
    if (notesHas(arr, rec.id)) {
      saveNotes(SAVED_KEY, arr.filter(function (r) { return r.id !== rec.id; }));
      return false;
    }
    arr.push(rec);
    saveNotes(SAVED_KEY, arr);
    return true;
  }

  // 스냅샷 배열을 챕터별로 묶어 [{ chNum, chTitle, items:[] }] 로 (챕터 번호순) 반환
  function groupByChapter(arr) {
    var map = {};
    arr.forEach(function (r) {
      var k = r.chId || "?";
      if (!map[k]) map[k] = { chId: k, chNum: r.chNum || 0, chTitle: r.chTitle || "", items: [] };
      map[k].items.push(r);
    });
    var groups = [];
    for (var k in map) groups.push(map[k]);
    groups.sort(function (a, b) { return (a.chNum || 0) - (b.chNum || 0); });
    return groups;
  }

  // ---- theory block renderer (port of processBlocks) -----------------------
  var NOTE_MAP = {
    ex:   { bg: "#F4F5F8", bd: "#E4E7EE", tc: "#454B59", ttc: "#454B59" },
    box:  { bg: "#F1EFFE", bd: "#D9D2F7", tc: "#3A3170", ttc: "#4F46E5" },
    warn: { bg: "#FEF3F0", bd: "#F6D6C9", tc: "#9A3412", ttc: "#9A3412" },
    tip:  { bg: "#FFF7EA", bd: "#F4E2C2", tc: "#7A4E08", ttc: "#92500A" }
  };
  var SYMS = ["⭕", "❌", "✅", "⬆️", "⬇️", ""];

  function renderBlock(b) {
    if (b.k === "sec") {
      return '<div style="font-size:14.5px;font-weight:800;color:#312A6B;margin-top:5px;padding-bottom:4px;border-bottom:2px solid #E7E3F3;word-break:keep-all;">' + esc(b.t) + '</div>';
    }
    if (b.k === "sub") {
      return '<div style="font-size:13px;font-weight:800;color:#4F46E5;margin-top:3px;word-break:keep-all;">' + esc(b.t) + '</div>';
    }
    if (b.k === "lead") {
      return '<div style="font-size:13.5px;font-weight:700;color:#312A6B;background:#F1EFFE;border:1px solid #DDD7F7;border-radius:10px;padding:11px 13px;line-height:1.6;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(brkPara(b.t)) + '</div>';
    }
    if (b.k === "tree") {
      return '<div style="background:#F3F2FA;border:1px solid #E3E0F2;border-radius:10px;padding:11px 12px;overflow-x:auto;">' +
        '<pre style="margin:0;font-family:\'D2Coding\',\'Menlo\',\'Consolas\',monospace;font-size:11.5px;line-height:1.75;color:#2C3140;white-space:pre;">' + esc(b.t) + '</pre></div>';
    }
    if (b.k === "note") {
      var m = NOTE_MAP[b.v] || NOTE_MAP.ex;
      var html = '<div style="background:' + m.bg + ';border:1px solid ' + m.bd + ';border-radius:10px;padding:10px 12px;">';
      if (b.title) {
        html += '<div style="font-size:12.5px;font-weight:800;color:' + m.ttc + ';margin-bottom:6px;word-break:keep-all;text-wrap:pretty;">' + esc(b.title) + '</div>';
      }
      if (b.t) {
        html += '<div style="font-size:12.5px;font-weight:600;color:' + m.tc + ';line-height:1.6;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(brkPara(b.t)) + '</div>';
      }
      if (b.list && b.list.length) {
        var listStyle = "display:flex;flex-direction:column;gap:6px;" + (b.title || b.t ? " margin-top:6px;" : "");
        html += '<div style="' + listStyle + '">';
        b.list.forEach(function (li) {
          html += '<div style="display:flex;gap:7px;font-size:12.5px;font-weight:600;color:' + m.tc + ';line-height:1.55;word-break:keep-all;text-wrap:pretty;">' +
            '<span style="flex-shrink:0;color:' + m.ttc + ';font-weight:800;">•</span>' +
            '<span style="flex:1;min-width:0;">' + esc(li) + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    }
    if (b.k === "table") {
      var firstRow = (b.rows && b.rows[0]) || [];
      var nc = (b.head && b.head.length) || firstRow.length;
      var gridCols;
      if (nc <= 1) {
        gridCols = "minmax(0,1fr)";
      } else if (nc === 2) {
        gridCols = "minmax(0,0.92fr) minmax(0,1.55fr)";
      } else {
        gridCols = "minmax(0,0.8fr)";
        for (var i = 1; i < nc; i++) gridCols += " minmax(0,1fr)";
      }
      var cellBase = "padding:9px 11px;font-size:12px;line-height:1.5;word-break:keep-all;text-wrap:pretty;display:flex;align-items:center;";
      var allRows = [];
      if (b.head && b.head.length) allRows.push({ head: true, cells: b.head });
      (b.rows || []).forEach(function (r) { allRows.push({ head: false, cells: r }); });

      var out = '<div style="border:1px solid #E7E3F3;border-radius:11px;overflow:hidden;background:#fff;">';
      allRows.forEach(function (r, ri) {
        var isLastRow = ri === allRows.length - 1;
        var rs = "display:grid;grid-template-columns:" + gridCols + ";";
        if (!isLastRow) rs += " border-bottom:1px solid #ECE9F6;";
        out += '<div style="' + rs + '">';
        r.cells.forEach(function (c, ci) {
          var isLastCol = ci === r.cells.length - 1;
          var isSym = SYMS.indexOf(c) !== -1;
          var s = cellBase;
          if (r.head) s += " background:#EEEAFB;font-weight:800;color:#312A6B;";
          else if (ci === 0) s += " background:#FAF9FE;font-weight:700;color:#1F2430;";
          else s += " color:#3A4150;";
          if (!isLastCol) s += " border-right:1px solid #EFECF8;";
          if (isSym) s += " justify-content:center;font-size:14px;";
          // 방향 화살표(⬆️/⬇️)는 이모지가 모두 같은 파란색이라 구분이 어렵다.
          // 색상 글리프로 치환: 위=파랑 ▲, 아래=빨강 ▼. 특히 아래 화살표는
          // 빨간 배지로 감싸 한눈에 구분되도록 강조한다.
          var glyph = null;
          if (c && c.charCodeAt(0) === 0x2b06) glyph = '<span style="color:#2563EB;font-size:15px;font-weight:800;line-height:1;">▲</span>';
          else if (c && c.charCodeAt(0) === 0x2b07) glyph = '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:#FDE8E8;color:#DC2626;font-size:15px;font-weight:800;line-height:1;">▼</span>';
          out += '<div style="' + s + '">' + (glyph || esc(c)) + '</div>';
        });
        out += '</div>';
      });
      out += '</div>';
      return out;
    }
    // default: paragraph
    return '<div style="font-size:13px;color:#353B47;line-height:1.68;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(brkPara(b.t)) + '</div>';
  }

  function renderTheoryBody(theory) {
    var hasBlocks = !!(theory.blocks && theory.blocks.length);
    if (hasBlocks) {
      var inner = theory.blocks.map(renderBlock).join("");
      return '<div style="display:flex;flex-direction:column;gap:11px;">' + inner + '</div>';
    }
    // fallback (summary / points / easy) — parity with original noBlocks branch
    var html = "";
    html += '<div style="font-size:14px;color:#4A4170;background:#F7F6FD;border-radius:10px;padding:11px 13px;line-height:1.6;font-weight:600;margin-bottom:12px;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(breakSentences(theory.summary || "")) + '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:9px;">';
    (theory.points || []).forEach(function (pt, i) {
      html += '<div style="display:flex;gap:9px;">' +
        '<div style="flex-shrink:0;width:19px;height:19px;border-radius:6px;background:#EDEAFB;color:#4F46E5;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:2px;">' + (i + 1) + '</div>' +
        '<div style="font-size:14px;color:#2C3140;line-height:1.55;word-break:keep-all;text-wrap:pretty;white-space:pre-line;"><b style="color:#1A1D24;">' + esc(pt.term) + '</b> · ' + esc(breakSentences(pt.text)) + '</div></div>';
    });
    html += '</div>';
    if (theory.easy) {
      html += '<div style="margin-top:12px;background:#FFF7EA;border:1px solid #F4E2C2;border-radius:10px;padding:11px 13px;">' +
        '<div style="font-size:13px;font-weight:800;color:#B45309;margin-bottom:6px;">💡 쉬운 설명</div>' +
        '<div style="font-size:14px;color:#4A4032;line-height:1.65;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(breakSentences(theory.easy)) + '</div></div>';
    }
    return html;
  }

  // ---- screen renderers ----------------------------------------------------
  // 챕터별 저장 진행 상태를 (챕터 데이터를 로드하지 않고도) localStorage 에서 읽는다.
  function savedProgress(chId) {
    try {
      var raw = localStorage.getItem("jibangse_session_" + chId);
      if (!raw) return 0;
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.answers)) return 0;
      return s.answers.filter(function (a) { return a === "O" || a === "X"; }).length;
    } catch (e) { return 0; }
  }

  function renderHome() {
    var cards = chapters().map(function (ch) {
      var total = ch.count || 0;
      var answered = savedProgress(ch.id);
      if (answered > total) answered = total;
      var pct = total ? Math.round((answered / total) * 100) : 0;
      return '<button data-action="enterChapter" data-arg="' + ch.id + '" class="a-scale985" style="width:100%;text-align:left;border:none;cursor:pointer;background:#FFFFFF;border-radius:20px;padding:20px;box-shadow:0 6px 20px rgba(30,40,70,.06);display:flex;flex-direction:column;gap:16px;font-family:inherit;margin-bottom:12px;">' +
        '<div style="display:flex;align-items:flex-start;gap:14px;">' +
          '<div style="width:46px;height:46px;border-radius:14px;background:#4F46E5;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;">' + ch.num + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:15.5px;font-weight:700;line-height:1.35;color:#1A1D24;">' + esc(ch.title) + '</div>' +
            '<div style="font-size:13px;color:#5C6473;margin-top:4px;">' + total + '문제 · O/X</div>' +
          '</div>' +
          '<div style="color:#C2C8D4;font-size:22px;align-self:center;">›</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="flex:1;height:6px;background:#ECEFF4;border-radius:99px;overflow:hidden;">' +
            '<div style="height:100%;background:#4F46E5;border-radius:99px;width:' + pct + '%;"></div>' +
          '</div>' +
          '<div style="font-size:12px;font-weight:700;color:#AEB5C4;flex-shrink:0;">' + answered + ' / ' + total + '</div>' +
        '</div>' +
      '</button>';
    }).join("");

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:56px 24px 28px;position:relative;">' +
        renderAccountChip() +
        '<div style="font-size:13px;font-weight:600;letter-spacing:.04em;color:#5C6473;">학습 퀴즈</div>' +
        '<div style="font-size:22px;font-weight:800;margin-top:8px;line-height:1.3;">지방세법</div>' +
        '<div style="font-size:14px;color:#434A59;margin-top:6px;">O/X 문제로 핵심 개념을 빠르게 점검해요</div>' +
      '</div>' +
      '<div style="padding:0 16px 8px;">' + reviewHomeCard() + '</div>' +
      '<div style="padding:0 16px 24px;">' +
        '<div style="font-size:12px;font-weight:700;color:#6E7585;letter-spacing:.03em;padding:0 8px 10px;">목록</div>' +
        cards +
      '</div>' +
      '<div style="margin-top:auto;padding:16px 24px 28px;text-align:center;font-size:12px;color:#B4BAC8;">탭하여 문제 풀기를 시작하세요</div>' +
    '</div>';
  }

  // 홈 상단 "복습 노트" 카드 — 오답노트/저장함 진입점 + 개수 표시 (슬림 버전).
  function reviewHomeCard() {
    var nWrong = loadNotes(WRONG_KEY).length;
    var nSaved = loadNotes(SAVED_KEY).length;
    return '<button data-action="openReview" data-arg="wrong" class="a-scale985" style="width:100%;text-align:left;border:none;cursor:pointer;background:linear-gradient(135deg,#4F46E5,#6D63F2);border-radius:14px;padding:11px 14px;box-shadow:0 5px 14px rgba(79,70,229,.20);display:flex;align-items:center;gap:11px;font-family:inherit;margin-bottom:12px;">' +
      '<div style="width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.18);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;">📌</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13.5px;font-weight:800;color:#fff;">복습 노트</div>' +
        '<div style="font-size:11.5px;color:#DCD9FB;margin-top:2px;">오답 ' + nWrong + ' · 저장 ' + nSaved + '</div>' +
      '</div>' +
      '<div style="color:rgba(255,255,255,.7);font-size:18px;">›</div>' +
    '</button>';
  }

  // 우상단 계정 칩 — sync.js 설정 시에만 노출. 로그인 전=로그인 버튼, 로그인 후=계정 표시(탭→로그아웃).
  function renderAccountChip() {
    var sync = window.QUIZ_SYNC;
    if (!sync || !sync.configured || !sync.configured()) return "";
    var base = "position:absolute;top:52px;right:20px;height:32px;display:inline-flex;align-items:center;border-radius:16px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;box-shadow:0 3px 10px rgba(30,40,70,.10);";
    var user = sync.currentUser && sync.currentUser();
    if (user) {
      var initial = ((user.email || user.name || "?").charAt(0) || "?").toUpperCase();
      return '<button data-action="signOut" class="a-scale98" title="' + esc(user.email || "로그인됨") + '" style="' + base + 'gap:6px;padding:0 11px 0 4px;border:1px solid #DDE3EF;background:#fff;color:#15803D;">' +
        '<span style="width:24px;height:24px;border-radius:50%;background:#E8F8EF;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#15803D;">' + esc(initial) + '</span>' +
        '<span style="width:7px;height:7px;border-radius:50%;background:#22C55E;"></span>' +
      '</button>';
    }
    return '<button data-action="openLogin" class="a-scale98" style="' + base + 'gap:5px;padding:0 13px;border:1px solid #DDE3EF;background:#fff;color:#312A6B;">' +
      '<span style="font-size:14px;">☁️</span>로그인</button>';
  }

  function renderToc() {
    var ps = parts();
    var total = data().length;
    var totalAnswered = state.answers.filter(function (a) { return a != null; }).length;

    var items = ps.map(function (p, i) {
      var count = p.items.length;
      var done = p.items.filter(function (it) { return state.answers[it.gi] != null; }).length;
      var split = splitPartName(p.name);
      var pct = count ? Math.round((done / count) * 100) : 0;
      var status = done >= count ? "done" : (done > 0 ? "active" : "todo");

      var chip;
      if (status === "done") chip = '<div style="width:30px;height:30px;border-radius:9px;background:#E8F8EF;color:#15803D;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i + 1) + '</div>';
      else if (status === "active") chip = '<div style="width:30px;height:30px;border-radius:9px;background:#4F46E5;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i + 1) + '</div>';
      else chip = '<div style="width:30px;height:30px;border-radius:9px;background:#EEF1F6;color:#5A6172;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i + 1) + '</div>';

      var trail;
      if (status === "done") trail = '<span style="color:#15803D;font-size:14px;flex-shrink:0;">✓</span>';
      else if (status === "active") trail = '<span style="color:#4F46E5;font-size:18px;flex-shrink:0;">›</span>';
      else trail = '<span style="color:#C2C8D4;font-size:18px;flex-shrink:0;">›</span>';

      return '<button data-action="openPart" data-arg="' + i + '" class="a-scale99" style="width:100%;text-align:left;border:none;cursor:pointer;display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:13px 14px;margin-bottom:8px;box-shadow:0 2px 8px rgba(30,40,70,.04);font-family:inherit;">' +
        chip +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13.5px;font-weight:700;color:#1A1D24;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(split.title) + '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
            '<div style="flex:1;height:4px;background:#ECEFF4;border-radius:99px;overflow:hidden;"><div style="height:100%;background:#4F46E5;border-radius:99px;width:' + pct + '%;"></div></div>' +
            '<div style="font-size:10.5px;font-weight:700;color:#AEB5C4;flex-shrink:0;">' + done + ' / ' + count + '</div>' +
          '</div>' +
        '</div>' +
        trail +
      '</button>';
    }).join("");

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:20px 20px 14px;flex-shrink:0;position:sticky;top:0;background:#F7F8FB;z-index:5;">' +
        '<button data-action="goHome" style="border:none;background:transparent;padding:0;display:flex;align-items:center;gap:6px;color:#5C6473;font-size:12.5px;cursor:pointer;font-family:inherit;">‹ 목록</button>' +
        '<div style="font-size:18px;font-weight:800;margin-top:12px;color:#1A1D24;">' + esc(chapterTitle()) + '</div>' +
        '<div style="font-size:12.5px;color:#5C6473;margin-top:4px;">총 ' + ps.length + '개 파트 · ' + total + '문제 · ' + totalAnswered + '문제 완료</div>' +
      '</div>' +
      '<div style="flex:1;padding:2px 14px 14px;">' + renderChecklistCard() + items + '</div>' +
      '<div style="padding:12px 18px 22px;position:sticky;bottom:0;background:linear-gradient(to top,#F7F8FB 72%,transparent);">' +
        '<button data-action="showResult" class="a-scale99" style="width:100%;border:1.5px solid #DDE3EF;background:#fff;color:#5A6172;font-size:14.5px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;">전체 결과 보기</button>' +
      '</div>' +
    '</div>';
  }

  // ⭐ 최종 암기 체크리스트 — 파트 목록 상단 카드 + 전용 화면
  // 항목을 탭하면 "암기 완료" 체크되고 localStorage 에 저장된다.
    function checklistItems() {
    var cl = chapterChecklist();
    if (!cl || !cl.groups) return [];
    var out = [];
    cl.groups.forEach(function (g) { g.items.forEach(function (it) { out.push(it); }); });
    return out;
  }

  function loadChecks() {
    var total = checklistItems().length;
    try {
      var raw = localStorage.getItem(checkKey());
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length === total) return arr.map(function (v) { return v ? 1 : 0; });
      }
    } catch (e) {}
    var fresh = [];
    for (var i = 0; i < total; i++) fresh.push(0);
    return fresh;
  }

  function saveChecks(arr) {
    try { localStorage.setItem(checkKey(), JSON.stringify(arr)); } catch (e) {}
  }

  function renderChecklistCard() {
    if (!chapterChecklist()) return "";
    var checks = loadChecks();
    var done = checks.filter(Boolean).length;
    var total = checks.length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    return '<button data-action="openChecklist" class="a-scale99" style="width:100%;text-align:left;border:1.5px solid #F4E2C2;cursor:pointer;display:flex;align-items:center;gap:12px;background:#FFF9EF;border-radius:14px;padding:13px 14px;margin-bottom:12px;box-shadow:0 2px 8px rgba(30,40,70,.04);font-family:inherit;">' +
      '<div style="width:30px;height:30px;border-radius:9px;background:#FDEEC8;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">⭐</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13.5px;font-weight:800;color:#7A4E08;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">최종 암기 체크리스트</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
          '<div style="flex:1;height:4px;background:#F4E2C2;border-radius:99px;overflow:hidden;"><div style="height:100%;background:#D97706;border-radius:99px;width:' + pct + '%;"></div></div>' +
          '<div style="font-size:10.5px;font-weight:700;color:#B08A3E;flex-shrink:0;">암기 ' + done + ' / ' + total + '</div>' +
        '</div>' +
      '</div>' +
      '<span style="color:#D9B96E;font-size:18px;flex-shrink:0;">›</span>' +
    '</button>';
  }

  // 한 항목 카드 HTML — 체크 토글 시 이 카드만 교체해 깜빡임·스크롤 이동을 피한다.
  function checklistItemHTML(it, idx, checked) {
    var box = checked
      ? '<div style="width:22px;height:22px;border-radius:7px;background:#15803D;color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">✓</div>'
      : '<div style="width:22px;height:22px;border-radius:7px;border:1.5px solid #D5DBE7;background:#fff;flex-shrink:0;margin-top:1px;"></div>';
    return '<button id="cl-' + idx + '" data-action="toggleCheck" data-arg="' + idx + '" class="a-scale99" style="width:100%;text-align:left;border:none;cursor:pointer;display:flex;gap:11px;background:#fff;border-radius:13px;padding:12px 13px;box-shadow:0 2px 8px rgba(30,40,70,.04);font-family:inherit;' + (checked ? 'opacity:.45;' : '') + '">' +
      box +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13.5px;font-weight:800;color:#1A1D24;word-break:keep-all;' + (checked ? 'text-decoration:line-through;text-decoration-color:#9AA1B0;' : '') + '">' + esc(it.key) + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:7px;font-size:12.5px;line-height:1.55;word-break:keep-all;text-wrap:pretty;">' +
          '<span style="flex-shrink:0;font-weight:800;color:#15803D;">⭕</span>' +
          '<span style="flex:1;min-width:0;color:#1F5132;font-weight:600;">' + esc(it.o) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:4px;font-size:12.5px;line-height:1.55;word-break:keep-all;text-wrap:pretty;">' +
          '<span style="flex-shrink:0;font-weight:800;color:#DC2626;">❌</span>' +
          '<span style="flex:1;min-width:0;color:#8C3A2B;font-weight:600;">' + esc(it.x) + '</span>' +
        '</div>' +
      '</div>' +
    '</button>';
  }

  function renderChecklist() {
    var cl = chapterChecklist() || { groups: [] };
    var checks = loadChecks();
    var done = checks.filter(Boolean).length;
    var total = checks.length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    var body = "";
    if (cl.lead) {
      body += '<div style="font-size:13px;font-weight:700;color:#312A6B;background:#F1EFFE;border:1px solid #DDD7F7;border-radius:10px;padding:11px 13px;line-height:1.6;word-break:keep-all;text-wrap:pretty;margin-bottom:14px;">' + esc(cl.lead) + '</div>';
    }
    var idx = 0;
    (cl.groups || []).forEach(function (g) {
      body += '<div style="font-size:12.5px;font-weight:800;color:#4F46E5;margin:16px 2px 8px;word-break:keep-all;">' + esc(g.title) + '</div>';
      body += '<div style="display:flex;flex-direction:column;gap:8px;">';
      g.items.forEach(function (it) {
        body += checklistItemHTML(it, idx, !!checks[idx]);
        idx++;
      });
      body += '</div>';
    });

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:20px 20px 12px;flex-shrink:0;position:sticky;top:0;background:#F7F8FB;z-index:5;box-shadow:0 6px 12px -10px rgba(30,40,70,.15);">' +
        '<button data-action="goToc" style="border:none;background:transparent;padding:0;display:flex;align-items:center;gap:6px;color:#5C6473;font-size:12.5px;cursor:pointer;font-family:inherit;">‹ 파트 목록</button>' +
        '<div style="font-size:18px;font-weight:800;margin-top:12px;color:#1A1D24;">⭐ 최종 암기 체크리스트</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:9px;">' +
          '<div style="flex:1;height:5px;background:#ECEFF4;border-radius:99px;overflow:hidden;"><div id="cl-pbar" style="height:100%;background:#15803D;border-radius:99px;width:' + pct + '%;transition:width .25s;"></div></div>' +
          '<div id="cl-count" style="font-size:11.5px;font-weight:800;color:#15803D;flex-shrink:0;">암기 완료 ' + done + ' / ' + total + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;padding:8px 16px 30px;">' + body + '</div>' +
    '</div>';
  }

  function toggleCheck(idx) {
    var items = checklistItems();
    if (idx < 0 || idx >= items.length) return;
    var checks = loadChecks();
    checks[idx] = checks[idx] ? 0 : 1;
    saveChecks(checks);
    var row = document.getElementById("cl-" + idx);
    if (row) row.outerHTML = checklistItemHTML(items[idx], idx, !!checks[idx]);
    var done = checks.filter(Boolean).length;
    var total = checks.length;
    var pbar = document.getElementById("cl-pbar");
    if (pbar) pbar.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
    var cnt = document.getElementById("cl-count");
    if (cnt) cnt.textContent = "암기 완료 " + done + " / " + total;
  }

  // 한 문제 줄 HTML — 답 선택 시 이 줄만 교체해 전체 리렌더(깜빡임)를 피한다.
  // 북마크(별) 버튼 HTML — 저장 여부에 따라 채운 별/빈 별.
  function starHTML(gi, saved) {
    return '<button data-action="toggleSave" data-arg="' + gi + '" class="a-scale98" title="저장" ' +
      'style="width:32px;height:32px;border:1.5px solid ' + (saved ? '#F4C84A' : '#DDE3EF') + ';background:' + (saved ? '#FFF8E6' : '#fff') + ';border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;color:' + (saved ? '#E8A400' : '#C2C8D4') + ';font-family:inherit;">' + (saved ? '★' : '☆') + '</button>';
  }

  function questionRowHTML(it) {
    var sel = state.answers[it.gi] != null ? state.answers[it.gi] : null;
    var answered = sel != null;
    var isCorrect = answered && sel === it.answer;
    var gLabel = String(it.gi + 1).padStart(2, "0");
    var saved = isSaved(noteId(state.chapterId, it.text));

    var controls;
    if (!answered) {
      controls =
        '<button data-action="answer" data-arg="' + it.gi + '|O" class="a-ox-o" style="width:34px;height:32px;border:1.5px solid #DDE3EF;background:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;">' +
          '<span style="width:13px;height:13px;border-radius:50%;border:2.5px solid #2563EB;display:block;"></span>' +
        '</button>' +
        '<button data-action="answer" data-arg="' + it.gi + '|X" class="a-ox-x" style="width:34px;height:32px;border:1.5px solid #DDE3EF;background:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:15px;color:#EF4444;line-height:1;">✕</button>';
    } else if (isCorrect) {
      controls = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#E8F8EF;color:#15803D;font-size:14px;font-weight:800;">✓</span>';
    } else {
      controls = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#FDECEC;color:#DC2626;font-size:13px;font-weight:800;">✕</span>';
    }

    var detail = "";
    if (answered) {
      var head = isCorrect
        ? '<div style="font-size:11.5px;font-weight:700;color:#15803D;">정답입니다 · 정답 ' + label(it.answer) + '</div>'
        : '<div style="font-size:11.5px;font-weight:700;color:#DC2626;">오답 · 내 답 ' + label(sel) + ' · 정답 ' + label(it.answer) + '</div>';
      detail =
        '<div style="margin-left:28px;margin-top:8px;animation:slideUp .2s ease;">' +
          head +
          '<div style="font-size:12.5px;line-height:1.65;color:#353B47;margin-top:5px;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(breakSentences(it.exp)) + '</div>' +
        '</div>';
    }

    return '<div id="q-' + it.gi + '" style="border-bottom:1px solid #ECEFF4;padding:13px 0;">' +
      '<div style="display:flex;gap:10px;align-items:flex-start;">' +
        '<div style="font-size:11px;font-weight:800;color:#C2C8D4;flex-shrink:0;width:18px;padding-top:2px;">' + gLabel + '</div>' +
        '<div style="flex:1;min-width:0;font-size:13.5px;line-height:1.55;color:#14171D;word-break:keep-all;text-wrap:pretty;">' + esc(it.text) + '</div>' +
        '<div style="flex-shrink:0;display:flex;gap:6px;align-items:center;padding-top:1px;">' + starHTML(it.gi, saved) + controls + '</div>' +
      '</div>' +
      detail +
    '</div>';
  }

  function renderQuiz() {
    var ps = parts();
    var total = data().length;
    var pIdx = Math.min(state.partIndex, ps.length - 1);
    var curPart = ps[pIdx] || ps[0];
    var split = splitPartName(curPart.name);
    var theory = theoryList()[pIdx] || { blocks: null, summary: "", points: [] };

    var totalAnswered = state.answers.filter(function (a) { return a != null; }).length;
    var progressPercent = total ? Math.round((totalAnswered / total) * 100) : 0;
    var partAnswered = curPart.items.filter(function (it) { return state.answers[it.gi] != null; }).length;
    var isLastPart = pIdx >= ps.length - 1;

    // theory toggle
    var toggleUI = state.theoryOn
      ? '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="font-size:11px;font-weight:800;color:#4F46E5;letter-spacing:.04em;">ON</span>' +
          '<div style="width:38px;height:22px;border-radius:99px;background:#4F46E5;position:relative;flex-shrink:0;"><div style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#fff;"></div></div>' +
        '</div>'
      : '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="font-size:11px;font-weight:800;color:#A4ABBA;letter-spacing:.04em;">OFF</span>' +
          '<div style="width:38px;height:22px;border-radius:99px;background:#D6DAE2;position:relative;flex-shrink:0;"><div style="position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;"></div></div>' +
        '</div>';

    var theoryBody = state.theoryOn
      ? '<div style="padding:12px 14px 14px;">' + renderTheoryBody(theory) + '</div>'
      : '';

    var questions = curPart.items.map(questionRowHTML).join("");

    var prevBtn = pIdx > 0
      ? '<button data-action="prevPart" class="a-scale98" style="flex-shrink:0;border:1.5px solid #DDE3EF;background:#fff;color:#5A6172;font-size:14px;font-weight:700;padding:13px 18px;border-radius:12px;cursor:pointer;font-family:inherit;">이전</button>'
      : "";

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #ECEFF4;position:sticky;top:0;background:#F7F8FB;z-index:5;">' +
        '<button data-action="goToc" style="border:none;background:#EAEDF3;width:32px;height:32px;border-radius:9px;font-size:15px;color:#5A6172;cursor:pointer;flex-shrink:0;font-family:inherit;">‹</button>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12.5px;font-weight:700;color:#1A1D24;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(chapterTitle()) + '</div>' +
          '<div style="font-size:10.5px;color:#6E7585;margin-top:1px;">PART ' + (pIdx + 1) + ' / ' + ps.length + '</div>' +
        '</div>' +
        '<div id="quiz-anstext" style="font-size:11px;font-weight:700;color:#5C6473;flex-shrink:0;">' + partAnswered + ' / ' + curPart.items.length + '</div>' +
      '</div>' +
      '<div style="height:4px;background:#E4E8F0;flex-shrink:0;">' +
        '<div id="quiz-pbar" style="height:100%;background:#4F46E5;width:' + progressPercent + '%;transition:width .35s cubic-bezier(.4,0,.2,1);"></div>' +
      '</div>' +
      '<div style="padding:20px 18px 6px;">' +
        '<div style="font-size:11px;font-weight:700;color:#6E7585;letter-spacing:.03em;">' + esc(split.label) + '</div>' +
        '<div style="font-size:16px;font-weight:800;margin-top:4px;color:#1A1D24;word-break:keep-all;">' + esc(split.title) + '</div>' +
      '</div>' +
      '<div style="padding:8px 18px 0;">' +
        '<div style="background:#fff;border:1.5px solid #DDD7F7;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(79,70,229,.06);">' +
          '<button data-action="toggleTheory" class="a-theory" style="width:100%;border:none;cursor:pointer;display:flex;align-items:center;gap:9px;padding:12px 14px;background:#F3F1FE;font-family:inherit;">' +
            '<div style="width:24px;height:24px;border-radius:7px;background:#4F46E5;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📖</div>' +
            '<div style="flex:1;text-align:left;font-size:13px;font-weight:800;color:#312A6B;">이론 정리</div>' +
            toggleUI +
          '</button>' +
          theoryBody +
        '</div>' +
      '</div>' +
      '<div style="padding:4px 18px 12px;flex:1;">' + questions + '</div>' +
      '<div style="padding:12px 18px 22px;position:sticky;bottom:0;background:linear-gradient(to top,#F7F8FB 72%,transparent);display:flex;gap:10px;">' +
        prevBtn +
        '<button data-action="nextPart" class="a-scale99" style="flex:1;border:none;background:#1A1D24;color:#fff;font-size:15px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;">' + (isLastPart ? "결과 보기" : "다음 파트 →") + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderResult() {
    var d = data();
    var total = d.length;
    var score = state.answers.reduce(function (acc, a, i) { return acc + (a === d[i].answer ? 1 : 0); }, 0);
    var pct = total ? Math.round((score / total) * 100) : 0;
    var resultTitle;
    if (pct >= 90) resultTitle = "완벽해요!";
    else if (pct >= 70) resultTitle = "잘했어요!";
    else if (pct >= 50) resultTitle = "조금만 더!";
    else resultTitle = "다시 복습해요";

    var reviews = d.map(function (q, i) {
      var a = state.answers[i];
      var ok = a === q.answer;
      var mark = ok ? "✅" : "❌";
      var number = String(i + 1).padStart(2, "0");
      return '<div style="display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:13px 15px;box-shadow:0 2px 8px rgba(30,40,70,.04);">' +
        '<span style="font-size:18px;flex-shrink:0;">' + mark + '</span>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13.5px;line-height:1.45;color:#14171D;word-break:keep-all;">' + esc(q.text) + '</div>' +
          '<div style="font-size:11.5px;color:#727A8A;margin-top:3px;">Q' + number + ' · 정답 ' + label(q.answer) + '</div>' +
        '</div>' +
      '</div>';
    }).join("");

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:48px 24px 20px;">' +
        '<div style="font-size:13px;font-weight:600;color:#5C6473;">학습 완료</div>' +
        '<div style="font-size:24px;font-weight:800;margin-top:8px;">' + resultTitle + '</div>' +
        '<div style="font-size:14px;color:#5C6473;margin-top:6px;">' + esc(chapterTitle()) + '</div>' +
        '<div style="display:flex;align-items:baseline;gap:6px;margin-top:22px;">' +
          '<span style="font-size:40px;font-weight:800;color:#1A1D24;">' + score + '</span>' +
          '<span style="font-size:18px;font-weight:700;color:#B0B6C5;">/ ' + total + '점</span>' +
        '</div>' +
      '</div>' +
      '<div style="padding:8px 16px 16px;flex:1;">' +
        '<div style="font-size:12px;font-weight:700;color:#6E7585;letter-spacing:.03em;padding:8px;">다시 보기</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' + reviews + '</div>' +
      '</div>' +
      '<div style="padding:12px 20px 28px;display:flex;gap:12px;position:sticky;bottom:0;background:linear-gradient(to top,#F7F8FB 70%,transparent);">' +
        '<button data-action="goHome" class="a-scale98" style="flex:1;border:2px solid #DDE3EF;background:#fff;color:#5A6172;font-size:15px;font-weight:700;padding:15px;border-radius:16px;cursor:pointer;font-family:inherit;">목록으로</button>' +
        '<button data-action="retry" class="a-scale98" style="flex:1.4;border:none;background:#4F46E5;color:#fff;font-size:15px;font-weight:700;padding:15px;border-radius:16px;cursor:pointer;font-family:inherit;">다시 풀기</button>' +
      '</div>' +
    '</div>';
  }

  // ---- 복습 노트 (오답노트 / 저장함) 목록 화면 ----------------------------
  function reviewTabBtn(tab, labelTxt, n, active) {
    var st = active
      ? 'background:#1A1D24;color:#fff;'
      : 'background:#fff;color:#5A6172;border:1.5px solid #DDE3EF;';
    return '<button data-action="reviewTab" data-arg="' + tab + '" class="a-scale98" style="flex:1;border:none;cursor:pointer;font-size:13.5px;font-weight:800;padding:11px;border-radius:12px;font-family:inherit;' + st + '">' + labelTxt + ' ' + n + '</button>';
  }

  // 목록 한 줄 (풀이 아님) — 본문 + 정답 배지 + 별/삭제.
  function reviewListRowHTML(rec, tab, idx) {
    var trailBtn = tab === "wrong"
      ? '<button data-action="removeWrongIdx" data-arg="' + idx + '" class="a-scale98" title="오답노트에서 삭제" style="width:30px;height:30px;border:1.5px solid #F3D2CC;background:#fff;border-radius:8px;cursor:pointer;color:#DC2626;font-size:14px;line-height:1;flex-shrink:0;font-family:inherit;">✕</button>'
      : '<button data-action="toggleSaveIdx" data-arg="' + idx + '" class="a-scale98" title="저장 해제" style="width:30px;height:30px;border:1.5px solid #F4C84A;background:#FFF8E6;border-radius:8px;cursor:pointer;color:#E8A400;font-size:14px;line-height:1;flex-shrink:0;font-family:inherit;">★</button>';
    return '<div style="display:flex;gap:10px;align-items:flex-start;background:#fff;border-radius:13px;padding:12px 13px;box-shadow:0 2px 8px rgba(30,40,70,.04);">' +
      '<div style="flex-shrink:0;width:34px;height:20px;border-radius:6px;background:#EFF6FF;color:#2563EB;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px;">정답 ' + label(rec.answer) + '</div>' +
      '<div style="flex:1;min-width:0;font-size:13px;line-height:1.5;color:#14171D;word-break:keep-all;text-wrap:pretty;">' + esc(rec.text) + '</div>' +
      trailBtn +
    '</div>';
  }

  function renderReview() {
    var wrong = loadNotes(WRONG_KEY);
    var saved = loadNotes(SAVED_KEY);
    var tab = review.tab === "saved" ? "saved" : "wrong";
    var list = tab === "saved" ? saved : wrong;

    var body;
    if (!list.length) {
      var msg = tab === "saved" ? "저장한 문제가 없어요.\n문제 옆 ☆ 버튼으로 저장하세요." : "오답이 없어요.\n문제를 틀리면 자동으로 여기 쌓여요.";
      body = '<div style="padding:56px 20px;text-align:center;color:#9AA1B0;font-size:14px;line-height:1.7;white-space:pre-line;">' + esc(msg) + '</div>';
    } else {
      var idx = 0;
      body = groupByChapter(list).map(function (g) {
        var rows = g.items.map(function (rec) { return reviewListRowHTML(rec, tab, idx++); }).join("");
        return '<div style="font-size:12px;font-weight:800;color:#4F46E5;margin:16px 2px 8px;word-break:keep-all;">' + esc(g.chTitle || "챕터") + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' + rows + '</div>';
      }).join("");
    }

    var startBtn = list.length
      ? '<button data-action="startReview" class="a-scale99" style="width:100%;border:none;background:#4F46E5;color:#fff;font-size:15px;font-weight:800;padding:15px;border-radius:14px;cursor:pointer;font-family:inherit;">이 문제들 풀기 (' + list.length + ')</button>'
      : "";

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:20px 20px 12px;flex-shrink:0;position:sticky;top:0;background:#F7F8FB;z-index:5;">' +
        '<button data-action="goHome" style="border:none;background:transparent;padding:0;display:flex;align-items:center;gap:6px;color:#5C6473;font-size:12.5px;cursor:pointer;font-family:inherit;">‹ 목록</button>' +
        '<div style="font-size:18px;font-weight:800;margin-top:12px;color:#1A1D24;">📌 복습 노트</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          reviewTabBtn("wrong", "오답노트", wrong.length, tab === "wrong") +
          reviewTabBtn("saved", "저장함", saved.length, tab === "saved") +
        '</div>' +
      '</div>' +
      '<div style="flex:1;padding:2px 16px 14px;">' + body + '</div>' +
      (startBtn ? '<div style="padding:12px 18px 22px;position:sticky;bottom:0;background:linear-gradient(to top,#F7F8FB 72%,transparent);">' + startBtn + '</div>' : '') +
    '</div>';
  }

  // ---- 복습 풀이 화면 (스냅샷 세트를 O/X 로 다시 풀기) ---------------------
  // 한 줄 HTML — questionRowHTML 과 유사하나 review.answers[idx] 를 사용한다.
  function reviewRowHTML(it, idx) {
    var sel = review.answers[idx] != null ? review.answers[idx] : null;
    var answered = sel != null;
    var isCorrect = answered && sel === it.answer;
    var num = String(idx + 1).padStart(2, "0");
    var saved = isSaved(it.id);

    var star = '<button data-action="reviewSaveIdx" data-arg="' + idx + '" class="a-scale98" title="저장" style="width:32px;height:32px;border:1.5px solid ' + (saved ? '#F4C84A' : '#DDE3EF') + ';background:' + (saved ? '#FFF8E6' : '#fff') + ';border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;color:' + (saved ? '#E8A400' : '#C2C8D4') + ';font-family:inherit;">' + (saved ? '★' : '☆') + '</button>';

    var controls;
    if (!answered) {
      controls =
        '<button data-action="reviewAnswer" data-arg="' + idx + '|O" class="a-ox-o" style="width:34px;height:32px;border:1.5px solid #DDE3EF;background:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;">' +
          '<span style="width:13px;height:13px;border-radius:50%;border:2.5px solid #2563EB;display:block;"></span>' +
        '</button>' +
        '<button data-action="reviewAnswer" data-arg="' + idx + '|X" class="a-ox-x" style="width:34px;height:32px;border:1.5px solid #DDE3EF;background:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:15px;color:#EF4444;line-height:1;">✕</button>';
    } else if (isCorrect) {
      controls = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#E8F8EF;color:#15803D;font-size:14px;font-weight:800;">✓</span>';
    } else {
      controls = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#FDECEC;color:#DC2626;font-size:13px;font-weight:800;">✕</span>';
    }

    var detail = "";
    if (answered) {
      var head = isCorrect
        ? '<div style="font-size:11.5px;font-weight:700;color:#15803D;">정답입니다 · 정답 ' + label(it.answer) + '</div>'
        : '<div style="font-size:11.5px;font-weight:700;color:#DC2626;">오답 · 내 답 ' + label(sel) + ' · 정답 ' + label(it.answer) + '</div>';
      detail =
        '<div style="margin-left:28px;margin-top:8px;animation:slideUp .2s ease;">' + head +
          '<div style="font-size:12.5px;line-height:1.65;color:#353B47;margin-top:5px;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(breakSentences(it.exp)) + '</div>' +
        '</div>';
    }

    return '<div id="rq-' + idx + '" style="border-bottom:1px solid #ECEFF4;padding:13px 0;">' +
      '<div style="display:flex;gap:10px;align-items:flex-start;">' +
        '<div style="font-size:11px;font-weight:800;color:#C2C8D4;flex-shrink:0;width:18px;padding-top:2px;">' + num + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10.5px;font-weight:700;color:#AEB5C4;margin-bottom:3px;">' + esc(it.chTitle || "") + '</div>' +
          '<div style="font-size:13.5px;line-height:1.55;color:#14171D;word-break:keep-all;text-wrap:pretty;">' + esc(it.text) + '</div>' +
        '</div>' +
        '<div style="flex-shrink:0;display:flex;gap:6px;align-items:center;padding-top:1px;">' + star + controls + '</div>' +
      '</div>' +
      detail +
    '</div>';
  }

  function reviewCounts() {
    var answered = review.answers.filter(function (a) { return a != null; }).length;
    var correct = review.answers.reduce(function (acc, a, i) { return acc + (a != null && a === review.items[i].answer ? 1 : 0); }, 0);
    return { answered: answered, correct: correct, total: review.items.length };
  }

  function renderReviewQuiz() {
    var title = review.mode === "saved" ? "저장함 풀기" : "오답노트 풀기";
    if (!review.items.length) {
      return '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
        '<div style="padding:20px;"><button data-action="goReview" style="border:none;background:transparent;padding:0;color:#5C6473;font-size:12.5px;cursor:pointer;font-family:inherit;">‹ 복습 노트</button></div>' +
        '<div style="padding:56px 20px;text-align:center;color:#9AA1B0;font-size:14px;">풀 문제가 없어요.</div></div>';
    }
    var c = reviewCounts();
    var pct = c.total ? Math.round((c.answered / c.total) * 100) : 0;
    var rows = review.items.map(reviewRowHTML).join("");

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #ECEFF4;position:sticky;top:0;background:#F7F8FB;z-index:5;">' +
        '<button data-action="goReview" style="border:none;background:#EAEDF3;width:32px;height:32px;border-radius:9px;font-size:15px;color:#5A6172;cursor:pointer;flex-shrink:0;font-family:inherit;">‹</button>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:12.5px;font-weight:700;color:#1A1D24;">' + title + '</div>' +
          '<div id="rq-sub" style="font-size:10.5px;color:#6E7585;margin-top:1px;">정답 ' + c.correct + ' · ' + c.answered + ' / ' + c.total + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="height:4px;background:#E4E8F0;flex-shrink:0;">' +
        '<div id="rq-pbar" style="height:100%;background:#4F46E5;width:' + pct + '%;transition:width .35s cubic-bezier(.4,0,.2,1);"></div>' +
      '</div>' +
      '<div style="padding:6px 18px 12px;flex:1;">' + rows + '</div>' +
      '<div style="padding:12px 18px 22px;position:sticky;bottom:0;background:linear-gradient(to top,#F7F8FB 72%,transparent);">' +
        '<button data-action="goReview" class="a-scale99" style="width:100%;border:none;background:#1A1D24;color:#fff;font-size:15px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;">완료 · 복습 노트로</button>' +
      '</div>' +
    '</div>';
  }

  // ---- render dispatch -----------------------------------------------------
  function screenHTML() {
    if (state.screen === "review") return renderReview();
    if (state.screen === "reviewQuiz") return renderReviewQuiz();
    if (state.screen === "login") return renderLogin();
    if (state.screen === "home" || !state.chapterId) return renderHome();
    if (!data().length) {
      return '<div style="padding:80px 24px;text-align:center;color:#8A90A0;font-size:14px;">데이터를 불러오는 중…</div>';
    }
    switch (state.screen) {
      case "toc": return renderToc();
      case "quiz": return renderQuiz();
      case "result": return renderResult();
      case "checklist": return renderChecklist();
      default: return renderHome();
    }
  }

  function render() {
    var inner = screenHTML();
    root.innerHTML =
      '<div style="min-height:100vh;background:#EEF1F6;display:flex;justify-content:center;">' +
        '<div style="width:100%;max-width:460px;min-height:100vh;background:#F7F8FB;display:flex;flex-direction:column;box-shadow:0 0 40px rgba(20,25,40,.08);">' +
          inner +
        '</div>' +
      '</div>';

    var navKey = state.screen + ":" + state.partIndex;
    if (navKey !== lastNavKey) {
      lastNavKey = navKey;
      window.scrollTo(0, 0);
    }

    saveSession();
  }

  // ---- actions -------------------------------------------------------------
  function enterChapter(id) {
    state.chapterId = id;
    state.screen = "toc";
    render(); // 미로딩 시 로딩 화면
    loadChapter(id, function (ok) {
      if (!ok) { state.chapterId = null; state.screen = "home"; render(); return; }
      var saved = loadSession();
      if (saved) { state.partIndex = saved.partIndex; state.answers = saved.answers; }
      else { state.partIndex = 0; state.answers = freshAnswers(); }
      state.screen = "toc";
      render();
    });
  }
  function openPart(i) { state.partIndex = i; state.screen = "quiz"; render(); }
  function goToc() { state.screen = "toc"; render(); }
  function goHome() { state.screen = "home"; render(); }
  function showResult() { state.screen = "result"; render(); }
  function retry() { state.screen = "toc"; state.partIndex = 0; state.answers = freshAnswers(); render(); }

  // ---- 복습 노트 액션 ------------------------------------------------------
  function openReview(tab) {
    review.tab = tab === "saved" ? "saved" : "wrong";
    state.screen = "review";
    render();
  }
  function startReviewQuiz() {
    var list = review.tab === "saved" ? loadNotes(SAVED_KEY) : loadNotes(WRONG_KEY);
    review.mode = review.tab;
    review.items = list.slice();
    review.answers = list.map(function () { return null; });
    state.screen = "reviewQuiz";
    render();
  }
  function reviewPick(idx, choice) {
    if (idx < 0 || idx >= review.items.length || review.answers[idx] != null) return;
    review.answers[idx] = choice;
    var it = review.items[idx];
    if (choice === it.answer) {
      // 오답노트 풀이 중 정답 → 오답노트에서 제거(마스터). 화면 목록엔 그대로 둔다.
      if (review.mode === "wrong") removeWrong(it.id);
    } else {
      addWrong(it); // 저장함 문제를 틀리면 오답노트에도 추가
    }
    var row = document.getElementById("rq-" + idx);
    if (row) row.outerHTML = reviewRowHTML(it, idx);
    var c = reviewCounts();
    var sub = document.getElementById("rq-sub");
    if (sub) sub.textContent = "정답 " + c.correct + " · " + c.answered + " / " + c.total;
    var bar = document.getElementById("rq-pbar");
    if (bar) bar.style.width = (c.total ? Math.round((c.answered / c.total) * 100) : 0) + "%";
  }
  // 복습 풀이 화면에서 별 토글
  function reviewSaveIdx(idx) {
    var it = review.items[idx];
    if (!it) return;
    toggleSaved(it);
    var row = document.getElementById("rq-" + idx);
    if (row) row.outerHTML = reviewRowHTML(it, idx);
  }
  // 목록 화면: 오답노트에서 삭제
  function removeWrongIdx(idx) {
    var arr = loadNotes(WRONG_KEY);
    if (idx < 0 || idx >= arr.length) return;
    removeWrong(arr[idx].id);
    render();
  }
  // 목록 화면: 저장 토글(저장함 탭에선 삭제)
  function toggleSaveIdx(idx) {
    var arr = review.tab === "saved" ? loadNotes(SAVED_KEY) : loadNotes(WRONG_KEY);
    if (idx < 0 || idx >= arr.length) return;
    toggleSaved(arr[idx]);
    render();
  }

  // ---- 로그인(동기화) 화면 ------------------------------------------------
  function renderLogin() {
    var sync = window.QUIZ_SYNC;
    var configured = sync && sync.configured && sync.configured();
    var note = configured
      ? ""
      : '<div style="background:#FEF3F0;border:1px solid #F6D6C9;border-radius:12px;padding:12px 14px;font-size:12.5px;color:#9A3412;line-height:1.6;margin-bottom:18px;">동기화가 아직 설정되지 않았어요. <b>app/firebase-config.js</b> 에 Firebase 설정을 넣으면 구글·이메일 로그인이 켜집니다. (README 참고)</div>';
    var err = review._loginError ? '<div style="color:#DC2626;font-size:12.5px;margin-top:10px;">' + esc(review._loginError) + '</div>' : "";
    var dis = configured ? "" : "opacity:.5;pointer-events:none;";

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:20px 20px 4px;">' +
        '<button data-action="goHome" style="border:none;background:transparent;padding:0;color:#5C6473;font-size:12.5px;cursor:pointer;font-family:inherit;">‹ 목록</button>' +
      '</div>' +
      '<div style="padding:24px 24px 8px;">' +
        '<div style="font-size:22px;font-weight:800;color:#1A1D24;">로그인</div>' +
        '<div style="font-size:13.5px;color:#5C6473;margin-top:8px;line-height:1.6;">오답·저장 기록을 클라우드에 백업하고 다른 기기와 동기화합니다.</div>' +
      '</div>' +
      '<div style="padding:16px 24px 24px;">' + note +
        '<div style="' + dis + '">' +
          '<button data-action="loginGoogle" class="a-scale98" style="width:100%;border:1.5px solid #DDE3EF;background:#fff;color:#1A1D24;font-size:15px;font-weight:700;padding:14px;border-radius:14px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:18px;">' +
            '<span style="font-size:16px;font-weight:800;color:#4285F4;">G</span> Google 계정으로 계속</button>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;color:#AEB5C4;font-size:11.5px;font-weight:700;"><div style="flex:1;height:1px;background:#E4E8F0;"></div>또는 이메일<div style="flex:1;height:1px;background:#E4E8F0;"></div></div>' +
          '<input id="login-email" type="email" inputmode="email" autocomplete="email" placeholder="이메일" style="width:100%;border:1.5px solid #DDE3EF;background:#fff;border-radius:12px;padding:13px 14px;font-size:14px;font-family:inherit;margin-bottom:10px;">' +
          '<input id="login-pw" type="password" autocomplete="current-password" placeholder="비밀번호 (6자 이상)" style="width:100%;border:1.5px solid #DDE3EF;background:#fff;border-radius:12px;padding:13px 14px;font-size:14px;font-family:inherit;">' +
          err +
          '<div style="display:flex;gap:10px;margin-top:16px;">' +
            '<button data-action="loginEmail" class="a-scale98" style="flex:1;border:none;background:#4F46E5;color:#fff;font-size:14.5px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;">로그인</button>' +
            '<button data-action="registerEmail" class="a-scale98" style="flex:1;border:1.5px solid #DDE3EF;background:#fff;color:#5A6172;font-size:14.5px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;">회원가입</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function toggleTheory() {
    state.theoryOn = !state.theoryOn;
    try { localStorage.setItem(STORAGE_KEY, state.theoryOn ? "1" : "0"); } catch (e) {}
    render();
  }

  // ---- 로그인/동기화 액션 (sync.js 미설정 시 조용히 무시) -----------------
  function openLogin() { review._loginError = null; state.screen = "login"; render(); }
  function authDone(err) {
    if (err) { review._loginError = err; render(); return; }
    review._loginError = null;
    state.screen = "home";
    render();
  }
  function loginGoogle() {
    var sync = window.QUIZ_SYNC;
    if (!sync || !sync.signInGoogle) return;
    sync.signInGoogle().then(function () { authDone(); }).catch(function (e) { authDone(syncErr(e)); });
  }
  function loginEmail(register) {
    var sync = window.QUIZ_SYNC;
    if (!sync) return;
    var email = (document.getElementById("login-email") || {}).value || "";
    var pw = (document.getElementById("login-pw") || {}).value || "";
    if (!email || !pw) { authDone("이메일과 비밀번호를 입력하세요."); return; }
    var fn = register ? sync.registerEmail : sync.signInEmail;
    if (!fn) return;
    fn(email.trim(), pw).then(function () { authDone(); }).catch(function (e) { authDone(syncErr(e)); });
  }
  function signOut() {
    var sync = window.QUIZ_SYNC;
    if (!sync || !sync.signOut) return;
    if (typeof window.confirm === "function" &&
        !window.confirm("로그아웃할까요?\n진도는 클라우드에 저장돼 있어 다시 로그인하면 복원됩니다.")) return;
    sync.signOut().then(function () { render(); });
  }
  function syncErr(e) {
    var code = e && e.code ? e.code : "";
    if (code.indexOf("wrong-password") >= 0 || code.indexOf("invalid-credential") >= 0) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (code.indexOf("email-already-in-use") >= 0) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (code.indexOf("weak-password") >= 0) return "비밀번호는 6자 이상이어야 합니다.";
    if (code.indexOf("invalid-email") >= 0) return "이메일 형식이 올바르지 않습니다.";
    if (code.indexOf("popup-closed") >= 0 || code.indexOf("cancelled") >= 0) return "로그인이 취소되었습니다.";
    return (e && e.message) ? e.message : "로그인에 실패했습니다.";
  }

  function pick(gi, choice) {
    if (state.answers[gi] != null) return;
    state.answers[gi] = choice;

    // 오답이면 오답노트에 자동 저장 (스냅샷)
    var q = data()[gi];
    if (q && choice !== q.answer) addWrong(buildRecord(gi));

    // 전체 리렌더 대신 해당 문제 줄 + 진행률만 갱신 → 깜빡임 없음
    var row = document.getElementById("q-" + gi);
    if (!row) { render(); return; }
    var it = Object.assign({ gi: gi }, data()[gi]);
    row.outerHTML = questionRowHTML(it);
    updateQuizProgress();
    saveSession(); // 답 선택도 저장 (pick 은 부분 갱신이라 render 를 거치지 않음)
  }

  // 북마크 토글 — 현재 문제 줄만 다시 그린다.
  function toggleSave(gi) {
    var rec = buildRecord(gi);
    if (!rec) return;
    toggleSaved(rec);
    var row = document.getElementById("q-" + gi);
    if (row) row.outerHTML = questionRowHTML(Object.assign({ gi: gi }, data()[gi]));
  }

  // 상단 진행바 + "n / m" 카운터만 갱신 (현재 파트 기준)
  function updateQuizProgress() {
    var ps = parts();
    var total = data().length;
    var pIdx = Math.min(state.partIndex, ps.length - 1);
    var curPart = ps[pIdx] || ps[0];
    var totalAnswered = state.answers.filter(function (a) { return a != null; }).length;
    var partAnswered = curPart.items.filter(function (it) { return state.answers[it.gi] != null; }).length;

    var bar = document.getElementById("quiz-pbar");
    if (bar) bar.style.width = (total ? Math.round((totalAnswered / total) * 100) : 0) + "%";
    var ans = document.getElementById("quiz-anstext");
    if (ans) ans.textContent = partAnswered + " / " + curPart.items.length;
  }

  function prevPart() {
    if (state.partIndex > 0) { state.partIndex -= 1; render(); }
  }
  function nextPart() {
    if (state.partIndex >= parts().length - 1) { state.screen = "result"; }
    else { state.partIndex += 1; }
    render();
  }

  // ---- event delegation ----------------------------------------------------
  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var arg = el.getAttribute("data-arg");
    switch (action) {
      case "enterChapter": enterChapter(arg); break;
      case "openPart": openPart(parseInt(arg, 10)); break;
      case "goToc": goToc(); break;
      case "goHome": goHome(); break;
      case "openChecklist": state.screen = "checklist"; render(); break;
      case "toggleCheck": toggleCheck(parseInt(arg, 10)); break;
      case "showResult": showResult(); break;
      case "retry": retry(); break;
      case "toggleTheory": toggleTheory(); break;
      case "prevPart": prevPart(); break;
      case "nextPart": nextPart(); break;
      case "toggleSave": toggleSave(parseInt(arg, 10)); break;
      case "openReview": openReview(arg); break;
      case "reviewTab": review.tab = arg; render(); break;
      case "startReview": startReviewQuiz(); break;
      case "goReview": state.screen = "review"; render(); break;
      case "removeWrongIdx": removeWrongIdx(parseInt(arg, 10)); break;
      case "toggleSaveIdx": toggleSaveIdx(parseInt(arg, 10)); break;
      case "reviewSaveIdx": reviewSaveIdx(parseInt(arg, 10)); break;
      case "openLogin": openLogin(); break;
      case "loginGoogle": loginGoogle(); break;
      case "loginEmail": loginEmail(false); break;
      case "registerEmail": loginEmail(true); break;
      case "signOut": signOut(); break;
      case "answer":
        var parts2 = (arg || "").split("|");
        pick(parseInt(parts2[0], 10), parts2[1]);
        break;
      case "reviewAnswer":
        var parts3 = (arg || "").split("|");
        reviewPick(parseInt(parts3[0], 10), parts3[1]);
        break;
    }
  });

  // ---- boot ----------------------------------------------------------------
  // 마지막 학습 챕터가 있으면 지연 로딩 후 저장된 화면·진행 상태를 복원한다.
  function boot() {
    migrateV1();
    var last = null;
    try { last = localStorage.getItem(LAST_CH_KEY); } catch (e) {}
    if (last && chapterMeta(last)) {
      state.chapterId = last;
      render(); // 로딩 화면
      loadChapter(last, function (ok) {
        if (!ok) { state.chapterId = null; state.screen = "home"; render(); return; }
        var saved = loadSession();
        if (saved) {
          state.screen = saved.screen;
          state.partIndex = saved.partIndex;
          state.answers = saved.answers;
        } else {
          state.answers = freshAnswers();
          state.screen = "home";
        }
        render();
      });
      return;
    }
    state.screen = "home";
    render();
  }

  // 로그인/동기화(sync.js)로 로컬 기록이 바뀌면 현재 화면을 다시 그린다.
  window.addEventListener("quizsync", function () { render(); });

  boot();
})();
