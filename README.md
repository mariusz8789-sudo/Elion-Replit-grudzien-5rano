# ELION OMEGA - Full Production System

**ELION OMEGA** to kompletny, produkcyjny system AI Agent z pełną funkcjonalnością:
- **Agent Core** z Tool Use, RAG i planowaniem
- **AutoDev Service** z pełnym pipeline'm generowania kodu
- **DaveOps** z orkiestracją Docker/Vercel
- **User Memory** z trwałą bazą danych (PostgreSQL + pgvector)
- **LLM Service** z obsługą streamingu (SSE)
- **Frontend** z pełnymi stronami (Agi, Opportunities, Lessons, Settings, Memory)
- **Terminal Logs** z pełnym pollingiem

---

## 📋 Wymagania

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Docker** (dla bazy danych PostgreSQL)
- **OpenAI API Key** (dla LLM i embeddingów)

---

## 🚀 Uruchomienie Deweloperskie (Dev)

### 1. Instalacja Zależności

```bash
npm install
```

### 2. Konfiguracja Zmiennych Środowiskowych

Utwórz plik `.env` w katalogu głównym projektu na podstawie `.env.example`:

```bash
cp .env.example .env
```

Uzupełnij plik `.env` swoimi kluczami API:

```env
# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=elion_omega
DB_USER=elion
DB_PASSWORD=elion_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# Server
PORT=8080
```

### 3. Uruchomienie Bazy Danych

Uruchom PostgreSQL z rozszerzeniem `pgvector` za pomocą Docker Compose:

```bash
docker-compose up -d
```

Sprawdź, czy kontener działa:

```bash
docker ps
```

### 4. Migracja i Seedowanie Bazy Danych

Uruchom skrypty migracji i seedowania:

```bash
npm run db:migrate --workspace=packages/backend
npm run db:seed --workspace=packages/backend
```

### 5. Uruchomienie Aplikacji

Uruchom backend i frontend jednocześnie w trybie deweloperskim:

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem:
- **Frontend:** `http://localhost:3000`
- **Backend API:** `http://localhost:8080`

### 6. Logowanie

Użyj domyślnych danych logowania:
- **Email:** `admin@elion.com`
- **Hasło:** `ElionOmega1`

---

## 🏭 Uruchomienie Produkcyjne (Production)

### 1. Zbuduj Projekt

```bash
npm run build
```

To polecenie skompiluje:
- Backend (TypeScript → JavaScript w `packages/backend/dist`)
- Frontend (React → statyczne pliki w `packages/frontend/dist`)

### 2. Uruchom Backend

```bash
npm start --workspace=packages/backend
```

Backend będzie nasłuchiwał na porcie `8080` (lub porcie zdefiniowanym w `.env`).

### 3. Serwuj Frontend

Skopiuj zawartość katalogu `packages/frontend/dist` do serwera WWW (np. **Nginx**, **Apache**, **Vercel**, **Netlify**).

#### Przykładowa konfiguracja Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/elion-omega/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Uruchom jako Usługa (Opcjonalnie)

Możesz użyć **PM2** do zarządzania procesem backendu:

```bash
npm install -g pm2
pm2 start packages/backend/dist/index.js --name elion-omega-backend
pm2 save
pm2 startup
```

---

## 📂 Struktura Projektu

```
elion-omega/
├── packages/
│   ├── backend/          # Backend (Express + TypeScript)
│   │   ├── src/
│   │   │   ├── agent/    # Agent Core (Tool Use, RAG)
│   │   │   ├── autodev/  # AutoDev Service
│   │   │   ├── chat/     # Chat Service
│   │   │   ├── daveops/  # DaveOps Orchestrator
│   │   │   ├── memory/   # Memory Manager, VectorStore, UserMemory
│   │   │   ├── routes/   # API Routes
│   │   │   ├── services/ # LLM, Embedding Services
│   │   │   └── index.ts  # Entry Point
│   │   └── package.json
│   └── frontend/         # Frontend (React + Vite + Tailwind)
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── context/
│       │   └── lib/
│       └── package.json
├── .env.example          # Przykładowa konfiguracja zmiennych środowiskowych
├── docker-compose.yml    # Konfiguracja PostgreSQL + pgvector
├── package.json          # Root package.json (workspaces)
└── README.md             # Ten plik
```

---

## 🔧 Skrypty NPM

### Root (Monorepo)

- `npm install` - Instaluje wszystkie zależności dla całego monorepo
- `npm run dev` - Uruchamia backend i frontend w trybie deweloperskim
- `npm run build` - Buduje backend i frontend dla produkcji
- `npm run db:migrate` - Uruchamia migracje bazy danych
- `npm run db:seed` - Seeduje bazę danych przykładowymi danymi

### Backend (`packages/backend`)

- `npm run dev --workspace=packages/backend` - Uruchamia backend w trybie deweloperskim (nodemon)
- `npm run build --workspace=packages/backend` - Kompiluje TypeScript do JavaScript
- `npm start --workspace=packages/backend` - Uruchamia skompilowany backend

### Frontend (`packages/frontend`)

- `npm run dev --workspace=packages/frontend` - Uruchamia frontend w trybie deweloperskim (Vite)
- `npm run build --workspace=packages/frontend` - Buduje frontend dla produkcji

---

## 🧪 Testowanie

Po uruchomieniu aplikacji w trybie deweloperskim:

1. **Zaloguj się** na `http://localhost:3000/login` używając `admin@elion.com` / `ElionOmega1`
2. **Przejdź do Chat** i wyślij wiadomość - Agent Core automatycznie użyje Tool Use i RAG
3. **Sprawdź Agi Page** - zobaczysz status wszystkich serwisów
4. **Sprawdź Opportunities** - zobaczysz listę możliwości biznesowych
5. **Sprawdź Lessons** - zobaczysz listę lekcji
6. **Sprawdź Memory** - zobaczysz pamięć projektu
7. **Sprawdź Settings** - możesz zmienić ustawienia użytkownika

---

## 🐛 Rozwiązywanie Problemów

### Błąd: `ECONNREFUSED` podczas migracji bazy danych

**Przyczyna:** Baza danych PostgreSQL nie jest uruchomiona.

**Rozwiązanie:**
```bash
docker-compose up -d
```

### Błąd: `Invalid token` podczas logowania

**Przyczyna:** Brak lub nieprawidłowy `JWT_SECRET` w pliku `.env`.

**Rozwiązanie:**
```bash
# Dodaj do .env
JWT_SECRET=your_super_secret_jwt_key_here
```

### Błąd: `OpenAI API Key not set`

**Przyczyna:** Brak klucza API OpenAI w pliku `.env`.

**Rozwiązanie:**
```bash
# Dodaj do .env
OPENAI_API_KEY=your_openai_api_key_here
```

---

## 📝 Licencja

Ten projekt jest własnością **ELION OMEGA** i jest udostępniany wyłącznie do celów wewnętrznych.

---

## 🎯 Kontakt

W przypadku pytań lub problemów, skontaktuj się z zespołem deweloperskim.

---

**Wersja:** 1.0.0 (Production-Ready)
**Data:** 2025-01-04
