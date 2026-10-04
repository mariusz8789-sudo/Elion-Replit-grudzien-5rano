import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, createPasswordReset, getPasswordResetByTokenHash, listAuthAuditEvents, AUTH_AUDIT_KINDS } from './store.mjs';
import { handleApi } from './api.mjs';
import { hashSecret } from './secrets.mjs';
import { createRateLimiter } from './lib.mjs';
import {
  RESET_DELIVERY_STATUS, RESET_REFUSAL_MESSAGE, RESET_TOKEN_STATE, RESET_TOKEN_TTL_MS,
  classifyPasswordReset, deliveryStatus, newPasswordResetToken, parsePasswordResetToken,
} from './passwordReset.mjs';

/**
 * D-166 — reset zapomnianego hasła i zmiana hasła, przez żywy router API i
 * żywą bazę in-memory. Każda własność bezpieczeństwa z briefu ma tu swój test.
 *
 * Tokenu jawnego nie da się odczytać z bazy (taki jest cel), więc testy, które
 * potrzebują ważnego linku, LOSUJĄ go tą samą funkcją co produkcja
 * (`newPasswordResetToken`) i zapisują przez `createPasswordReset` — czyli po
 * dokładnie tej drodze, którą idzie handler. Pełny przebieg od endpointu
 * żądania jest sprawdzony osobno, przez wywołanie echa deweloperskiego.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));

let db;
const ADDRESS = '198.51.100.7';
beforeEach(() => { db = openDatabase(); });
afterEach(() => { delete process.env.GENESIS_PASSWORD_RESET_DEV_ECHO; });

/** Każde wywołanie dostaje świeży limiter, żeby jeden test nie wyczerpał limitu innemu. */
function call(method, pathname, o = {}) {
  return handleApi(db, {
    method,
    pathname,
    token: o.token,
    body: o.body,
    clientAddress: o.clientAddress ?? ADDRESS,
    passwordResetLimiter: o.limiter ?? createRateLimiter({ limit: 100, windowMs: 60_000 }),
  });
}

function register(email, password = 'password123') {
  const r = call('POST', '/api/auth/register', { body: { email, password } });
  assert.equal(r.status, 201, 'rejestracja w przygotowaniu testu musi się udać');
  return r.body;
}

/** Ważny, niezużyty token dla konta — losowany i zapisany tą samą drogą co w handlerze. */
function issueResetFor(userId, { ttlMs = RESET_TOKEN_TTL_MS, now = Date.now() } = {}) {
  const issued = newPasswordResetToken(now, ttlMs);
  createPasswordReset(db, { userId, tokenHash: issued.tokenHash, createdAt: issued.createdAt, expiresAt: issued.expiresAt });
  return issued.token;
}

