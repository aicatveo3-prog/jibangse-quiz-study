/* 로그인 동기화 설정 (선택 기능)
 * ─────────────────────────────────────────────────────────────
 * 이 값이 null 이면 앱은 "로그인 없이 로컬 저장"으로만 동작한다.
 * 아래 window.FIREBASE_CONFIG 에 실제 설정이 들어 있으면
 * 구글·이메일 로그인 + 기기 간 동기화(진도·체크리스트·오답노트·저장함)가 켜진다.
 *
 * ┌─ Firestore 보안 규칙 (복붙용) ────────────────────────────────────────────┐
 * │ Firebase 콘솔 → Firestore Database → 규칙(Rules) 탭에 아래를 붙여넣고 게시  │
 * │ 이 앱은 users/{uid} 문서 하나에 기록을 저장하므로 그 문서를 본인만 접근하게  │
 * │ 제한한다. (하위 문서까지 함께 허용해 두어 이후 확장에도 안전)                │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId} {
 *         allow read, write: if request.auth != null && request.auth.uid == userId;
 *         match /{document=**} {
 *           allow read, write: if request.auth != null && request.auth.uid == userId;
 *         }
 *       }
 *     }
 *   }
 *
 * 승인된 도메인: Authentication > 설정 > 승인된 도메인에
 *   aicatveo3-prog.github.io  및  localhost  가 있어야 한다.
 *
 * ※ 아래 설정값(apiKey 등)은 비밀번호가 아니라 공개용 식별자다.
 *   실제 보안은 위 Firestore 규칙 + 승인된 도메인이 담당하므로 커밋해도 안전하다.
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyATW1oRlc4ghsxftvYsNUPfhqOE-uZ4gFY",
  authDomain: "jibangse-quiz.firebaseapp.com",
  projectId: "jibangse-quiz",
  storageBucket: "jibangse-quiz.firebasestorage.app",
  messagingSenderId: "279996309805",
  appId: "1:279996309805:web:50c29a68ce14475620b3a4",
  measurementId: "G-QF3374ET5F"
};
