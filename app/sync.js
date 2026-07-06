/* 로그인 동기화 모듈 (선택 기능) — window.QUIZ_SYNC
 * ─────────────────────────────────────────────────────────────
 * firebase-config.js 의 window.FIREBASE_CONFIG 가 설정돼 있을 때만 동작한다.
 * 미설정이면 configured()===false 로 두어 앱은 로컬 저장만으로 동작한다.
 *
 * 동작 요약
 *  · 로그인 시: 클라우드 문서 ↔ 로컬 오답/저장 기록을 id 기준 합집합(union)으로
 *    병합해 양쪽에 반영한다(첫 로그인에 로컬 기록을 잃지 않게 함).
 *  · 이후 로컬 변경(오답 추가·저장 토글·삭제)은 1.5초 디바운스로 클라우드에
 *    현재 로컬 배열 전체를 덮어써 미러링한다.
 *  · Firebase SDK 는 gstatic CDN 에서 동적 import 로 로드한다(브라우저에서 실행).
 */
(function () {
  "use strict";

  var CFG = window.FIREBASE_CONFIG || null;
  var CONFIGURED = !!(CFG && CFG.apiKey && CFG.projectId);
  var WRONG_KEY = "jibangse_wrong_v1";
  var SAVED_KEY = "jibangse_saved_v1";
  var SDK = "https://www.gstatic.com/firebasejs/10.12.5/";

  var fb = null;      // { app, auth, db, a: authMod, f: firestoreMod }
  var user = null;
  var initPromise = null;
  var pushTimer = null;
  var syncing = false;

  function loadNotes(k) {
    try { var a = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveNotesRaw(k, a) { try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {} }

  // id 기준 합집합 — 앞(로컬)을 우선해 중복 id 는 로컬 레코드를 유지한다.
  function unionById(a, b) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function (r) {
      if (r && r.id && r.text && !seen[r.id]) { seen[r.id] = 1; out.push(r); }
    });
    return out;
  }

  function notify() { try { window.dispatchEvent(new Event("quizsync")); } catch (e) {} }

  function ensureFb() {
    if (fb) return Promise.resolve(fb);
    if (initPromise) return initPromise;
    if (!CONFIGURED) return Promise.reject(new Error("not-configured"));
    initPromise = Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-auth.js"),
      import(SDK + "firebase-firestore.js")
    ]).then(function (mods) {
      var appMod = mods[0], authMod = mods[1], fsMod = mods[2];
      var app = appMod.initializeApp(CFG);
      var auth = authMod.getAuth(app);
      var db = fsMod.getFirestore(app);
      fb = { app: app, auth: auth, db: db, a: authMod, f: fsMod };
      // 세션 유지 + 로그인 상태 변화 감지
      authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(function () {});
      authMod.onAuthStateChanged(auth, function (u) {
        user = u || null;
        if (user) doSync().catch(function () { notify(); });
        else notify();
      });
      return fb;
    });
    initPromise.catch(function () { initPromise = null; });
    return initPromise;
  }

  function userDoc() { return fb.f.doc(fb.db, "users", user.uid); }

  // 클라우드 ↔ 로컬 병합(합집합) 후 양쪽 반영
  function doSync() {
    if (!fb || !user || syncing) return Promise.resolve();
    syncing = true;
    return fb.f.getDoc(userDoc()).then(function (snap) {
      var cloud = snap && snap.exists() ? (snap.data() || {}) : {};
      var mW = unionById(loadNotes(WRONG_KEY), cloud.wrong || []);
      var mS = unionById(loadNotes(SAVED_KEY), cloud.saved || []);
      saveNotesRaw(WRONG_KEY, mW);
      saveNotesRaw(SAVED_KEY, mS);
      return fb.f.setDoc(userDoc(), { wrong: mW, saved: mS, updated: Date.now() });
    }).then(function () {
      syncing = false;
      notify();
    }).catch(function (e) { syncing = false; throw e; });
  }

  function pushNow() {
    if (!fb || !user) return;
    fb.f.setDoc(userDoc(), {
      wrong: loadNotes(WRONG_KEY),
      saved: loadNotes(SAVED_KEY),
      updated: Date.now()
    }).catch(function () {});
  }

  // ---- public API ----------------------------------------------------------
  window.QUIZ_SYNC = {
    configured: function () { return CONFIGURED; },
    currentUser: function () {
      return user ? { email: user.email, name: user.displayName, uid: user.uid } : null;
    },
    // app.js 가 로컬 기록을 바꿀 때마다 호출 → 디바운스 후 클라우드 반영
    onLocalChange: function () {
      if (!CONFIGURED || !user) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () { if (!syncing) pushNow(); }, 1500);
    },
    signInGoogle: function () {
      return ensureFb().then(function () {
        var provider = new fb.a.GoogleAuthProvider();
        return fb.a.signInWithPopup(fb.auth, provider);
      });
    },
    signInEmail: function (email, pw) {
      return ensureFb().then(function () { return fb.a.signInWithEmailAndPassword(fb.auth, email, pw); });
    },
    registerEmail: function (email, pw) {
      return ensureFb().then(function () { return fb.a.createUserWithEmailAndPassword(fb.auth, email, pw); });
    },
    signOut: function () {
      if (!fb) return Promise.resolve();
      return fb.a.signOut(fb.auth);
    }
  };

  // 설정돼 있으면 로드 시 자동 초기화해 저장된 로그인 세션을 복원한다.
  if (CONFIGURED) ensureFb().catch(function () {});
})();