/** Przechwytuje WSZYSTKO, co kod wypisze na stdout/stderr w trakcie `fn`. */
function captureLogs(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  for (const key of Object.keys(real)) console[key] = (...args) => { lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
  try { return { result: fn(), lines }; } finally { Object.assign(console, real); }
}

describe('D-166 — nie ujawniamy, czy konto istnieje', () => {
  test('żądanie dla istniejącego i nieistniejącego konta zwraca TEN SAM status i TO SAMO ciało', () => {
    register('ktos@lab.org');
    const existing = call('POST', '/api/auth/password-reset/request', { body: { email: 'ktos@lab.org' } });
    const missing = call('POST', '/api/auth/password-reset/request', { body: { email: 'nikogo@lab.org' } });
    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.deepEqual(existing.body, missing.body, 'ciało odpowiedzi różni się — to oraculum o istnieniu konta');
  });

  test('adres bez kształtu adresu też nie wyróżnia się odpowiedzią', () => {
    register('ktos2@lab.org');
    const shaped = call('POST', '/api/auth/password-reset/request', { body: { email: 'ktos2@lab.org' } });
    const garbage = call('POST', '/api/auth/password-reset/request', { body: { email: 'to-nie-jest-adres' } });
    const empty = call('POST', '/api/auth/password-reset/request', { body: {} });
    assert.deepEqual(garbage.body, shaped.body);
    assert.deepEqual(empty.body, shaped.body);
    assert.equal(garbage.status, shaped.status);
    assert.equal(empty.status, shaped.status);
  });

  test('po stronie serwera różnica jest dokładnie jedna: wpis w password_resets dla konta, które istnieje', () => {
    const { user } = register('ktos3@lab.org');
    call('POST', '/api/auth/password-reset/request', { body: { email: 'ktos3@lab.org' } });
    call('POST', '/api/auth/password-reset/request', { body: { email: 'nikogo3@lab.org' } });
    const rows = db.prepare('SELECT user_id FROM password_resets').all();
    assert.deepEqual(rows.map((r) => r.user_id), [user.id]);
  });
});

describe('D-166 — token jednorazowy', () => {
  test('ten sam token drugi raz jest odrzucony, a hasło zostaje tym z pierwszej zmiany', () => {
    const { user } = register('once@lab.org');
    const token = issueResetFor(user.id);
    const first = call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'pierwszeNowe1' } });
    assert.equal(first.status, 200);
    const second = call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'drugieNowe12' } });
    assert.equal(second.status, 400);
    assert.equal(second.body.error, 'invalid_reset_token');
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'once@lab.org', password: 'pierwszeNowe1' } }).status, 201);
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'once@lab.org', password: 'drugieNowe12' } }).status, 401);
  });

  test('udana zmiana unieważnia też KAŻDY inny otwarty link tego konta', () => {
    const { user } = register('many@lab.org');
    const a = issueResetFor(user.id);
    const b = issueResetFor(user.id);
    assert.equal(call('POST', '/api/auth/password-reset/confirm', { body: { token: a, password: 'noweHaslo123' } }).status, 200);
    assert.equal(call('POST', '/api/auth/password-reset/confirm', { body: { token: b, password: 'inneHaslo123' } }).status, 400);
  });
});

describe('D-166 — krótka ważność', () => {
  test('okno ważności jest liczone w minutach, nie w dniach', () => {
    assert.ok(RESET_TOKEN_TTL_MS <= 60 * 60 * 1000, 'token resetu nie ma prawa żyć dłużej niż godzinę');
  });

  test('token po terminie jest odrzucony', () => {
    const { user } = register('stale@lab.org');
    // Wystawiony w przeszłości, z realnym TTL — czyli już wygasły.
    const token = issueResetFor(user.id, { now: Date.now() - RESET_TOKEN_TTL_MS - 1000 });
    const r = call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'noweHaslo123' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_reset_token');
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'stale@lab.org', password: 'noweHaslo123' } }).status, 401, 'wygasły token nie miał prawa zmienić hasła');
  });

  test('klasyfikacja stanu jest czystą funkcją i rozpoznaje każdy stan', () => {
    const now = 1_000_000;
    assert.equal(classifyPasswordReset(null, now), RESET_TOKEN_STATE.UNKNOWN);
    assert.equal(classifyPasswordReset({ usedAt: 5, expiresAt: now + 1 }, now), RESET_TOKEN_STATE.USED);
    assert.equal(classifyPasswordReset({ usedAt: null, expiresAt: now - 1 }, now), RESET_TOKEN_STATE.EXPIRED);
    assert.equal(classifyPasswordReset({ usedAt: null, expiresAt: now + 1 }, now), RESET_TOKEN_STATE.VALID);
  });
});

