// netlify/functions/api.js
// 환경변수 (Netlify 대시보드에서 설정):
//   GITHUB_TOKEN   : GitHub Personal Access Token
//   ADMIN_PASSWORD : 관리자 페이지 비밀번호
//   GITHUB_REPO    : redchupa/studyroom

const REPO       = process.env.GITHUB_REPO    || 'redchupa/studyroom';
const TOKEN      = process.env.GITHUB_TOKEN;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

const GH_API = `https://api.github.com/repos/${REPO}/contents`;

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type'                : 'application/json',
};

// ── GitHub 파일 읽기 ─────────────────────────────────────
async function ghGet(path) {
  const res = await fetch(`${GH_API}/${path}`, {
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept       : 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub GET 실패: ${res.status}`);
  const json = await res.json();
  const content = Buffer.from(json.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  return { data: JSON.parse(content), sha: json.sha };
}

// ── GitHub 파일 쓰기 ─────────────────────────────────────
async function ghPut(path, data, sha, message) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const res = await fetch(`${GH_API}/${path}`, {
    method : 'PUT',
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept       : 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, content, sha }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub PUT 실패: ${res.status}`);
  }
  const json = await res.json();
  return json.content.sha;
}

// ── 날짜 유틸 ────────────────────────────────────────────
function todayKST() {
  // KST = UTC+9
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function timeKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
}

// ── 랜덤 코드 생성 (4자리 영대문자+숫자) ──────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── 자정 초기화 ─────────────────────────────────────────
function resetIfNewDay(seats) {
  const today = todayKST();
  if (seats.date !== today) return { date: today, seats: [] };
  return seats;
}

// ════════════════════════════════════════════════════════
//  메인 핸들러
// ════════════════════════════════════════════════════════
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const ok  = (d)    => ({ statusCode: 200, headers: CORS, body: JSON.stringify(d) });
  const err = (m, c=400) => ({ statusCode: c, headers: CORS, body: JSON.stringify({ error: m }) });

  if (!TOKEN) return err('서버 환경변수(GITHUB_TOKEN)가 설정되지 않았습니다.', 500);

  const action = event.queryStringParameters?.action;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) {}

  try {

    // ── 1. 좌석 현황 조회 ────────────────────────────────
    if (action === 'getSeats') {
      const { data, sha } = await ghGet('seats.json');
      const fresh = resetIfNewDay(data);
      // 날짜가 바뀌었으면 자동 저장
      if (fresh.date !== data.date) {
        await ghPut('seats.json', fresh, sha, `auto-reset ${fresh.date}`);
      }
      return ok(fresh);
    }

    // ── 2. 명부 등록 ─────────────────────────────────────
    if (action === 'register') {
      const { name, unit, code } = body;
      if (!name || !unit || !code) return err('이름, 동호수, 코드를 모두 입력하세요.');

      // 코드 검증
      const { data: codeData, sha: codeSha } = await ghGet('codes.json');
      const codeEntry = codeData.codes.find(c => c.code === code.toUpperCase());
      if (!codeEntry) return err('유효하지 않은 코드입니다. 관리사무소에서 발급받은 코드를 입력하세요.');

      // 좌석 등록
      const { data: seatData, sha: seatSha } = await ghGet('seats.json');
      const fresh = resetIfNewDay(seatData);
      if (fresh.seats.length >= 5) return err('오늘 정원(5명)이 마감되었습니다.');

      fresh.seats.push({ name, unit, time: timeKST() });
      await ghPut('seats.json', fresh, seatSha, `register ${name} ${fresh.date}`);

      // 사용된 코드 삭제 (1회용)
      codeData.codes = codeData.codes.filter(c => c.code !== code.toUpperCase());
      await ghPut('codes.json', codeData, codeSha, `use code ${code}`);

      return ok({ success: true, seats: fresh });
    }

    // ── 3. 명부 삭제 (퇴실) ──────────────────────────────
    if (action === 'deleteEntry') {
      const { name, unit, time } = body;
      if (!name || !unit) return err('삭제할 항목 정보가 없습니다.');

      const { data, sha } = await ghGet('seats.json');
      const before = data.seats.length;
      data.seats = data.seats.filter(s => !(s.name === name && s.unit === unit && s.time === time));
      if (data.seats.length === before) return err('해당 항목을 찾을 수 없습니다.');

      await ghPut('seats.json', data, sha, `exit ${name} ${data.date}`);
      return ok({ success: true, seats: data });
    }

    // ══ 관리자 전용 ══════════════════════════════════════

    // ── 4. 관리자 로그인 검증 ─────────────────────────────
    if (action === 'adminLogin') {
      const { password } = body;
      if (!ADMIN_PASS) return err('서버에 ADMIN_PASSWORD가 설정되지 않았습니다.', 500);
      if (password !== ADMIN_PASS) return err('비밀번호가 틀렸습니다.', 401);
      return ok({ success: true });
    }

    // ── 이하 관리자 인증 필요 ─────────────────────────────
    const { adminPassword } = body;
    if (adminPassword !== ADMIN_PASS) return err('관리자 인증 실패', 401);

    // ── 5. 코드 목록 조회 ────────────────────────────────
    if (action === 'getCodes') {
      const { data } = await ghGet('codes.json');
      return ok(data);
    }

    // ── 6. 코드 생성 ─────────────────────────────────────
    if (action === 'createCode') {
      const { memo } = body; // 예: 입주민 동호수 메모
      const { data, sha } = await ghGet('codes.json');

      // 코드 중복 방지 (최대 10회 시도)
      let code;
      const existing = data.codes.map(c => c.code);
      for (let i = 0; i < 10; i++) {
        code = genCode();
        if (!existing.includes(code)) break;
      }

      data.codes.push({
        code,
        memo  : memo || '',
        created: todayKST() + ' ' + timeKST(),
      });
      await ghPut('codes.json', data, sha, `create code ${code}`);
      return ok({ success: true, code, codes: data });
    }

    // ── 7. 코드 삭제 (관리자 강제 삭제) ──────────────────
    if (action === 'deleteCode') {
      const { code } = body;
      if (!code) return err('삭제할 코드를 지정하세요.');
      const { data, sha } = await ghGet('codes.json');
      data.codes = data.codes.filter(c => c.code !== code);
      await ghPut('codes.json', data, sha, `delete code ${code}`);
      return ok({ success: true, codes: data });
    }

    // ── 8. 좌석 강제 초기화 (관리자) ─────────────────────
    if (action === 'resetSeats') {
      const { data, sha } = await ghGet('seats.json');
      const reset = { date: todayKST(), seats: [] };
      await ghPut('seats.json', reset, sha, `admin reset ${reset.date}`);
      return ok({ success: true });
    }

    return err('알 수 없는 action입니다.');

  } catch (e) {
    console.error(e);
    return err(e.message || '서버 오류', 500);
  }
};
