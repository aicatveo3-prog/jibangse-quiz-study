/* 로그인 동기화 설정 (선택 기능)
 * ─────────────────────────────────────────────────────────────
 * 이 값이 null 이면 앱은 "로그인 없이 로컬 저장"으로만 동작한다.
 * 구글·이메일 로그인 + 기기 간 동기화를 켜려면 아래 순서로 설정한다.
 *
 * 1) https://console.firebase.google.com 에서 프로젝트 생성
 * 2) 빌드 > Authentication > 시작하기 → 로그인 방법에서
 *      · Google  · 이메일/비밀번호  두 가지를 "사용 설정"
 * 3) 빌드 > Firestore Database > 데이터베이스 만들기(프로덕션 모드)
 *    규칙(Rules)을 아래로 저장 — 본인 문서만 읽고 쓰게 제한:
 *      rules_version = '2';
 *      service cloud.firestore {
 *        match /databases/{db}/documents {
 *          match /users/{uid} {
 *            allow read, write: if request.auth != null && request.auth.uid == uid;
 *          }
 *        }
 *      }
 * 4) Authentication > 설정 > 승인된 도메인에 배포 도메인 추가
 *      (예: aicatveo3-prog.github.io  및 localhost)
 * 5) 프로젝트 설정 > 내 앱 > 웹 앱(</>) 등록 후 나오는 firebaseConfig 값을
 *    아래 window.FIREBASE_CONFIG 에 그대로 붙여넣는다.
 *
 * ※ 이 설정값(apiKey 등)은 비밀번호가 아니라 공개용 식별자다.
 *   실제 보안은 위 Firestore 규칙 + 승인된 도메인이 담당하므로
 *   이 파일을 저장소에 커밋해도 안전하다.
 */
window.FIREBASE_CONFIG = null;

/* 설정 예시 — 위 5)에서 받은 값으로 아래를 대체하고 null 줄을 지운다:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "0000000000",
  appId: "1:0000000000:web:abcdef"
};
*/