describe('D-166 — uszkodzony token kończy się czysto', () => {
  test('śmieć w polu tokenu daje jeden spokojny komunikat, bez śladu stosu i bez szczegółu wewnętrznego', () => {
    for (const token of ['', 'abc', 'ZZZ', 'nie-hex-' + 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(65), null, 42, { a: 1 }, ['x']]) {
      const r = call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'noweHaslo123' } });
      assert.equal(r.status, 400, `token ${JSON.stringify(token)} powinien dać 400, nie ${r.status}`);
      assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message'], 'odpowiedź nie ma prawa nieść dodatkowych pól');
      assert.equal(r.body.message, RESET_REFUSAL_MESSAGE);
      const serialized = JSON.stringify(r.body);
      for (const leak of ['at ', 'Error', 'SQLITE', 'sqlite', 'password_resets', 'token_hash', 'SELECT', '.mjs']) {
        assert.ok(!serialized.includes(leak), `odpowiedź zawiera „${leak}" — to szczegół wewnętrzny`);
      }
    }
  });

  test('nieznany, ale poprawnie ukształtowany token daje DOKŁADNIE tę samą odmowę co zużyty i wygasły', () => {
    const { user } = register('same@lab.org');
    const unknown = call('POST', '/api/auth/password-reset/confirm', { body: { token: 'f'.repeat(64), password: 'noweHaslo123' } });
    const expired = call('POST', '/api/auth/password-reset/confirm', { body: { token: issueResetFor(user.id, { now: Date.now() - RESET_TOKEN_TTL_MS - 1 }), password: 'noweHaslo123' } });
    const used = issueResetFor(user.id);
    call('POST', '/api/auth/password-reset/confirm', { body: { token: used, password: 'noweHaslo123' } });
    const reused = call('POST', '/api/auth/password-reset/confirm', { body: { token: used, password: 'jeszczeInne1' } });
    assert.deepEqual(expired.body, unknown.body);
    assert.deepEqual(reused.body, unknown.body);
    assert.equal(expired.status, unknown.status);
    assert.equal(reused.status, unknown.status);
  });

  test('uszkodzony token nie dociera do bazy — parser odrzuca go wcześniej', () => {
    assert.equal(parsePasswordResetToken('nie-token'), null);
    assert.equal(parsePasswordResetToken(undefined), null);
    assert.equal(getPasswordResetByTokenHash(db, 'nie-hash'), null);
  });
});

describe('D-166 — w bazie nie ma jawnego tokenu ani jawnego hasła', () => {
  test('password_resets trzyma wyłącznie SHA-256 tokenu; wartości jawnej nie da się z wiersza odtworzyć', () => {
    const { user } = register('hashed@lab.org');
    const token = issueResetFor(user.id);
    const row = db.prepare('SELECT * FROM password_resets').get();
    assert.equal(row.token_hash, hashSecret(token), 'kolumna musi nieść dokładnie SHA-256 tokenu');
    const dumped = JSON.stringify(row);
    assert.ok(!dumped.includes(token), 'jawny token znalazł się w wierszu bazy');
    assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  });

  test('cały plik bazy po udanym resecie nie zawiera ani tokenu, ani starego, ani nowego hasła', () => {
    const { user } = register('plain@lab.org', 'stareHaslo123');
    const token = issueResetFor(user.id);
    assert.equal(call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'noweHaslo123' } }).status, 200);
    // Zrzut wszystkich wierszy wszystkich tabel, jakie reset dotyka.
    const dump = JSON.stringify({
      users: db.prepare('SELECT * FROM users').all(),
      resets: db.prepare('SELECT * FROM password_resets').all(),
      audit: db.prepare('SELECT * FROM auth_audit_events').all(),
      sessions: db.prepare('SELECT * FROM sessions').all(),
    });
    for (const secret of [token, 'stareHaslo123', 'noweHaslo123']) {
      assert.ok(!dump.includes(secret), `baza zawiera jawne „${secret}"`);
    }
    assert.match(db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash, /^scrypt\$/, 'hasło musi leżeć jako scrypt, nigdy jawnie');
  });

  test('store ODMAWIA zapisania tokenu, który nie jest zahaszowany', () => {
    const { user } = register('guard@lab.org');
    assert.throws(() => createPasswordReset(db, { userId: user.id, tokenHash: 'jawny-token', createdAt: 1, expiresAt: 2 }), /hashed/);
  });
});

