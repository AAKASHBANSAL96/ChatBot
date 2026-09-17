const chat = document.querySelector("#chat"), quick = document.querySelector("#quick-actions"), form = document.querySelector("#chat-form"), input = document.querySelector("#message"), sendButton = form.querySelector("button");
const history = []; let busy = false; let bookingDraft = null;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function scrollToLatest() { chat.scrollTop = chat.scrollHeight; }
function add(text, who = "bot") { const el = document.createElement("div"); el.className = `bubble ${who}`; el.textContent = text; chat.append(el); history.push({ role: who === "bot" ? "assistant" : "user", content: text }); scrollToLatest(); }
function addBookingSummary(booking) {
  const card = document.createElement("section"); card.className = "booking-summary";
  const heading = document.createElement("div"); heading.className = "booking-summary-heading";
  const title = document.createElement("div"), strong = document.createElement("strong"), status = document.createElement("span"); strong.textContent = "Booking enquiry"; status.textContent = "Pending confirmation"; title.append(strong, status);
  const mark = document.createElement("div"); mark.className = "booking-mark"; mark.textContent = "AB"; heading.append(title, mark); card.append(heading);
  const details = document.createElement("dl");
  [["Guest", booking.name], ["Contact", booking.contact], ["Stay", `${booking.checkIn} – ${booking.checkOut}`], ["Guests", booking.guests], ["Room", booking.room], ["Requests", booking.requests], ["Arrival", booking.arrival]].forEach(([label, value]) => {
    const row = document.createElement("div"), term = document.createElement("dt"), description = document.createElement("dd"); term.textContent = label; description.textContent = value || "Not provided"; row.append(term, description); details.append(row);
  });
  card.append(details); chat.append(card); scrollToLatest();
}
function setBusy(value) { busy = value; input.disabled = value; sendButton.disabled = value; quick.querySelectorAll("button, input").forEach(control => control.disabled = value); }
function showTyping() { const el = document.createElement("div"); el.className = "typing-wrap"; el.innerHTML = '<span class="typing-name">Maya is typing</span><span class="typing"><b></b><b></b><b></b></span>'; chat.append(el); scrollToLatest(); return el; }
async function reply(text, bookingSummary) { const typing = showTyping(); await pause(Math.min(2400, Math.max(700, 480 + text.length * 11)) + Math.random() * 300); typing.remove(); add(text); if (bookingSummary) addBookingSummary(bookingSummary); }
function formatSelectedDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }); }
function updateControls() {
  quick.innerHTML = "";
  if (!bookingDraft?.active) {
    ["Make a new booking", "Check room availability", "Find my reservation", "Show the menu", "Available activities"].forEach(label => { const button = document.createElement("button"); button.textContent = label; button.onclick = () => sendMessage(label); quick.append(button); });
    return;
  }
  if (bookingDraft.step === "checkIn" || bookingDraft.step === "checkOut") {
    const picker = document.createElement("label"); picker.className = "date-picker";
    picker.innerHTML = `<span>${bookingDraft.step === "checkIn" ? "Choose check-in date" : "Choose check-out date"}</span>`;
    const dateInput = document.createElement("input"); dateInput.type = "date"; dateInput.min = new Date().toISOString().slice(0, 10);
    if (bookingDraft.step === "checkOut" && /^\d{4}-\d{2}-\d{2}$/.test(bookingDraft.checkIn || "")) dateInput.min = bookingDraft.checkIn;
    dateInput.setAttribute("aria-label", picker.querySelector("span").textContent);
    dateInput.onchange = () => { if (dateInput.value) sendMessage(formatSelectedDate(dateInput.value)); };
    picker.append(dateInput); quick.append(picker);
  }
  const cancel = document.createElement("button"); cancel.textContent = "Cancel booking"; cancel.onclick = () => sendMessage("Cancel booking"); quick.append(cancel);
}
async function sendMessage(text) {
  if (busy || !text.trim()) return;
  setBusy(true); add(text.trim(), "user"); quick.innerHTML = "";
  try { const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, bookingDraft }) }); const data = await response.json(); bookingDraft = data.bookingDraft ?? bookingDraft; await reply(data.reply || "I am sorry, I could not reach the hotel system. Please try again.", data.bookingSummary); }
  catch { await reply("I am having trouble connecting to the hotel system. Please try again in a moment."); }
  updateControls(); setBusy(false); input.focus();
}
form.addEventListener("submit", event => { event.preventDefault(); const text = input.value; input.value = ""; sendMessage(text); });
document.querySelector("#reset").onclick = async () => { if (busy) return; chat.innerHTML = ""; history.length = 0; bookingDraft = null; quick.innerHTML = ""; setBusy(true); await reply("Hi, I'm Maya from Azure Bay Hotel. I can help with a new booking, room availability, an existing reservation, our dining menu, activities, or anything else about your stay. How can I help today?"); updateControls(); setBusy(false); };
document.querySelector("#reset").click();
