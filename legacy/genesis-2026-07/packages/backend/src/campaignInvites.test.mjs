/**
 * Zaproszenia oczekujące (v28) — dopuszczenie do wspólnej pracy kogoś, kto NIE MA
 * jeszcze konta Genesis. Do tej pory POST /members zwracał 404 dla nieznanego
 * adresu, więc jedyna droga do współpracownika prowadziła poza produkt.
 *
 * Testowany jest cały łuk: zaproszenie → link → rejestracja → automatyczne
 * członkostwo → widoczna wspólna kampania, oraz reguły bezpieczeństwa, które
 * muszą przy tym zostać nienaruszone (kto zaprasza, kto odwołuje, czego token
 * z linku NIE ujawnia).
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createSession, listCampaignInvites, claimInvitesForUser, getCampaignInviteByToken } from './store.mjs';
import { hashPassword, generateToken } from './auth.mjs';
import { handleApi } from './api.mjs';

let db;
beforeEach(() => { db = openDatabase(); });

const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });

function seed(email) {
  const u = createUser(db, { email, displayName: email, passwordHash: hashPassword('pw12345678') });
  const token = generateToken();
  createSession(db, { userId: u.id, token, ttlMs: 1e9 });
  return { u, token };
}

/** Właściciel z jedną kampanią — punkt wyjścia każdego scenariusza. */
function ownerWithCampaign(email = 'owner@lab.io', name = 'Walidacja fizyki') {
  const { u, token } = seed(email);
  call('PUT', '/api/campaigns/camp1', { token, body: { campaign: { name, status: 'ACTIVE', molecules: [] } } });
  return { u, token };
}

const invite = (token, email, role = 'collaborator') =>
  call('POST', '/api/campaigns/camp1/members', { token, body: { email, role } });

describe('zapraszanie adresu bez konta', () => {
  test('tworzy zaproszenie oczekujące zamiast błędu 404', () => {
    const { token } = ownerWithCampaign();
    const r = invite(token, 'fizyk@uni.edu.pl');
    assert.equal(r.status, 201);
    assert.equal(r.body.invite.email, 'fizyk@uni.edu.pl');
    assert.equal(r.body.invite.role, 'collaborator');
    assert.ok(r.body.invite.token, 'zaproszenie musi mieć token do linku');
    assert.equal(r.body.invite.acceptedAt, null);
  });

  test('adres jest normalizowany, a ponowne zaproszenie aktualizuje rolę zamiast duplikować', () => {
    const { token } = ownerWithCampaign();
    invite(token, '  Fizyk@UNI.edu.pl  ', 'viewer');
    const second = invite(token, 'fizyk@uni.edu.pl', 'collaborator');
    assert.equal(second.status, 201);
    const pending = listCampaignInvites(db, 'camp1');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].email, 'fizyk@uni.edu.pl');
    assert.equal(pending[0].role, 'collaborator');
  });

  test('istniejące konto nadal daje natychmiastowe członkostwo, nie zaproszenie', () => {
    const { token } = ownerWithCampaign();
    seed('kolega@lab.io');
    const r = invite(token, 'kolega@lab.io');
    assert.equal(r.status, 201);
    assert.ok(r.body.member, 'znany adres → od razu członek');
    assert.equal(r.body.invite, undefined);
    assert.equal(listCampaignInvites(db, 'camp1').length, 0);
  });

  test('GET /members pokazuje oczekujące zaproszenia obok członków', () => {
    const { token } = ownerWithCampaign();
    invite(token, 'fizyk@uni.edu.pl');
    const r = call('GET', '/api/campaigns/camp1/members', { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.members.length, 0);
    assert.equal(r.body.invites.length, 1);
    assert.equal(r.body.invites[0].email, 'fizyk@uni.edu.pl');
  });

  test('tylko właściciel może zapraszać', () => {
    const { token } = ownerWithCampaign();
    const outsider = seed('obcy@lab.io');
    assert.equal(invite(outsider.token, 'ktos@uni.edu.pl').status, 404); // brak dostępu do kampanii
    invite(token, 'wspolpracownik@lab.io');
    // Zaproszony współpracownik po rejestracji także nie może zapraszać dalej.
    const joined = call('POST', '/api/auth/register', { body: { email: 'wspolpracownik@lab.io', password: 'password123' } }).body;
    assert.equal(invite(joined.token, 'ktos-jeszcze@uni.edu.pl').status, 403);
  });

  test('odrzuca pusty adres i nieznaną rolę', () => {
    const { token } = ownerWithCampaign();
    assert.equal(invite(token, '   ').status, 400);
    assert.equal(invite(token, 'x@uni.edu.pl', 'admin').status, 400);
  });
});