describe('D-166 — limit żądań na adres', () => {
  test('po wyczerpaniu limitu endpoint żądania odpowiada 429, tym samym mechanizmem co inne trasy repo', () => {
    register('limit@lab.org');
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push(call('POST', '/api/auth/password-reset/request', { body: { email: 'limit@lab.org' }, limiter }).status);
    assert.deepEqual(statuses, [200, 200, 429, 429]);
  });

  test('limit jest liczony na adres: inny adres ma swój budżet', () => {
    register('limit2@lab.org');
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const body = { email: 'limit2@lab.org' };
    assert.equal(call('POST', '/api/auth/password-reset/request', { body, limiter, clientAddress: '203.0.113.1' }).status, 200);
    assert.equal(call('POST', '/api/auth/password-reset/request', { body, limiter, clientAddress: '203.0.113.1' }).status, 429);
    assert.equal(call('POST', '/api/auth/password-reset/request', { body, limiter, clientAddress: '203.0.113.2' }).status, 200);
  });

  test('odrzucone żądanie nie wystawia tokenu', () => {
    const { user } = register('limit3@lab.org');
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    call('POST', '/api/auth/password-reset/request', { body: { email: 'limit3@lab.org' }, limiter });
    call('POST', '/api/auth/password-reset/request', { body: { email: 'limit3@lab.org' }, limiter });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?').get(user.id).n, 1);
  });
});

describe('D-166 — udany reset i polityka sesji', () => {
  test('nowe hasło działa, stare nie, a wszystkie urządzenia są wylogowane', () => {
    const { user } = register('sess@lab.org', 'stareHaslo123');
    // Rejestracja sama wydaje sesję, więc po trzech logowaniach kont ma ich cztery:
    // cztery zalogowane urządzenia.
    const tokens = [0, 1, 2].map(() => call('POST', '/api/auth/login', { body: { email: 'sess@lab.org', password: 'stareHaslo123' } }).body.token);
    for (const t of tokens) assert.equal(call('GET', '/api/auth/me', { token: t }).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(user.id).n, 4);

    const reset = call('POST', '/api/auth/password-reset/confirm', { body: { token: issueResetFor(user.id), password: 'noweHaslo123' } });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.sessionsRevoked, 4, 'odpowiedź musi powiedzieć, ile sesji przerwała');

    // Polityka sesji po resecie: KAŻDA sesja znika, także ta nieużywana.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(user.id).n, 0);
    for (const t of tokens) assert.equal(call('GET', '/api/auth/me', { token: t }).status, 401, 'sesja sprzed zmiany hasła musi przestać działać');

    assert.equal(call('POST', '/api/auth/login', { body: { email: 'sess@lab.org', password: 'stareHaslo123' } }).status, 401);
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'sess@lab.org', password: 'noweHaslo123' } }).status, 201);
  });

  test('reset NIE loguje automatycznie — odpowiedź nie nosi tokenu sesji', () => {
    const { user } = register('nologin@lab.org');
    const r = call('POST', '/api/auth/password-reset/confirm', { body: { token: issueResetFor(user.id), password: 'noweHaslo123' } });
    assert.equal(r.body.token, undefined);
    assert.equal(r.body.user, undefined);
  });

  test('nowe hasło musi spełnić tę samą politykę co rejestracja', () => {
    const { user } = register('policy@lab.org');
    const token = issueResetFor(user.id);
    const weak = call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'krotkie' } });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error, 'invalid_password');
    const atRegistration = call('POST', '/api/auth/register', { body: { email: 'inny@lab.org', password: 'krotkie' } });
    assert.equal(weak.body.message, atRegistration.body.message, 'próg i komunikat muszą pochodzić z jednej funkcji polityki');
    // Odrzucenie za słabe hasło NIE zużywa tokenu — użytkownik próbuje jeszcze raz.
    assert.equal(call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'dobreHaslo123' } }).status, 200);
  });
});

