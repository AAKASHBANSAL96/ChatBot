# Hotel Support Bot

Customer-support chatbot demo for hotel bookings, reservation lookups, rooms, dining, activities, and general hotel questions.

## Run locally

1. Copy `.env.example` to a new file named `.env` in this folder, then replace `your_openai_api_key_here` with your real key.
2. Run:

```powershell
cd D:\GenAI\ChatBot
node server.js
```

Open `http://localhost:3000`. The API key remains on the server and is never sent to the browser. `.env` is ignored by Git. `hotel-data.json` is the demo database; edit it to change rooms, bookings, menu items, and activities.

For a test reservation, ask for `AB-284731` or `Aakash Bansal`.
