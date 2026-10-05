# 반짝반짝 할 일표

자녀별 반복 일정을 관리하고, 날짜별 완료와 별 적립 기록을 가족 기기 간 공유하는 정적 웹앱입니다. 프런트엔드는 GitHub Pages, 인증과 데이터 저장은 Supabase를 사용합니다.

## Supabase 설정

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql` 내용을 실행하기 전에 `ADMIN_EMAIL_HERE`를 관리자 계정 이메일로 바꿉니다.
2. Supabase Dashboard의 Authentication > Users에서 같은 이메일의 관리자 사용자를 만들고 이메일을 확인(Confirm)합니다. 공개 회원 가입은 사용하지 마세요.
3. `supabase-config.js`의 `YOUR_SUPABASE_PROJECT_URL`과 `YOUR_SUPABASE_ANON_KEY`를 Supabase Project URL과 anon/public 키로 바꿉니다. 이 두 값은 정적 웹앱에 포함되는 공개 설정입니다. `service_role` 키는 절대 넣지 마세요.
4. Supabase Authentication > URL Configuration에서 Site URL과 Redirect URLs에 GitHub Pages 주소를 등록합니다. 기본 주소는 `https://ehdro82.github.io/TodoList/`입니다.
5. GitHub 저장소 `Ehdro82/TodoList`에 기본 브랜치 `main`으로 파일을 push합니다.
6. 저장소 Settings > Pages에서 Build and deployment의 Source를 **GitHub Actions**로 설정합니다. `.github/workflows/pages.yml`이 사이트를 배포합니다.
7. Actions 탭의 배포가 완료되면 `https://ehdro82.github.io/TodoList/`에서 접속합니다.

Supabase `family_state`에는 자녀와 반복 일정이 저장되고, `task_completions`에는 날짜별 완료 및 당시 적립된 별이 기록됩니다. Row Level Security는 관리자 이메일로 로그인한 사용자만 자녀·일정을 변경하도록 제한하고, 공개 화면은 일정 조회와 검증된 완료 체크만 할 수 있습니다.

## 기존 로컬 데이터

기존 PowerShell/JSON 로컬 서버 데이터는 GitHub Pages에 자동 업로드되지 않습니다. `data/family-data.json`에 기존 데이터가 있다면 내용을 안전하게 백업한 후, Supabase SQL Editor에서 `family_state`의 `children`과 `tasks` 값을 해당 JSON의 배열로 옮기고 `version`을 0으로 설정하세요. 과거 별 적립 기록은 `task_completions` 테이블에 `child_id`, `task_id`, `completion_date`, `earned_stars` 행으로 가져옵니다. 개인 정보가 들어 있는 데이터 파일을 GitHub 저장소에 업로드하지 마세요.

## 주의

자녀 이름, 일정, 별 적립 기록은 로그인하지 않은 방문자도 읽을 수 있도록 공개되어 있으니 민감한 개인정보를 입력하지 마세요. 자녀별 로그인 기능은 없으므로 링크에 접근할 수 있는 누구나 자녀를 선택하고 완료 기록을 체크하거나 취소할 수 있습니다. 완료 기록 작성은 반복 주기와 별 보상을 데이터베이스 함수에서 다시 확인합니다. 관리자 변경에는 지정된 관리자 이메일과 비밀번호 로그인이 필요합니다.
