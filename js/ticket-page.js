/**
 * ticket-page.js
 * ----------------------------------------------------------------------
 * Drives ticket.html, the page the ticket email links to:
 *   ticket?id=REG-…&e=event-004&n=Their name
 * It draws the ticket (ticket.js) and offers it to download. The address
 * carries only what is printed on the ticket; at the door the ID is checked
 * against the registrations, so a ticket can't be made up.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", async () => {
  const img = document.querySelector("[data-ticket-image]");
  if (!img) return;
  const status = document.querySelector("[data-ticket-status]");
  const lede = document.querySelector("[data-ticket-lede]");
  const save = document.querySelector("[data-ticket-download]");
  const eventLink = document.querySelector("[data-ticket-event]");
  if (typeof wireYear === "function") wireYear();

  const params = new URLSearchParams(location.search);
  const id = String(params.get("id") || "").trim().toUpperCase();
  const eventId = String(params.get("e") || "").trim();
  const name = String(params.get("n") || "").replace(/\s+/g, " ").trim().slice(0, 120);

  if (!/^[A-Z]{3}-[A-Z0-9]{4,24}$/.test(id)) {
    status.textContent = "This link is missing its ticket. Open the link in your ticket email again, or write to hello@dr-ajokesings.com and we'll send it.";
    save.hidden = true;
    return;
  }

  let event = null;
  try { await window.ContentReady; } catch (_) { /* the built-in events */ }
  if (eventId) {
    try { event = await api.getEventById(eventId); } catch (_) { event = null; } // not on the site any more: the ticket goes without its details
  }
  if (event) {
    eventLink.href = `events?id=${encodeURIComponent(event.id)}`;
    lede.textContent = `${name ? `${name}, here's` : "Here's"} your ticket for ${event.name}. Show the QR code at the door, or download the ticket to keep it on your phone.`;
  } else {
    eventLink.href = "events";
  }

  const data = { id, name, event: event || { name: "Your event" } };
  try {
    const canvas = await Ticket.draw(data);
    img.src = canvas.toDataURL("image/png");
    img.alt = `Ticket ${id}${event ? ` for ${event.name}` : ""}${name ? `, ${name}` : ""}`;
    img.hidden = false;
    status.hidden = true;
    save.disabled = false;
    save.addEventListener("click", () => Ticket.download(data));
  } catch (err) {
    console.error("[ticket] couldn't draw the ticket", err);
    status.textContent = `Your ticket ID is ${id}. Show it at the door.`;
  }
});
