/**
 * about.js
 * ----------------------------------------------------------------------
 * The About page's lists come from DB.about, which the admin edits: the
 * timeline, what the work is built on, the photographs and recognition.
 * The HTML carries the same items, so visitors without JavaScript (and
 * search engines) still get them; once anything has been published for
 * the About page's lists, they are drawn from that instead.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", async () => {
  if (!document.querySelector('[data-list^="about-"]') || typeof DB === "undefined") return;
  await (window.ContentReady || Promise.resolve());
  const content = window.Content ? Content.mergedContent() : null;
  if (!content || content.about == null || !DB.about) return; // nothing published: the HTML is current

  const rich = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    n.appendChild(Content.richFragment(html));
    return n;
  };
  const put = (name, items, build) => {
    const host = document.querySelector(`[data-list="${name}"]`);
    if (host && Array.isArray(items)) host.replaceChildren(...items.map(build));
  };

  // A link to the Talent Quest application calls like every other one
  // (.btn-quest, main.css) while applications are open.
  const applyLink = (href) => /(^|\/)symphony(\.html)?#apply$/.test(href) && api.applicationsOpen();
  put("about-timeline", DB.about.timeline, (t) => {
    const body = el("div", { class: "timeline__body" }, [rich("h3", "timeline__title", t.title), rich("p", "", t.body)]);
    const links = (t.links || []).filter((l) => l && l.label && Content.safeUrl(l.href));
    if (links.length) {
      body.appendChild(el("p", { class: "timeline__links" }, links.map((l) => el("a", { class: `btn btn-line${applyLink(l.href) ? " btn-quest" : ""}`, href: Content.safeUrl(l.href), text: l.label }))));
    }
    return el("li", { class: `timeline__item${t.current ? " is-now" : ""}` }, [el("p", { class: "timeline__year display", text: t.year || "" }), body]);
  });

  put("about-principles", DB.about.principles, (p, i) =>
    el("div", { class: "pillar-row" }, [
      el("span", { class: "pillar-row__num", text: String(i + 1).padStart(2, "0") }),
      el("div", {}, [el("h3", { class: "pillar-row__title display", text: p.title || "" }), el("p", { class: "pillar-row__body", text: p.body || "" })]),
    ]));

  put("about-photos", DB.about.photos, (p) =>
    el("figure", {}, [
      el("img", { src: Content.resolveMedia(Content.safeUrl(p.src, "image")), alt: p.alt || "", loading: "lazy" }),
      rich("figcaption", "", p.caption),
    ]));

  put("about-recognition", DB.about.recognition, (r) =>
    el("li", { class: "press-row" }, [
      el("span", { class: "press-row__year mono-index", text: r.year || "" }),
      rich("span", "press-row__title", r.title),
      el("span", { class: "press-row__tag", text: r.tag || "" }),
    ]));
});