describe('rejestracja realizuje zaproszenie', () => {
  test('zaproszony rejestruje się i od razu widzi wspólną kampanię', () => {
    const { token } = ownerWithCampaign('owner@lab.io', 'Walidacja fizyki');
    invite(token, 'fizyk@uni.edu.pl', 'collaborator');

    const reg = call('POST', '/api/auth/register', { body: { email: 'fizyk@uni.edu.pl', password: 'password123' } });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.claimedInvites.length, 1);
    assert.equal(reg.body.claimedInvites[0].campaignId, 'camp1');

    // Kampania jest na jego liście natychmiast po założeniu konta — bez kolejnego kroku.
    const list = call('GET', '/api/campaigns', { token: reg.body.token });
    assert.equal(list.body.campaigns.length, 1);
    assert.equal(list.body.campaigns[0].name, 'Walidacja fizyki');

    // …i realnie może ją otworzyć, a zaproszenie nie jest już oczekujące.
    assert.equal(call('GET', '/api/campaigns/camp1', { token: reg.body.token }).status, 200);
    assert.equal(listCampaignInvites(db, 'camp1').length, 0);
  });

  test('rola z zaproszenia jest zachowana — widz nie może zapisywać', () => {
    const { token } = ownerWithCampaign();
    invite(token, 'widz@uni.edu.pl', 'viewer');
    const reg = call('POST', '/api/auth/register', { body: { email: 'widz@uni.edu.pl', password: 'password123' } });
    assert.equal(reg.body.claimedInvites[0].role, 'viewer');
    assert.equal(call('GET', '/api/campaigns/camp1', { token: reg.body.token }).status, 200);
    const write = call('PUT', '/api/campaigns/camp1', { token: reg.body.token, body: { campaign: { name: 'Przejęte' } } });
    assert.equal(write.status, 403);
  });

  test('jedna rejestracja realizuje zaproszenia z wielu kampanii', () => {
    const { token } = ownerWithCampaign();
    call('PUT', '/api/campaigns/camp2', { token, body: { campaign: { name: 'Druga', molecules: [] } } });
    invite(token, 'fizyk@uni.edu.pl');
    call('POST', '/api/campaigns/camp2/members', { token, body: { email: 'fizyk@uni.edu.pl', role: 'viewer' } });
    const reg = call('POST', '/api/auth/register', { body: { email: 'fizyk@uni.edu.pl', password: 'password123' } });
    assert.equal(reg.body.claimedInvites.length, 2);
    assert.equal(call('GET', '/api/campaigns', { token: reg.body.token }).body.campaigns.length, 2);
  });

  test('rejestracja bez zaproszeń nie zmienia kształtu odpowiedzi', () => {
    const reg = call('POST', '/api/auth/register', { body: { email: 'sam@lab.io', password: 'password123' } });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token);
    assert.equal(reg.body.claimedInvites, undefined);
  });

  test('zaproszenie do skasowanej kampanii jest sprzątane, nie tworzy sieroty', () => {
    const { token } = ownerWithCampaign();
    invite(token, 'fizyk@uni.edu.pl');
    call('DELETE', '/api/campaigns/camp1', { token });
    const claimed = claimInvitesForUser(db, { email: 'fizyk@uni.edu.pl', userId: 'nowy-user' });
    assert.equal(claimed.length, 0);
    assert.equal(listCampaignInvites(db, 'camp1').length, 0);
  });
});

describe('link zapraszający (podgląd bez uwierzytelnienia)', () => {
  test('pokazuje kto zaprasza i do czego — bez tokenu sesji', () => {
    const { token } = ownerWithCampaign('anna@lab.io', 'Walidacja fizyki');
    const inviteToken = invite(token, 'fizyk@uni.edu.pl').body.invite.token;
    const r = call('GET', `/api/invites/${inviteToken}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.invite.campaignName, 'Walidacja fizyki');
    assert.equal(r.body.invite.invitedByName, 'anna@lab.io');
    assert.equal(r.body.invite.role, 'collaborator');
  });

  test('token z linku nie ujawnia zawartości kampanii ani identyfikatorów', () => {
    const { token } = ownerWithCampaign();
    const inviteToken = invite(token, 'fizyk@uni.edu.pl').body.invite.token;
    const body = call('GET', `/api/invites/${inviteToken}`).body.invite;
    assert.equal(body.campaignId, undefined);
    assert.equal(body.molecules, undefined);
    assert.equal(body.invitedBy, undefined);
    // …i nie działa jako poświadczenie dostępu do samej kampanii.
    assert.equal(call('GET', '/api/campaigns/camp1', { token: inviteToken }).status, 401);
  });

  test('nieznany token → 404, zrealizowany → 410', () => {
    const { token } = ownerWithCampaign();
    assert.equal(call('GET', '/api/invites/nie-ma-takiego').status, 404);
    const inviteToken = invite(token, 'fizyk@uni.edu.pl').body.invite.token;
    call('POST', '/api/auth/register', { body: { email: 'fizyk@uni.edu.pl', password: 'password123' } });
    assert.equal(call('GET', `/api/invites/${inviteToken}`).status, 410);
  });
});

describe('odwoływanie zaproszenia', () => {
  test('właściciel odwołuje — adres traci obietnicę dostępu', () => {
    const { token } = ownerWithCampaign();
    const inv = invite(token, 'fizyk@uni.edu.pl').body.invite;
    assert.equal(call('DELETE', `/api/campaigns/camp1/invites/${inv.id}`, { token }).status, 200);
    assert.equal(listCampaignInvites(db, 'camp1').length, 0);
    assert.equal(getCampaignInviteByToken(db, inv.token), null);
    // Rejestracja po odwołaniu nie daje już żadnego dostępu.
    const reg = call('POST', '/api/auth/register', { body: { email: 'fizyk@uni.edu.pl', password: 'password123' } });
    assert.equal(reg.body.claimedInvites, undefined);
    assert.equal(call('GET', '/api/campaigns/camp1', { token: reg.body.token }).status, 404);
  });

  test('nie-właściciel nie odwoła, a obce id zaproszenia daje 404', () => {
    const { token } = ownerWithCampaign();
    const inv = invite(token, 'fizyk@uni.edu.pl').body.invite;
    invite(token, 'wspolpracownik@lab.io');
    const joined = call('POST', '/api/auth/register', { body: { email: 'wspolpracownik@lab.io', password: 'password123' } }).body;
    assert.equal(call('DELETE', `/api/campaigns/camp1/invites/${inv.id}`, { token: joined.token }).status, 403);
    assert.equal(call('DELETE', '/api/campaigns/camp1/invites/nie-istnieje', { token }).status, 404);
  });
});
