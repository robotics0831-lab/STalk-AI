# Deploy STalk for your friend

Your friend opens a link and chats — no API keys needed on their end. You put your Groq key on the server.

## What you need

- A **Groq API key** from [console.groq.com](https://console.groq.com) (free)
- About 10–15 minutes
- **No Terminal/git required** (see Option A below)

---

## Option A — GitHub website upload (easiest, no git)

Use this if `git init` failed or you don't want Terminal.

### 1. Create a GitHub repo

1. Go to **[github.com/new](https://github.com/new)**
2. Name it `stalk-ai`
3. Leave it **Public**
4. **Do not** check "Add README"
5. Click **Create repository**

### 2. Upload files in the browser

1. On the empty repo page, click **"uploading an existing file"**
2. Open Finder → go to `/Users/seonwoo/stalk`
3. Select **everything inside** the `stalk` folder:
   - `backend` folder
   - `frontend` folder
   - `Dockerfile`
   - `render.yaml`
   - `.gitignore`
   - `README.md`
   - etc.
4. Drag them into the GitHub upload area
5. Scroll down → commit message: `STalk deploy`
6. Click **Commit changes**

> **Tip:** If drag-and-drop is awkward, use the zip at `/Users/seonwoo/stalk-deploy.zip` — unzip it first, then upload the `stalk` folder contents.

### 3. Deploy on Render

1. Go to **[render.com](https://render.com)** → sign up (free)
2. Click **New +** → **Blueprint**
3. Connect GitHub → select `stalk-ai`
4. Paste your **GROQ_API_KEY** (`gsk_...`) when asked
5. Click **Apply**

In a few minutes you get a URL like **https://stalk-xxxx.onrender.com** — send that to your friend.

---

## Option B — Replit (no GitHub at all)

1. Go to **[replit.com](https://replit.com)** → sign up (free)
2. Click **Create Repl** → **Import from ZIP**
3. Upload `/Users/seonwoo/stalk-deploy.zip`
4. Replit may ask for language — choose **Python** if prompted
5. Open **Secrets** (lock icon in sidebar) and add:
   - `GROQ_API_KEY` = your `gsk_...` key
   - `STALK_HOSTED` = `true`
   - `STALK_PROVIDER` = `groq`
6. In the Shell tab, run:
   ```bash
   cd backend && pip install -r requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000
   ```
7. Click **Run** or use Replit's **Deploy** button if available
8. Copy the public URL Replit gives you

---

## Option C — Terminal/git (original method)

Only use this if git works on your Mac:

```bash
cd /Users/seonwoo/stalk
git init
git add .
git commit -m "STalk deploy"
git remote add origin https://github.com/YOUR_USERNAME/stalk-ai.git
git push -u origin main
```

Then follow **Option A → Step 3** (Render Blueprint).

If git fails with `xcode-select`, install tools first:
```bash
xcode-select --install
```
Or skip git and use **Option A** instead.

---

## What your friend gets

- Open the link in any browser
- Chat immediately — no signup, no API keys
- Upload files, generate images, use voice
- Change personality in Settings

---

## Notes

| Topic | Details |
|-------|---------|
| **Cost** | Free tier on Render/Replit + free Groq = $0 |
| **Cold start** | Free Render apps sleep after 15 min — first visit may take ~30 sec |
| **Rate limit** | 30 messages/min per person |
| **Your API key** | Stored only on the server — friends never see it |

---

## Troubleshooting

**"STalk is not configured yet"**  
Add `GROQ_API_KEY` in Render → Environment (or Replit Secrets).

**Chat errors**  
Check server logs. Make sure your Groq key is valid and starts with `gsk_`.

**GitHub upload missing folders**  
Make sure both `backend` and `frontend` folders uploaded, plus `Dockerfile` at the top level.

**App slow on first load**  
Normal on free tier — wait 30 seconds and refresh.
