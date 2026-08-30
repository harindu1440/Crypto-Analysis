# Crypto Analysis Web Application

## Project Overview
This project is a monorepo-style full-stack application for Crypto Analysis. It contains a React/TypeScript frontend (powered by Vite) and a Node.js/Express backend. 
Currently in Phase 1 (Project Foundation & Pterodactyl Architecture).

## Technology Stack
- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript

## Development Setup
Install dependencies from the root directory:
```bash
npm install
```
This will also install frontend dependencies using the `postinstall` script.

To run locally in development mode (starts both frontend and backend watchers):
```bash
npm run dev
```

## Build Commands
To build both the frontend and backend for production:
```bash
npm run build
```
This command compiles the React frontend to `frontend/dist` and the Express backend to `dist`.

## Production Commands
Start the production server:
```bash
npm start
```
This executes `node dist/server.js`. The single Node.js process handles API routes and serves the built React frontend application.

## Environment Variables
See `.env.example`. Do not commit real `.env` files.
- `PORT`: Dynamically assigned by Pterodactyl (local fallback: 3000)
- `NODE_ENV`: Should be `production` in live environments

## Pterodactyl Deployment Instructions
1. Ensure the Node.js Docker image is set to **Node.js 20**.
2. The Git pull and startup script should perform `npm install` automatically.
3. The build step `npm run build` must be executed (or built files should be pushed).
4. Set the **Main File** configuration to: `dist/server.js`
5. The application will automatically bind to the assigned port via the `PORT` environment variable and listen on `0.0.0.0`.

## Health Check Endpoint
The backend exposes a health check endpoint:
- `GET /health` or `GET /api/health`
Returns: `{ "status": "ok" }`

## Project Structure
- `frontend/`: React + TypeScript frontend code.
- `server/`: Express + TypeScript backend code.
- `dist/`: Compiled backend code.
- `server.ts`: Backend entry point.
- `package.json`: Root package with monorepo lifecycle scripts.
