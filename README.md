# BioVision AI

BioVision AI is a browser-based microscopy image viewer and heuristic particle counter built with Next.js, TypeScript, Canvas, Prisma, and optional Groq/Gemini/Upstash services.

## Requirements

- Node.js 20+
- npm
- A modern browser with camera permission for live capture
- Optional: Groq API key, Gemini API key, and Upstash Redis REST URL/token
- Optional: Google OAuth client credentials

## Run locally

1. Copy `.env.example` to `.env` and set a long random `NEXTAUTH_SECRET`. Prisma CLI reads `.env`; Next.js also loads it.
2. Set `DATABASE_URL="file:./dev.db"` (SQLite database is created under `prisma/`).
3. Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for rate-limited AI endpoints. Configure `GROQ_API_KEY` and `GEMINI_API_KEY` to enable the corresponding features.
4. Install packages and initialize the local database:

   ```sh
   npm install
   npm run db:push
   ```

5. Start the development server:

   ```sh
   npm run dev
   ```

Google sign-in is enabled when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Credentials users can register through the sign-in dialog or `POST /api/auth/register` using `{ "name": "...", "email": "...", "password": "at-least-10-characters" }`.

## API

- `POST /api/microscope/scan`: accepts validated Canvas-derived image metrics, applies Upstash rate limiting and caching, and optionally returns a cautious Groq summary.
- `POST /api/microscope/report`: asks Gemini for a non-diagnostic observation and persists scan metrics/report in Prisma.
- `GET /api/microscope/history`: returns the signed-in user's saved reports' scan records.
- `DELETE /api/microscope/history/:id`: deletes a saved scan owned by the signed-in user.
- `POST /api/auth/register`: creates an account with a bcrypt-hashed password.

## Measurement and safety notes

The Canvas engine uses grayscale thresholding and four-connected components to count image particles. Its four groups are simple geometric shape buckets, **not** identifications of E. coli, Lactobacillus, Staphylococcus, or any other organism. The safety indicator is only a display of those shape-bucket proportions; it is not a safety, contamination, pathology, or health score.

Micrometers are estimated only when a valid micrometers-per-pixel calibration is supplied. Density is reported as detected particles per milliliter only when the operator supplies an appropriate sample-volume value. A camera image alone cannot establish the viewed volume or concentration. This software does not validate diagnostic workflows, identify pathogens, or determine antimicrobial sensitivity; use qualified laboratory methods for those purposes.

Camera access requires a secure browser context (HTTPS or localhost). TIFF decoding depends on browser support; PNG, JPEG, and WebP are the most interoperable upload formats.
