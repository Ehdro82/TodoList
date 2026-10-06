# 반짝반짝 할 일표

자녀별 반복 일정을 관리하고, 날짜별 완료와 별 적립·차감 기록을 가족 기기 간 공유하는 정적 웹앱입니다. 프런트엔드는 GitHub Pages, 인증과 데이터 저장은 Supabase를 사용합니다.

## Supabase 설정

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql` 내용을 실행하기 전에 `ADMIN_EMAIL_HERE`를 관리자 계정 이메일로 바꿉니다. 이미 설정한 프로젝트라면 같은 스크립트를 다시 실행해 독서 기록 및 관리자 별 차감 기능을 추가하세요.
2. Supabase Dashboard의 Authentication > Users에서 같은 이메일의 관리자 사용자를 만들고 이메일을 확인(Confirm)합니다. 공개 회원 가입은 사용하지 마세요.
3. `supabase-config.js`의 `YOUR_SUPABASE_PROJECT_URL`과 `YOUR_SUPABASE_ANON_KEY`를 Supabase Project URL과 anon/public 키로 바꿉니다. 이 두 값은 정적 웹앱에 포함되는 공개 설정입니다. `service_role` 키는 절대 넣지 마세요.
4. Supabase Authentication > URL Configuration에서 Site URL과 Redirect URLs에 GitHub Pages 주소를 등록합니다. 기본 주소는 `https://ehdro82.github.io/TodoList/`입니다.
5. GitHub 저장소 `Ehdro82/TodoList`에 기본 브랜치 `main`으로 파일을 push합니다.
6. 저장소 Settings > Pages에서 Build and deployment의 Source를 **GitHub Actions**로 설정합니다. `.github/workflows/pages.yml`이 사이트를 배포합니다.
7. Actions 탭의 배포가 완료되면 `https://ehdro82.github.io/TodoList/`에서 접속합니다.
8. 홈페이지에서 **자녀별 보기**를 선택하고 자녀를 고른 뒤, **독서 기록** 탭에서 해당 날짜의 독서 기록을 관리합니다. 기존 독서 기록 전용 페이지도 `https://ehdro82.github.io/TodoList/BookList/`에서 계속 이용할 수 있습니다.

Supabase `family_state`에는 자녀와 반복 일정이 저장되고, `task_completions`에는 날짜별 완료 및 당시 적립된 별이 기록됩니다. `star_deductions`에는 관리자 별 차감 개수와 사유가 저장되며, 자녀별 누적 별은 적립된 별에서 차감 내역을 뺀 값입니다. 차감은 관리자 이메일로 인증한 RPC에서 보유 별을 초과하지 않는지 확인합니다. `child_credentials`에는 bcrypt 해시만 저장되며 PIN 원문은 공개 데이터에 포함되지 않습니다. 자녀는 관리자 화면에서 등록할 때 숫자 4자리 PIN을 설정하고, 자녀별 보기에서 PIN을 입력해야 할 일을 체크할 수 있습니다. PIN은 로그인한 자녀가 변경하거나 관리자가 자녀 정보를 편집하며 재설정할 수 있습니다. PIN을 5회 연속 틀리면 해당 자녀의 인증이 5분간 잠기고, 인증 세션은 최대 8시간 유지되며 브라우저를 새로 열면 다시 PIN을 입력해야 합니다. 완료 기록 RPC도 PIN 인증 세션을 확인하므로 화면의 체크박스 잠금뿐 아니라 데이터베이스에서도 미인증 변경을 거부합니다.

독서 기록은 `book_reading_records`에 날짜, 자녀, 책 제목, 시작·끝 페이지를 저장합니다. 자녀는 기록을 추가·수정·삭제할 때 해당 자녀의 4자리 PIN을 입력해야 합니다. 기록 조회는 가족 앱의 기존 공개 읽기 정책과 동일하게 공개되어 있으므로, 민감한 정보를 책 제목에 입력하지 마세요. 이미 사용 중인 프로젝트는 SQL Editor에서 `supabase/schema.sql` 전체를 다시 실행해 독서 기록과 별 차감 테이블·RPC를 추가하세요. 별 차감 상세 사유는 관리자 계정만 조회할 수 있으며, 자녀 화면에는 차감 총계만 제공됩니다.

Row Level Security는 관리자 이메일로 로그인한 사용자만 자녀·일정을 변경하거나 별을 차감하도록 제한합니다. 관리자 메뉴의 독서 캘린더에서는 월별 자녀 독서 기록을 색상별로 확인할 수 있습니다. 별 표시는 선택한 날짜가 속한 월요일~일요일의 주간 별과 차감 내역을 반영한 누적 별을 `주간 / 누적` 순서로 표시합니다.

## 기존 로컬 데이터

기존 PowerShell/JSON 로컬 서버 데이터는 GitHub Pages에 자동 업로드되지 않습니다. `data/family-data.json`에 기존 데이터가 있다면 내용을 안전하게 백업한 후, Supabase SQL Editor에서 `family_state`의 `children`과 `tasks` 값을 해당 JSON의 배열로 옮기고 `version`을 0으로 설정하세요. 과거 별 적립 기록은 `task_completions` 테이블에 `child_id`, `task_id`, `completion_date`, `earned_stars` 행으로 가져옵니다. 개인 정보가 들어 있는 데이터 파일을 GitHub 저장소에 업로드하지 마세요.

## 주의

자녀 이름, 일정, 별 적립 기록은 로그인하지 않은 방문자도 읽을 수 있도록 공개되어 있으니 민감한 개인정보를 입력하지 마세요. 자녀 PIN은 체크 권한 제어용으로, 민감한 데이터 보호를 위한 계정 인증 수단을 대체하지 않습니다. 완료 기록 작성 시 PIN 인증 세션과 반복 주기, 별 보상을 데이터베이스 함수에서 다시 확인합니다. 관리자 변경에는 지정된 관리자 이메일과 비밀번호 로그인이 필요합니다.
