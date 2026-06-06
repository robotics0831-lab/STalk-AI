# STalk

**STalk** is a free, ChatGPT-style AI website you can run on your own machine. It supports text chat, file uploads, image generation, and voice chat.

## Features

- **Chat** — Talk to STalk with customizable personality (friendly, professional, creative, teacher, or custom)
- **Remember conversations** — Optional toggle to save chat history in your browser
- **File upload** — Upload `.txt`, `.md`, `.pdf`, `.csv`, `.json` and ask questions about them
- **Image generation** — Create images from text prompts (free, no API key)
- **Voice chat** — Speak your messages (mic) and have replies read aloud (optional)

## Free AI providers

| Provider | Cost | Setup |
|----------|------|-------|
| **Ollama** (default) | Free, runs locally | Install [Ollama](https://ollama.com), then `ollama pull llama3.2` |
| **Groq** | Free cloud tier | Get a key at [console.groq.com](https://console.groq.com), add in Settings |

Image generation uses [Pollinations.ai](https://pollinations.ai) — free, no key required.

## Quick start

### 1. Install dependencies

```bash
cd stalk/backend
pip3 install -r requirements.txt
```

### 2. Set up an AI brain (pick one)

**Option A — Ollama (recommended, fully free & private)**

```bash
# Install from https://ollama.com, then:
ollama pull llama3.2
ollama serve   # usually starts automatically
```

**Option B — Groq (free cloud, no local install)**

1. Sign up at [console.groq.com](https://console.groq.com)
2. Create an API key
3. In STalk → Settings → choose **Groq** and paste your key

### 3. Run STalk

```bash
cd stalk/backend
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000** in your browser.

## Project structure

```
stalk/
├── backend/
│   ├── main.py              # API server
│   ├── requirements.txt
│   └── services/
│       ├── llm.py           # Chat (Ollama / Groq)
│       ├── images.py        # Image generation
│       └── files.py         # File parsing
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── data/uploads/            # Uploaded files (created at runtime)
```

## Settings

Open **Settings** in the sidebar:

- **Remember past conversations** — Saves chats in browser localStorage
- **Personality** — Changes how STalk responds
- **AI Provider** — Ollama (local) or Groq (cloud)
- **Auto-read replies aloud** — Enables voice output for every reply

## Voice chat

- Click the **microphone** button to dictate a message (Chrome/Edge/Safari)
- Enable **Auto-read replies aloud** in Settings for hands-free conversation

## Limitations (v0.1)

- Chat requires Ollama or a Groq API key — there is no built-in model
- Image generation depends on Pollinations.ai availability
- Conversation memory is stored locally in your browser (not synced across devices)
- Voice features require a modern browser with microphone access

## Next steps

- Deploy to a server (Railway, Render, etc.)
- Add user accounts and cloud sync
- Fine-tune a custom STalk personality model
- Add more file types and RAG search
