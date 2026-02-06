# AI Assistant Task Management Dashboard

A sleek, dark, minimalistic React dashboard that tracks AI assistant tasks in real time. It auto-detects tasks from chat messages via Anthropic Claude Sonnet 4 and manages the lifecycle across **Backlog → In Progress → Completed**, with archive support and manual overrides.

## Features
- Three task columns with drag-and-drop
- Real-time task creation from chat messages
- Automatic “In Progress” status tracking (only one active task)
- Completed tasks auto-move to **Completed** with archive support
- Local persistence via `localStorage` + API sync hooks
- Live status indicator (idle/working + connection state)
- Dark, modern UI with smooth hover states

## Quick Start

```bash
npm install
npm run dev
```

Open: `http://localhost:5173`

## Anthropic Integration (Required)

This app **expects a server-side proxy** so you never expose your API key in the browser.
Create a serverless endpoint at `/api/anthropic/parse` that accepts:

```json
{
  "model": "claude-sonnet-4-20250514",
  "userMessage": "Please analyze data, create report, and send summary",
  "context": [{"text": "...", "createdAt": "..."}]
}
```

And returns:

```json
{ "tasks": ["Analyze data", "Create report", "Send summary"] }
```

### Example Serverless Function (Node/Express)

```js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/api/anthropic/parse", async (req, res) => {
  const { userMessage, context } = req.body;
  const prompt = `Extract actionable tasks from this message. Return a JSON array of short task titles.\n\nMessage: ${userMessage}\nContext: ${JSON.stringify(context || [])}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  // Expecting model to return a JSON array string in data.content[0].text
  const tasks = JSON.parse(data.content?.[0]?.text || "[]");
  res.json({ tasks });
});

app.listen(8787, () => console.log("API running"));
```

Set your key:
```bash
export ANTHROPIC_API_KEY=your_key_here
```

## Live Updates (Optional)

Hook the dashboard into your assistant with SSE at `/api/stream`:

```json
{ "type": "user_message", "text": "Analyze data, create report" }
{ "type": "assistant_state", "currentTaskId": "..." }
{ "type": "assistant_state", "completedTaskId": "..." }
```

## Deployment

### Vercel
1. `npm run build`
2. Push to GitHub
3. Import repo into Vercel
4. Add `ANTHROPIC_API_KEY` in Vercel Environment Variables

### Netlify
1. Build command: `npm run build`
2. Publish directory: `dist`
3. Add `ANTHROPIC_API_KEY` in Environment Variables

## GitHub Setup

```bash
git init
git add .
git commit -m "Initial commit: AI assistant task dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

---

If you want, I can also scaffold a backend proxy for Anthropic + SSE stream so the dashboard updates straight from your chat.
