/* 지방세기본법 제1장 (총칙) OX 퀴즈 — 독립 실행 정적 사이트
 * Claude Design DC 프로토타입(지방세기본법 제1장 (총칙).dc.html)을
 * 프레임워크 의존성 없이 1:1 재현한 구현. 데이터는 quizdata.js 그대로 사용. */
(function () {
  "use strict";

  var STORAGE_KEY = "jibangse_theoryOn";
  var SESSION_KEY = "jibangse_session_v1"; // 진행 상태(화면/파트/답) 저장 키

  // ---- state ---------------------------------------------------------------
  var state = {
    screen: "home",   // home | toc | quiz | result
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

  var root = document.getElementById("app");
  var lastNavKey = null;

  // ---- data accessors ------------------------------------------------------
  function data() { return window.QUIZ_DATA || []; }
  function theoryList() { return window.QUIZ_THEORY || []; }

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
  // 화면·파트·푼 답을 localStorage 에 저장하고 재실행 시 그대로 복원한다.
  function saveSession() {
    if (!data().length) return; // 데이터 로딩 전(초기 렌더)에는 저장하지 않는다
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        screen: state.screen,
        partIndex: state.partIndex,
        answers: state.answers
      }));
    } catch (e) {}
  }

  // 저장본을 검증해 복원 가능한 값이면 반환, 아니면 null.
  // (문항 수가 바뀐 옛 저장본 등은 폐기하여 불일치를 방지한다.)
  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
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
      return '<div style="font-size:13.5px;font-weight:700;color:#312A6B;background:#F1EFFE;border:1px solid #DDD7F7;border-radius:10px;padding:11px 13px;line-height:1.6;word-break:keep-all;text-wrap:pretty;">' + esc(b.t) + '</div>';
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
        html += '<div style="font-size:12.5px;font-weight:600;color:' + m.tc + ';line-height:1.6;word-break:keep-all;text-wrap:pretty;white-space:pre-line;">' + esc(b.t) + '</div>';
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
    return '<div style="font-size:13px;color:#353B47;line-height:1.68;word-break:keep-all;text-wrap:pretty;">' + esc(b.t) + '</div>';
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
  function renderHome() {
    var ps = parts();
    var total = data().length;
    var totalAnswered = state.answers.filter(function (a) { return a != null; }).length;
    var overallPct = total ? Math.round((totalAnswered / total) * 100) : 0;

    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:56px 24px 28px;">' +
        '<div style="font-size:13px;font-weight:600;letter-spacing:.04em;color:#5C6473;">학습 퀴즈</div>' +
        '<div style="font-size:22px;font-weight:800;margin-top:8px;line-height:1.3;">지방세법</div>' +
        '<div style="font-size:14px;color:#434A59;margin-top:6px;">O/X 문제로 핵심 개념을 빠르게 점검해요</div>' +
      '</div>' +
      '<div style="padding:0 16px 24px;">' +
        '<div style="font-size:12px;font-weight:700;color:#6E7585;letter-spacing:.03em;padding:0 8px 10px;">목록</div>' +
        '<button data-action="enterChapter" class="a-scale985" style="width:100%;text-align:left;border:none;cursor:pointer;background:#FFFFFF;border-radius:20px;padding:20px;box-shadow:0 6px 20px rgba(30,40,70,.06);display:flex;flex-direction:column;gap:16px;font-family:inherit;">' +
          '<div style="display:flex;align-items:flex-start;gap:14px;">' +
            '<div style="width:46px;height:46px;border-radius:14px;background:#4F46E5;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;">1</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:15.5px;font-weight:700;line-height:1.35;color:#1A1D24;">지방세기본법 제1장 (총칙)</div>' +
              '<div style="font-size:13px;color:#5C6473;margin-top:4px;">' + ps.length + '개 파트 · ' + total + '문제 · O/X</div>' +
            '</div>' +
            '<div style="color:#C2C8D4;font-size:22px;align-self:center;">›</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="flex:1;height:6px;background:#ECEFF4;border-radius:99px;overflow:hidden;">' +
              '<div style="height:100%;background:#4F46E5;border-radius:99px;width:' + overallPct + '%;"></div>' +
            '</div>' +
            '<div style="font-size:12px;font-weight:700;color:#AEB5C4;flex-shrink:0;">' + totalAnswered + ' / ' + total + '</div>' +
          '</div>' +
        '</button>' +
      '</div>' +
      '<div style="margin-top:auto;padding:16px 24px 28px;text-align:center;font-size:12px;color:#B4BAC8;">탭하여 문제 풀기를 시작하세요</div>' +
    '</div>';
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
        '<div style="font-size:18px;font-weight:800;margin-top:12px;color:#1A1D24;">지방세기본법 제1장 (총칙)</div>' +
        '<div style="font-size:12.5px;color:#5C6473;margin-top:4px;">총 ' + ps.length + '개 파트 · ' + total + '문제 · ' + totalAnswered + '문제 완료</div>' +
      '</div>' +
      '<div style="flex:1;padding:2px 14px 14px;">' + renderChecklistCard() + items + '</div>' +
      '<div style="padding:12px 18px 22px;position:sticky;bottom:0;background:linear-gradient(to top,#F7F8FB 72%,transparent);">' +
        '<button data-action="showResult" class="a-scale99" style="width:100%;border:1.5px solid #DDE3EF;background:#fff;color:#5A6172;font-size:14.5px;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;font-family:inherit;">전체 결과 보기</button>' +
      '</div>' +
    '</div>';
  }

  // ⭐ 최종 암기 체크리스트 — 파트 목록 상단 카드 + 전용 화면
  function renderChecklistCard() {
    if (!window.QUIZ_CHECKLIST) return "";
    return '<button data-action="openChecklist" class="a-scale99" style="width:100%;text-align:left;border:1.5px solid #F4E2C2;cursor:pointer;display:flex;align-items:center;gap:12px;background:#FFF9EF;border-radius:14px;padding:13px 14px;margin-bottom:12px;box-shadow:0 2px 8px rgba(30,40,70,.04);font-family:inherit;">' +
      '<div style="width:30px;height:30px;border-radius:9px;background:#FDEEC8;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">⭐</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13.5px;font-weight:800;color:#7A4E08;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">최종 암기 체크리스트</div>' +
        '<div style="font-size:11px;font-weight:600;color:#B08A3E;margin-top:4px;">제1장 전체 총정리 · 25항목</div>' +
      '</div>' +
      '<span style="color:#D9B96E;font-size:18px;flex-shrink:0;">›</span>' +
    '</button>';
  }

  function renderChecklist() {
    var cl = window.QUIZ_CHECKLIST || { blocks: [] };
    var inner = (cl.blocks || []).map(renderBlock).join("");
    return '' +
    '<div style="display:flex;flex-direction:column;min-height:100vh;">' +
      '<div style="padding:20px 20px 14px;flex-shrink:0;position:sticky;top:0;background:#F7F8FB;z-index:5;">' +
        '<button data-action="goToc" style="border:none;background:transparent;padding:0;display:flex;align-items:center;gap:6px;color:#5C6473;font-size:12.5px;cursor:pointer;font-family:inherit;">‹ 파트 목록</button>' +
        '<div style="font-size:18px;font-weight:800;margin-top:12px;color:#1A1D24;">⭐ 최종 암기 체크리스트</div>' +
        '<div style="font-size:12.5px;color:#5C6473;margin-top:4px;">제1장 (총칙) 전체 총정리 · 25항목</div>' +
      '</div>' +
      '<div style="flex:1;padding:6px 16px 28px;"><div style="display:flex;flex-direction:column;gap:11px;">' + inner + '</div></div>' +
    '</div>';
  }

  // 한 문제 줄 HTML — 답 선택 시 이 줄만 교체해 전체 리렌더(깜빡임)를 피한다.
  function questionRowHTML(it) {
    var sel = state.answers[it.gi] != null ? state.answers[it.gi] : null;
    var answered = sel != null;
    var isCorrect = answered && sel === it.answer;
    var gLabel = String(it.gi + 1).padStart(2, "0");

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
        '<div style="flex-shrink:0;display:flex;gap:6px;align-items:center;padding-top:1px;">' + controls + '</div>' +
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
          '<div style="font-size:12.5px;font-weight:700;color:#1A1D24;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">지방세기본법 제1장 (총칙)</div>' +
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
        '<div style="font-size:14px;color:#5C6473;margin-top:6px;">지방세기본법 제1장 (총칙)</div>' +
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

  // ---- render dispatch -----------------------------------------------------
  function screenHTML() {
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
  function enterChapter() {
    if (state.answers.length !== data().length) state.answers = freshAnswers();
    state.screen = "toc";
    render();
  }
  function openPart(i) { state.partIndex = i; state.screen = "quiz"; render(); }
  function goToc() { state.screen = "toc"; render(); }
  function goHome() { state.screen = "home"; render(); }
  function showResult() { state.screen = "result"; render(); }
  function retry() { state.screen = "toc"; state.partIndex = 0; state.answers = freshAnswers(); render(); }

  function toggleTheory() {
    state.theoryOn = !state.theoryOn;
    try { localStorage.setItem(STORAGE_KEY, state.theoryOn ? "1" : "0"); } catch (e) {}
    render();
  }

  function pick(gi, choice) {
    if (state.answers[gi] != null) return;
    state.answers[gi] = choice;

    // 전체 리렌더 대신 해당 문제 줄 + 진행률만 갱신 → 깜빡임 없음
    var row = document.getElementById("q-" + gi);
    if (!row) { render(); return; }
    var it = Object.assign({ gi: gi }, data()[gi]);
    row.outerHTML = questionRowHTML(it);
    updateQuizProgress();
    saveSession(); // 답 선택도 저장 (pick 은 부분 갱신이라 render 를 거치지 않음)
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
      case "enterChapter": enterChapter(); break;
      case "openPart": openPart(parseInt(arg, 10)); break;
      case "goToc": goToc(); break;
      case "goHome": goHome(); break;
      case "openChecklist": state.screen = "checklist"; render(); break;
      case "showResult": showResult(); break;
      case "retry": retry(); break;
      case "toggleTheory": toggleTheory(); break;
      case "prevPart": prevPart(); break;
      case "nextPart": nextPart(); break;
      case "answer":
        var parts2 = (arg || "").split("|");
        pick(parseInt(parts2[0], 10), parts2[1]);
        break;
    }
  });

  // ---- boot ----------------------------------------------------------------
  // 데이터가 준비되면 저장된 진행 상태를 복원하고, 없으면 초기 상태로 시작한다.
  function start() {
    var saved = loadSession();
    if (saved) {
      state.screen = saved.screen;
      state.partIndex = saved.partIndex;
      state.answers = saved.answers;
    } else {
      state.answers = freshAnswers();
    }
    render();
  }

  function boot() {
    if (window.QUIZ_DATA) { start(); return; }
    // quizdata.js may still be parsing on very slow loads; show loading, then retry.
    render();
    var t = setInterval(function () {
      if (window.QUIZ_DATA) { clearInterval(t); start(); }
    }, 30);
  }

  boot();
})();
