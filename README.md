# Voice to Text

A privacy-first, static web app for turning voice notes into editable transcripts and local summaries.

## What it does

- Accepts common audio formats, including WhatsApp-compatible OGG and OPUS files.
- Plays the selected audio before transcription.
- Runs Whisper in the browser using Transformers.js; audio is not sent to an application server.
- Provides an editable transcript, a lightweight local summary, export, clipboard copy, and browser-local restoration of the latest transcript.
- Runs as a static Vite build suitable for GitHub Pages.

## Run locally

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. On first transcription, the browser downloads the Whisper model and caches it for later use. Chrome or Edge on a desktop computer provides the best experience.

## Build and deploy

```powershell
npm run build
```

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes the production build when changes are pushed to `main`. In the GitHub repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions** once.

## Privacy and limitations

Audio is decoded and transcribed locally in the browser. The model download comes from Hugging Face, so the first transcription needs an internet connection. Large files and long recordings require substantial device memory and can take time on CPU-only devices.

The current summary is intentionally rule-based and local. A future optional local companion service can replace it with Ollama and use faster-whisper for higher performance or live/VoIP sources without changing the browser workflow.