describe('D-166 — zmiana hasła przez zalogowanego', () => {
  test('wymaga obecnego hasła; przejęta sesja sama nie wystarcza', () => {
    register('change@lab.org', 'stareHaslo123');
    const token = call('POST', '/api/auth/login', { body: { email: 'change@lab.org', password: 'stareHaslo123' } }).body.token;
    const wrong = call('POST', '/api/auth/password', { token, body: { currentPassword: 'zleHaslo1234', newPassword: 'noweHaslo123' } });
    assert.equal(wrong.status, 401);
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'change@lab.org', password: 'stareHaslo123' } }).status, 201, 'nieudana próba nie miała prawa zmienić hasła');
  });

  test('bez sesji zwraca 401, a nie zmianę hasła', () => {
    register('change2@lab.org');
    assert.equal(call('POST', '/api/auth/password', { body: { currentPassword: 'password123', newPassword: 'noweHaslo123' } }).status, 401);
  });

  test('udana zmiana wylogowuje wszystkie urządzenia i wymusza politykę haseł', () => {
    register('change3@lab.org', 'stareHaslo123');
    const a = call('POST', '/api/auth/login', { body: { email: 'change3@lab.org', password: 'stareHaslo123' } }).body.token;
    const b = call('POST', '/api/auth/login', { body: { email: 'change3@lab.org', password: 'stareHaslo123' } }).body.token;
    assert.equal(call('POST', '/api/auth/password', { token: a, body: { currentPassword: 'stareHaslo123', newPassword: 'krotkie' } }).status, 400);
    const r = call('POST', '/api/auth/password', { token: a, body: { currentPassword: 'stareHaslo123', newPassword: 'noweHaslo123' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.sessionsRevoked, 3, 'sesja z rejestracji plus dwa logowania');
    assert.equal(call('GET', '/api/auth/me', { token: a }).status, 401);
    assert.equal(call('GET', '/api/auth/me', { token: b }).status, 401);
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'change3@lab.org', password: 'noweHaslo123' } }).status, 201);
  });

  test('nowe hasło nie może być tym samym, co obecne', () => {
    register('change4@lab.org', 'stareHaslo123');
    const token = call('POST', '/api/auth/login', { body: { email: 'change4@lab.org', password: 'stareHaslo123' } }).body.token;
    assert.equal(call('POST', '/api/auth/password', { token, body: { currentPassword: 'stareHaslo123', newPassword: 'stareHaslo123' } }).status, 400);
  });
});

describe('D-166 — ślad audytowy', () => {
  test('żądanie i zakończenie mają swoje zdarzenia, a ślad nie nosi hasła ani jawnego tokenu', () => {
    const { user } = register('audit@lab.org');
    call('POST', '/api/auth/password-reset/request', { body: { email: 'audit@lab.org' } });
    const token = issueResetFor(user.id);
    call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'noweHaslo123' } });

    const requested = listAuthAuditEvents(db, { kind: AUTH_AUDIT_KINDS.PASSWORD_RESET_REQUESTED });
    const completed = listAuthAuditEvents(db, { kind: AUTH_AUDIT_KINDS.PASSWORD_RESET_COMPLETED });
    assert.equal(requested.length, 1);
    assert.equal(requested[0].outcome, 'ISSUED');
    assert.equal(requested[0].userId, user.id);
    assert.equal(requested[0].detail.delivery, RESET_DELIVERY_STATUS.EXTERNAL_BLOCKED);
    assert.equal(completed.length, 1);
    assert.equal(completed[0].outcome, 'COMPLETED');
    assert.equal(completed[0].detail.sessionsRevoked, 1, 'sesja wydana przy rejestracji została przerwana');

    const dump = JSON.stringify(listAuthAuditEvents(db));
    assert.ok(!dump.includes(token));
    assert.ok(!dump.includes('noweHaslo123'));
  });

  test('żądanie dla adresu bez konta też zostawia ślad — bez user_id', () => {
    call('POST', '/api/auth/password-reset/request', { body: { email: 'widmo@lab.org' } });
    const [event] = listAuthAuditEvents(db, { kind: AUTH_AUDIT_KINDS.PASSWORD_RESET_REQUESTED });
    assert.equal(event.outcome, 'NO_ACCOUNT');
    assert.equal(event.userId, null);
    assert.ok(!JSON.stringify(event).includes('widmo@lab.org'), 'ślad nie powtarza adresu z żądania');
  });

  test('każda odmowa tokenu jest zapisana z powodem — powód zostaje w audycie, nie w odpowiedzi', () => {
    const { user } = register('why@lab.org');
    call('POST', '/api/auth/password-reset/confirm', { body: { token: 'zz', password: 'noweHaslo123' } });
    call('POST', '/api/auth/password-reset/confirm', { body: { token: issueResetFor(user.id, { now: Date.now() - RESET_TOKEN_TTL_MS - 1 }), password: 'noweHaslo123' } });
    const states = listAuthAuditEvents(db, { kind: AUTH_AUDIT_KINDS.PASSWORD_RESET_COMPLETED }).map((e) => e.detail.state).sort();
    assert.deepEqual(states, [RESET_TOKEN_STATE.EXPIRED, RESET_TOKEN_STATE.MALFORMED].sort());
  });

  test('ślad audytowy jest append-only: nie da się zdarzenia przepisać ani usunąć', () => {
    call('POST', '/api/auth/password-reset/request', { body: { email: 'append@lab.org' } });
    assert.throws(() => db.exec("UPDATE auth_audit_events SET outcome = 'ISSUED'"), /append-only/);
    assert.throws(() => db.exec('DELETE FROM auth_audit_events'), /append-only/);
  });
});

