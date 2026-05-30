# ChatPPT

ChatPPT is an open-source React app for drafting, editing, importing, and exporting presentation decks. It combines AI deck generation, AI image generation, an editable slide canvas, theme controls, speaker notes, and PowerPoint export in one local-first workspace.

## Features

- Generate complete slide decks from a prompt with your selected AI provider.
- Switch text generation between Gemini, OpenAI, Claude, and Ollama.
- Save provider API keys and selected models in the browser settings modal.
- Use custom model IDs for any provider as new models are released.
- Scan locally installed Ollama models and pull a custom Ollama model from the app.
- Rewrite, shorten, expand, and brainstorm slide copy with the built-in AI assistant.
- Generate AI images for slide placeholders and backgrounds with Gemini Imagen or OpenAI Images.
- Edit slide elements on a responsive canvas with drag, resize, snapping, layering, opacity, typography, and image-fit controls.
- Import existing `.pptx` files and preserve editable text, images, and slide backgrounds where possible.
- Export editable PPTX, exact-look image PPTX, standalone HTML presentations, speaker notes, and full project JSON backups.
- Autosave projects to browser storage and restore the last deck automatically.
- Save and reload `.aipres.json` project files with slides, media, notes, themes, and global styling.
- Track deck health with slide count, word count, visual count, notes coverage, dense slides, and pending image prompts.
- Use global themes, typography, background images, local uploads, and per-slide overrides.

## Tech Stack

- React 19
- Vite 6
- TypeScript
- Tailwind CSS 4
- Express
- Google GenAI SDK
- PptxGenJS
- html-to-image
- JSZip
- Lucide React

## Getting Started

### Prerequisites

- Node.js 20 or newer
- A Gemini API key

### Installation

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set your API key:

```bash
GEMINI_API_KEY="your_api_key_here"
```

Optional server-side keys:

```bash
OPENAI_API_KEY="your_openai_key_here"
ANTHROPIC_API_KEY="your_anthropic_key_here"
OLLAMA_ORIGIN="http://localhost:11434"
```

You can also enter API keys in the app settings modal. Those keys are saved in this browser so you do not have to type them every session.

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev       # Start the Express + Vite development server
npm run build     # Build the frontend for production
npm run preview   # Preview the production build with Vite
npm run lint      # Run TypeScript checks
npm run clean     # Remove the dist folder
```

## AI Configuration

AI requests are proxied through the Express server under `/api/ai/*`, so the browser does not need direct access to `GEMINI_API_KEY`.

Current AI endpoints:

- `POST /api/ai/deck`
- `POST /api/ai/rewrite`
- `POST /api/ai/chat`
- `POST /api/ai/image`
- `POST /api/models/list`
- `GET /api/ollama/models`
- `POST /api/ollama/pull`

Supported text providers:

- Gemini
- OpenAI
- Claude
- Ollama

Supported image providers:

- Gemini Imagen
- Gemini Nano Banana native image models
- OpenAI Images

Bundled image model defaults include:

- Gemini Nano Banana: `gemini-2.5-flash-image`
- Gemini Nano Banana Pro: `gemini-3-pro-image-preview`
- Gemini Nano Banana 2 preview: `gemini-3.1-flash-image-preview`
- Imagen: `imagen-4.0-generate-001`, `imagen-3.0-generate-002`
- OpenAI GPT Image: `gpt-image-1.5`, `chatgpt-image-latest`, `gpt-image-1`, `gpt-image-1-mini`
- Forward-compatible custom entry: `gpt-image-2.0`

The model lists in the UI include useful defaults. Users can fetch live model lists for cloud providers when they provide an API key, scan local Ollama models, or paste any custom model ID without waiting for a code update.

## Export Options

- Editable PPTX: exports text and images as editable PowerPoint objects.
- Exact Look PPTX: renders each slide as a high-resolution image for visual fidelity.
- Standalone HTML: exports a self-contained browser presentation.
- Speaker Notes: downloads slide notes as Markdown.
- Project JSON: saves an editable `.aipres.json` project backup.

## Project Files

The app autosaves the active deck in browser storage. For long-term storage or collaboration, export a Project JSON file and re-import it later from the home screen or editor toolbar.
