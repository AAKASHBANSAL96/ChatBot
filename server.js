import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  const envFile = await readFile(path.join(root, ".env"), "utf8");
  envFile.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  });
} catch { /* .env is optional; environment variables work too. */ }
const database = JSON.parse(await readFile(path.join(root, "hotel-data.json"), "utf8"));
const systemPrompt = `You are Maya, an attentive, natural, concise customer support specialist for Azure Bay Hotel. You are speaking to hotel guests in a live chat. Be warm and conversational, vary your wording, and use short paragraphs.

The HOTEL DATABASE below is your source of truth. Never invent availability, prices, menu items, activities, reservation status, policies, or a reservation reference. For old reservation lookups, ask for either a reference number or full guest name if neither has been provided. Acknowledge privacy and give only the matching reservation. You can explain that a live agent confirms payments and final booking changes. For a new booking, always begin by asking for the guest's full name; then collect contact details, check-in date, check-out date, number of adults and children, room preference, special requests, and arrival/airport-transfer needs one item at a time. Do not list rooms or availability as the first response to a request to make a new booking. Do not say a booking is confirmed unless the database says it is.

HOTEL DATABASE:\n${JSON.stringify(database, null, 2)}`;

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
function fallbackReply(message) {
  const text = message.toLowerCase();
  const reservation = database.reservations.find(item => text.includes(item.reference.toLowerCase()) || text.includes(item.guest.toLowerCase()));
  if (reservation) return `I found ${reservation.reference} for ${reservation.guest}. It is ${reservation.status}: ${reservation.room}, ${reservation.guests} guests, from ${reservation.checkIn} to ${reservation.checkOut}. Is there anything you would like to change?`;
  if (/menu|food|restaurant|eat|breakfast|dinner/.test(text)) return `Our breakfast favourites include masala omelette ($9), tropical fruit bowl ($7), and Goan poi with chai ($5). For later, I recommend the Goan fish curry ($18) or vegetable thali ($14). Would you like the bar menu too?`;
  if (/activit|yoga|tour|cruise|class|things to do/.test(text)) return `Available activities include sunrise beach yoga (complimentary, 8 spots), a spice farm tour ($28, 5 spots), sunset catamaran cruise ($45, 4 spots), and Goan cooking class ($32, 6 spots). Which one sounds good?`;
  if (/availability|available|room|stay|book/.test(text)) return `Right now we have 6 Deluxe King rooms ($180/night), 3 Ocean Suites ($280/night), and 2 Family Villas ($420/night). Tell me your check-in and check-out dates plus guest count, and I will help narrow it down.`;
  return "I can help with room availability, a new booking, an existing reservation, our restaurant menu, activities, airport transfers, and hotel policies. What would you like to know?";
}

const roomNames = database.rooms.map(room => room.name).join(", ");
function wantsNewBooking(message) {
  return /\b(new\s+(?:booking|reservation)|make\s+(?:a\s+)?(?:new\s+)?(?:booking|reservation)|(?:book|reserve)\s+(?:a\s+)?(?:new\s+)?(?:room|stay))\b/i.test(message);
}
function advanceBookingDraft(draft, value) {
  const next = { ...draft };
  if (draft.step === "name") { next.name = value; next.step = "contact"; }
  else if (draft.step === "contact") { next.contact = value; next.step = "checkIn"; }
  else if (draft.step === "checkIn") { next.checkIn = value; next.step = "checkOut"; }
  else if (draft.step === "checkOut") { next.checkOut = value; next.step = "guests"; }
  else if (draft.step === "guests") { next.guests = value; next.step = "room"; }
  else if (draft.step === "room") { next.room = value; next.step = "requests"; }
  else if (draft.step === "requests") { next.requests = value; next.step = "arrival"; }
  else if (draft.step === "arrival") { next.arrival = value; next.active = false; next.step = "complete"; }
  return next;
}
function restoreBookingDraft(messages) {
  let draft = null;
  for (const message of messages) {
    if (message.role === "assistant" && /full name for the reservation/i.test(message.content)) {
      draft = { active: true, step: "name" };
    } else if (message.role === "user" && draft?.active) {
      draft = advanceBookingDraft(draft, message.content.trim());
    }
  }
  return draft?.active ? draft : null;
}
function bookingReply(message, draft) {
  const value = message.trim();
  if (/\b(cancel|stop|never mind|nevermind)\b/i.test(value)) {
    return { reply: "No problem — I have cancelled this booking enquiry. How else can I help?", bookingDraft: null };
  }
  if (!draft?.active) {
    return {
      reply: "I’d be happy to help with a new booking. To begin, may I have the full name for the reservation?",
      bookingDraft: { active: true, step: "name" }
    };
  }
  const next = advanceBookingDraft(draft, value);
  if (draft.step === "name") {
    return { reply: `Thanks, ${value}. What email address or phone number should we use for this booking?`, bookingDraft: next };
  }
  if (draft.step === "contact") {
    return { reply: "What date would you like to check in?", bookingDraft: next };
  }
  if (draft.step === "checkIn") {
    return { reply: "And what date would you like to check out?", bookingDraft: next };
  }
  if (draft.step === "checkOut") {
    return { reply: "How many adults and children will be staying?", bookingDraft: next };
  }
  if (draft.step === "guests") {
    return { reply: `Do you have a room preference? Our options are ${roomNames}.`, bookingDraft: next };
  }
  if (draft.step === "room") {
    return { reply: "Do you have any special requests, such as accessibility needs, bed preference, or a celebration? You can also say “none.”", bookingDraft: next };
  }
  if (draft.step === "requests") {
    return { reply: `What is your expected arrival time? Would you also like an airport transfer (${database.hotel.airportTransfer})?`, bookingDraft: next };
  }
  return {
    reply: "Thank you — I have prepared your booking enquiry below. A booking specialist will check availability and contact you to confirm the reservation and payment.",
    bookingDraft: next,
    bookingSummary: next
  };
}
async function serveFile(res, filename, type) { return send(res, 200, await readFile(path.join(root, filename), "utf8"), type); }

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) return serveFile(res, "index.html", "text/html; charset=utf-8");
  if (req.method === "GET" && req.url === "/style.css") return serveFile(res, "style.css", "text/css; charset=utf-8");
  if (req.method === "GET" && req.url === "/app.js") return serveFile(res, "app.js", "application/javascript; charset=utf-8");
  if (req.method === "GET" && req.url === "/api/hotel") return send(res, 200, database);
  if (req.method === "POST" && req.url === "/api/chat") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { messages = [], bookingDraft = null } = JSON.parse(raw || "{}");
    const latest = [...messages].reverse().find(item => item.role === "user")?.content || "";
    const activeBookingDraft = bookingDraft?.active ? bookingDraft : restoreBookingDraft(messages.slice(0, -1));
    if (activeBookingDraft || wantsNewBooking(latest)) return send(res, 200, bookingReply(latest, activeBookingDraft));
    if (!process.env.OPENAI_API_KEY) return send(res, 200, { enabled: false, reply: fallbackReply(latest) });
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5", instructions: systemPrompt, input: messages.slice(-12), store: false, max_output_tokens: 250 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
      return send(res, 200, { enabled: true, reply: data.output_text });
    } catch (error) {
      return send(res, 200, { enabled: false, reply: fallbackReply(latest), error: error.message });
    }
  }
  send(res, 404, { error: "Not found" });
});
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Azure Bay Hotel chatbot: http://localhost:${port}`));