describe('D-166 — dostarczenie poczty jest zablokowane zewnętrznie i tak powiedziane', () => {
  test('odpowiedź nosi EXTERNAL_BLOCKED z powodem, nigdy udanej wysyłki', () => {
    register('mail@lab.org');
    const r = call('POST', '/api/auth/password-reset/request', { body: { email: 'mail@lab.org' } });
    assert.equal(r.body.delivery.status, RESET_DELIVERY_STATUS.EXTERNAL_BLOCKED);
    assert.match(r.body.delivery.reason, /dostawcy poczty/);
    assert.deepEqual(r.body.delivery, deliveryStatus());
    const serialized = JSON.stringify(r.body).toLowerCase();
    for (const pretend of ['wysłaliśmy', 'wysłano', 'sent', 'sprawdź skrzynkę']) {
      assert.ok(!serialized.includes(pretend), `odpowiedź udaje wysyłkę słowem „${pretend}"`);
    }
  });

  test('odpowiedź NIGDY nie nosi tokenu — ani dla konta, które istnieje, ani z włączonym echem', () => {
    const { user } = register('noecho@lab.org');
    const plain = call('POST', '/api/auth/password-reset/request', { body: { email: 'noecho@lab.org' } });
    assert.equal(plain.body.token, undefined);
    assert.equal(plain.body.resetToken, undefined);
    process.env.GENESIS_PASSWORD_RESET_DEV_ECHO = '1';
    const echoed = call('POST', '/api/auth/password-reset/request', { body: { email: 'noecho@lab.org' } });
    assert.deepEqual(echoed.body, plain.body, 'echo deweloperskie nie ma prawa zmienić ciała odpowiedzi');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id=?').get(user.id).n, 2);
  });

  test('echo deweloperskie wypisuje token do śladu serwera TYLKO przy jawnie ustawionej zmiennej', () => {
    register('echo@lab.org');
    const silent = captureLogs(() => call('POST', '/api/auth/password-reset/request', { body: { email: 'echo@lab.org' } }));
    assert.deepEqual(silent.lines.filter((l) => l.includes('password_reset_token_echo')), [], 'bez zmiennej środowiskowej token nie wychodzi nigdzie');

    process.env.GENESIS_PASSWORD_RESET_DEV_ECHO = '1';
    const loud = captureLogs(() => call('POST', '/api/auth/password-reset/request', { body: { email: 'echo@lab.org' } }));
    const echo = loud.lines.find((l) => l.includes('password_reset_token_echo_dev_only'));
    assert.ok(echo, 'z włączoną zmienną token musi dać się odczytać ze śladu serwera');
    const token = JSON.parse(echo).token;
    // I to jest prawdziwy, działający token — dowód, że pełny przebieg od
    // endpointu żądania aż do zmiany hasła działa bez dostawcy poczty.
    const done = call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'noweHaslo123' } });
    assert.equal(done.status, 200);
    assert.equal(call('POST', '/api/auth/login', { body: { email: 'echo@lab.org', password: 'noweHaslo123' } }).status, 201);
  });
});

