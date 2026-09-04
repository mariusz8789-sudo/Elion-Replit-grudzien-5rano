# Genesis — SaaS i Enterprise Readiness

## Werdykt

Genesis ma **działające fundamenty backendu produktu**, nie pełny SaaS enterprise. Jest już realny serwer HTTP, lokalna trwałość, sesje, RBAC, projekty, audytowalne runy, publiczny katalog modeli i backendowy kontrakt Experiment Fabric. Nie ma jeszcze produkcyjnego hostingu wieloregionowego, billingów, API keys klientów, OIDC/SSO/SCIM, MFA, zewnętrznego KMS, pełnego audytu zgodności, SLA, kontroli data residency ani izolacji ciężkich solverów.

> Tego etapu nie rozszerzamy atrapami paneli lub „enterprise mode”. Dokument wskazuje istniejącą granicę wykonywalną i kolejność realnych decyzji infrastrukturalnych.

## Co działa dziś

| Obszar | Istniejąca implementacja | Granica |
|---|---|---|
| Serwer PWA | Node HTTP serwuje statyczny build z MIME, cache dla assetów i fallbackiem SPA. | Nie jest opisanym, zweryfikowanym wdrożeniem HA. |
| Zabezpieczenia HTTP | CSP, `X-Frame-Options`, `Permissions-Policy`, canonical static paths; limity rozmiaru body i zapytań. | Nie zastępuje WAF, DDoS protection ani zewnętrznego pen-testu. |
| Auth | Rejestracja/login, scrypt z losową solą, porównanie stałoczasowe, 256-bit tokeny sesji. | Brak resetu hasła, MFA, federacji tożsamości i polityki rotacji. |
| Projekty i RBAC | Role `viewer/editor/admin/owner`, ukrywanie cudzego projektu przez 404, zapisy wymagają `editor+`. | Brak SCIM, organizacji, grup IdP i polityk tenantowych. |
| Trwałość | SQLite z użytkownikami, sesjami, projektami, trialami, branchami, merge requestami, runami i jobami. | Brak produkcyjnej strategii migracji, backup/restore, HA i data residency. |
| API obliczeń | `GET /api/compute/fabric/contract`, `POST /api/compute/fabric/run`; request walidowany, model delegowany do istniejącego engine. | Publiczny compute nie jest planem płatności ani API key management. |
| Provenance | Project-scoped realny run jest trwały tylko przy zalogowanym `editor+`; API zwraca informację `persisted`. | Nie jest niezmiennym audytem regulacyjnym ani podpisanym evidence ledgerem. |
| Runtime audit | `GET /api/compute/environment` wykonuje realny probe i zapisuje audit append-only. | Nie instaluje ani nie aktywuje solvera. |

## Udowodnione API

| Endpoint | Co robi | Kontrola |
|---|---|---|
| `GET /api/health` | Zwraca stan serwera, frontend, bazę i indeks knowledge. | Publiczny health check. |
| `POST /api/auth/register`, `/login`, `/logout` | Obsługuje konto i sesję. | Walidacja rejestracji, session token. |
| `GET /api/compute/fabric/contract` | Zwraca wersjonowany kontrakt modeli API. | Tylko katalog; nie deklaruje external engines. |
| `POST /api/compute/fabric/run` | Waliduje envelope i deleguje run do istniejącego compute engine. | Brak solvera → nie jest wysyłany przez ten endpoint. |
| `POST /api/compute/fabric/run` z `projectId` | Zapisuje udany run do projektu. | Wymaga ważnej sesji i `editor+`. |
| `GET /api/projects/:id/runs` | Czyta runy projektu. | Wymaga membership `viewer+`. |
| `GET /api/compute/environment` | Zwraca realny audit runtime. | Nie tworzy wyniku naukowego. |

## Bramka przed komercyjnym SaaS

| Priorytet | Wymaganie | Dlaczego nie można udawać, że istnieje |
|---|---|---|
| P0 | Zatwierdzony deployment, secret manager, TLS, managed DB, backup/restore drill, monitoring i incident runbook. | Lokalny SQLite i jeden proces nie dowodzą odporności produkcyjnej. |
| P0 | Rate limiting per account/API key, quota i kosztorys realnego compute. | IP limiter nie jest billingiem ani ochroną kosztów klientów. |
| P0 | API keys z hashowaniem, scopes, rotation, revocation i audit. | Bearer session dla aplikacji webowej nie jest service API dla organizacji. |
| P1 | E-mail verification/reset, MFA, OIDC SSO oraz podstawowy audit trail. | Hasło + sesja nie spełniają typowych wymagań enterprise. |
| P1 | Org/tenant, workspace limits, retention, export/delete i data handling policy. | Projekt lokalny nie wystarcza dla prawa i governance danych. |
| P2 | SCIM, SAML/OIDC enterprise, KMS, SOC 2/ISO evidence, SLA i support process. | To procesy, kontrole i zewnętrzne review, nie funkcje UI. |
| P2 | Billing provider, katalog planów, usage metering, faktury i podatki. | Wymaga decyzji biznesowej, podmiotu prawnego i dostawcy płatności. |

## Następny realny milestone produktu

Po zatwierdzeniu docelowego środowiska wdrożeniowego najbezpieczniejsza kolejność brzmi:

1. przenieść DB do zatwierdzonego managed runtime i wykonać test backup/restore;
2. wprowadzić service API keys ze scope `compute:read`, `compute:run`, `runs:read` i limitem per tenant;
3. zapisać append-only audit każdego wywołania API key (bez sekretu i bez wyniku fikcyjnego);
4. podłączyć usage metering do rzeczywistych runów oraz dopiero potem wybrać billing provider;
5. wykonać external security review przed włączeniem danych klientów lub external solvers.

Dopóki te decyzje nie są dostarczone, Genesis może uczciwie oferować lokalny/prototypowy backend do realnych modeli, ale nie może deklarować statusu enterprise SaaS.
