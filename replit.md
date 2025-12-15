# ELION OMEGA System

## Overview
AI-powered development and operations platform with a React frontend and Express/TypeScript backend in a monorepo structure.

## Project Structure
```
elion-omega-monorepo/
├── packages/
│   ├── frontend/          # React + Vite frontend (port 5000)
│   │   └── src/
│   │       ├── components/, context/, features/, hooks/, lib/, pages/
│   │       └── App.jsx, main.jsx
│   └── backend/           # Express + TypeScript backend (port 8080)
│       └── src/
│           ├── agent/core.ts      # ELION Agent with tools
│           ├── services/llm.ts    # OpenAI GPT-5 integration
│           ├── chat/ChatService.ts
│           └── memory/db.ts       # Sequelize + PostgreSQL
├── package.json           # Root monorepo config with workspaces
```

## Running the App
- `npm run dev` - Runs both frontend and backend concurrently

## Architecture
- **Frontend**: React 18 + Vite + TailwindCSS on port 5000
- **Backend**: Express + TypeScript on port 8080
- **LLM**: OpenAI GPT-5 via `services/llm.ts`
- **Database**: PostgreSQL via Sequelize (auto-configured in Replit)

## Required Environment Variables
- `OPENAI_API_KEY` - Required for AI chat responses
- `DATABASE_URL` - Auto-configured by Replit PostgreSQL

## Authentication
- Demo login password: `ElionOmega1`
- JWT-based authentication

## What's Working
- Chat UI loads correctly
- Database connected (PostgreSQL)
- LLM integration connected (OpenAI GPT-5)
- Creating threads and sending messages works
- Agent responds with AI-generated answers

## Production Setup Notes
- Ensure OPENAI_API_KEY has sufficient quota
- Database migrations run automatically on startup