describe('D-166 — hasło nie trafia do żadnego śladu', () => {
  test('ani żądanie resetu, ani zmiana hasła, ani logowanie nie wypisują hasła na wyjście', () => {
    register('quiet@lab.org', 'stareHaslo123');
    process.env.GENESIS_PASSWORD_RESET_DEV_ECHO = '1';
    const { user } = { user: db.prepare('SELECT id FROM users WHERE email=?').get('quiet@lab.org') };
    const { lines } = captureLogs(() => {
      call('POST', '/api/auth/login', { body: { email: 'quiet@lab.org', password: 'stareHaslo123' } });
      call('POST', '/api/auth/password-reset/request', { body: { email: 'quiet@lab.org' } });
      const token = issueResetFor(user.id);
      call('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'noweHaslo123' } });
      const t = call('POST', '/api/auth/login', { body: { email: 'quiet@lab.org', password: 'noweHaslo123' } }).body.token;
      call('POST', '/api/auth/password', { token: t, body: { currentPassword: 'noweHaslo123', newPassword: 'trzecieHaslo1' } });
    });
    const all = lines.join('\n');
    for (const secret of ['stareHaslo123', 'noweHaslo123', 'trzecieHaslo1']) {
      assert.ok(!all.includes(secret), `hasło „${secret}" trafiło na wyjście serwera`);
    }
  });

  test('żaden handler haseł nie woła niczego, co wygląda na telemetrię albo log z ciałem żądania', () => {
    const source = readFileSync(path.join(SRC, 'api.mjs'), 'utf8');
    const section = source.slice(source.indexOf('/* ---------------- Reset zapomnianego hasła'), source.indexOf('/* ---------------- Handlery projektów'));
    assert.ok(section.length > 500, 'test musi widzieć realny fragment kodu, inaczej nic nie sprawdza');
    // Jedyne wyjście w tej sekcji to echo deweloperskie; każde inne console.*
    // albo wysyłka gdziekolwiek jest tu błędem, nie stylem.
    const consoleCalls = section.match(/console\.\w+\(/g) ?? [];
    assert.equal(consoleCalls.length, 1, `sekcja resetu hasła woła console ${consoleCalls.length} razy — dozwolone jest wyłącznie echo deweloperskie`);
    for (const forbidden of ['fetch(', 'track(', 'telemetry', 'analytics', 'sendBeacon', 'localStorage', 'writeFile']) {
      assert.ok(!section.includes(forbidden), `sekcja resetu hasła odwołuje się do „${forbidden}"`);
    }
  });
});

describe('D-166 — ochrona tras zmieniających stan odpowiada wzorcowi repo', () => {
  test('API nie czyta ani nie wystawia ciasteczek, więc nie ma poświadczenia ambientowego, którym można by sfałszować żądanie', () => {
    // To JEST wzorzec tego repo: uwierzytelnianie nagłówkiem `Authorization:
    // Bearer`, zero ciasteczek sesyjnych. Obca strona nie może ustawić tego
    // nagłówka na cudze konto, więc trasy zmieniające stan nie potrzebują
    // osobnego tokenu CSRF — i żadnego nie wprowadzamy. Ten test pilnuje
    // założenia: gdyby ktoś dodał sesję w ciasteczku, test padnie i wymusi
    // decyzję o CSRF razem z nią.
    for (const file of ['api.mjs', 'server.mjs']) {
      const source = readFileSync(path.join(SRC, file), 'utf8');
      assert.ok(!/set-cookie/i.test(source), `${file} wystawia ciasteczko — wraz z nim trzeba zaprojektować ochronę CSRF`);
      assert.ok(!/headers\s*\[\s*['"]cookie['"]\s*\]|req\.cookies/i.test(source), `${file} czyta ciasteczko — patrz wyżej`);
    }
    // Zmiana hasła wymaga tokenu podanego JAWNIE przez klienta w nagłówku.
    register('bearer@lab.org', 'stareHaslo123');
    assert.equal(call('POST', '/api/auth/password', { body: { currentPassword: 'stareHaslo123', newPassword: 'noweHaslo123' } }).status, 401);
  });

  test('reset przyjmuje wyłącznie POST', () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      assert.equal(call(method, '/api/auth/password-reset/request', { body: { email: 'x@y.pl' } }).status, 404);
      assert.equal(call(method, '/api/auth/password-reset/confirm', { body: {} }).status, 404);
      assert.equal(call(method, '/api/auth/password', { body: {} }).status, 404);
    }
  });
});
