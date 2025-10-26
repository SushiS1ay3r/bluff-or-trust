# LLM Strategist Server (Optional)

A tiny Node/Express proxy that turns a short game summary into an AI strategy decision using OpenAI.

## Setup

1. Install dependencies:

```powershell
cd server; npm install
```

2. Configure environment:

- Copy `.env.example` to `.env` and set your key.

```powershell
copy .env.example .env
# then edit .env to add your key
```

`.env`:

```
OPENAI_API_KEY=sk-...
# Optional: choose model
OPENAI_MODEL=gpt-4o-mini
# Optional: port
PORT=3000
```

3. Run the server:

```powershell
npm start
```

The frontend will call `http://localhost:3000/api/strategy` when the Strategist toggle is enabled.

## Notes

- If no API key is set, the server returns a built-in fallback strategy.
- Only JSON is returned.
