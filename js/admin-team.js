/**
 * admin-team.js
 * ----------------------------------------------------------------------
 * People & roles (Owner only): who can sign in, by name and email, and
 * as which role: Owner, Editor or Team. Live, a person added here signs
 * in at /admin with "First time here? Create your password"; their role
 * comes from this list, and the database checks it on every request.
 *
 * Activity log: sign-ins, publishing, uploads and changes to people.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { h, toast, dialog, head, loading } = Admin;

  const ROLE_ORDER = ["owner", "editor", "team"];

  /* ---- People & roles ----------------------------------------------- */
  Admin.register("people", {
    async render(panel) {
      const title = head("People & roles", "Who can sign in to this admin, and what each person can do.");
      panel.replaceChildren(title, loading());
      let people;
      try { people = await Backend.people.list(); } catch (err) { panel.replaceChildren(title, h("p", { class: "admin-empty", text: err.message })); return; }
      const me = Admin.session.email;
      const demo = Backend.mode === "demo";
      const rerender = () => this.render(panel);

      const roles = h("div", { class: "people-roles" }, ROLE_ORDER.map((r) =>
        h("div", { class: "people-role" }, [h("strong", { text: Backend.ROLES[r] }), h("span", { text: Backend.ROLE_HELP[r] })])));

      const rows = people.map((p) => {
        const select = h("select", { class: "admin-select", "aria-label": `Role for ${p.name || p.email}` },
          ROLE_ORDER.map((r) => h("option", { value: r, selected: p.role === r }, Backend.ROLES[r])));
        select.addEventListener("change", async () => {
          const next = select.value;
          if (p.email === me && next !== "owner") {
            const ok = await dialog({
              title: "Change your own role?",
              body: [h("p", { text: `As ${Backend.ROLES[next]} you won't see this screen any more.` })],
              actions: [["Cancel", false], ["Change it", true, "is-danger"]],
            });
            if (!ok) { select.value = p.role; return; }
          }
          try {
            await Backend.people.update(p.email, { role: next });
            toast(`${p.name || p.email} is now ${Backend.ROLES[next]}.`, "is-success");
            if (p.email === me) location.reload(); else rerender();
          } catch (err) {
            select.value = p.role;
            toast(err.message, "is-error");
          }
        });

        const actions = [];
        if (demo) {
          const pw = h("button", { type: "button", class: "pe-small-btn" }, "Set password…");
          pw.addEventListener("click", async () => {
            const input = h("input", { type: "password", class: "admin-input", autocomplete: "new-password", minlength: "8" });
            const ok = await dialog({
              title: `New password for ${p.name || p.email}`,
              body: [h("label", { class: "admin-field" }, [h("span", { text: "At least 8 characters" }), input]), h("p", { class: "pe-card__note", text: "Demo mode only. Once live, people choose and reset their own passwords by email." })],
              actions: [["Cancel", false], ["Save", true, "is-primary"]],
            });
            if (!ok) return;
            try { await Backend.people.update(p.email, { password: input.value }); toast("Password saved.", "is-success"); } catch (err) { toast(err.message, "is-error"); }
          });
          actions.push(pw);
        }
        if (p.email !== me) {
          const remove = h("button", { type: "button", class: "pe-small-btn is-danger" }, "Remove");
          remove.addEventListener("click", async () => {
            const ok = await dialog({
              title: `Remove ${p.name || p.email}?`,
              body: [h("p", { text: "They won't be able to sign in to the admin any more. Anything they published stays." })],
              actions: [["Keep them", false], ["Remove", true, "is-danger"]],
            });
            if (!ok) return;
            try { await Backend.people.remove(p.email); toast("Removed."); rerender(); } catch (err) { toast(err.message, "is-error"); }
          });
          actions.push(remove);
        }

        return [
          h("div", { class: "people-name" }, [
            h("strong", { text: p.name || "—" }),
            p.email === me ? h("span", { class: "pe-chip is-you", text: "You" }) : null,
            demo && p.hasPassword === false ? h("span", { class: "pe-chip", text: "No password yet" }) : null,
          ]),
          p.email,
          select,
          h("span", { class: "people-added" }, [
            p.addedAt ? Admin.fmtDate(p.addedAt).split(",")[0] : "—",
            p.addedBy ? h("small", { text: `by ${p.addedBy}` }) : null,
          ]),
          h("div", { class: "pe-actions-row" }, actions),
        ];
      });
      const table = buildTable(["Name", "Email", "Role", "Added", ""], rows);

      /* add someone */
      const name = h("input", { type: "text", class: "admin-input", name: "name", autocomplete: "off", required: true });
      const email = h("input", { type: "email", class: "admin-input", name: "email", autocomplete: "off", required: true });
      const role = h("select", { class: "admin-select", name: "role" }, ROLE_ORDER.map((r) => h("option", { value: r, selected: r === "editor" }, Backend.ROLES[r])));
      const password = demo ? h("input", { type: "password", class: "admin-input", name: "password", autocomplete: "new-password", minlength: "8" }) : null;
      const error = h("p", { class: "admin-auth__note", role: "alert" });
      const form = h("form", { class: "people-form", novalidate: true }, [
        h("label", { class: "admin-field" }, [h("span", { text: "Name" }), name]),
        h("label", { class: "admin-field" }, [h("span", { text: "Email" }), email]),
        h("label", { class: "admin-field" }, [h("span", { text: "Role" }), role]),
        password ? h("label", { class: "admin-field" }, [h("span", { text: "Password (demo only, optional)" }), password]) : null,
        error,
        h("button", { type: "submit", class: "btn btn-solid" }, "Add person"),
      ]);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        error.textContent = "";
        error.dataset.kind = "";
        if (!name.value.trim()) { error.textContent = "Add their name."; error.dataset.kind = "error"; return; }
        try {
          await Backend.people.add({ name: name.value, email: email.value, role: role.value, password: password ? password.value : "" });
          toast(`${name.value.trim()} added as ${Backend.ROLES[role.value]}.`, "is-success");
          rerender();
        } catch (err) {
          error.textContent = err.message;
          error.dataset.kind = "error";
        }
      });

      const how = demo
        ? "Demo mode: give them a password here, or they can choose one with “First time here? Create your password” on the sign-in screen."
        : `They go to ${Backend.root}admin, choose “First time here? Create your password” with this email, and confirm the email Supabase sends them. Then they sign in.`;

      panel.replaceChildren(
        title,
        roles,
        h("div", { class: "people-layout" }, [
          h("div", { class: "people-table" }, [table]),
          h("div", { class: "admin-card people-add" }, [h("p", { class: "admin-card__title", text: "Add someone" }), form, h("p", { class: "pe-card__note people-how", text: how })]),
        ])
      );
    },
  });

  /* ---- Activity log ------------------------------------------------- */
  const ACTIONS = {
    "sign-in": "Signed in",
    publish: "Published",
    discard: "Discarded a draft",
    restore: "Brought back an earlier version",
    "media.upload": "Uploaded a file",
    "media.delete": "Deleted a file",
    "people.insert": "Added a person",
    "people.update": "Changed a person",
    "people.delete": "Removed a person",
  };
  const KINDS = {
    all: ["Everything", () => true],
    publishing: ["Publishing", (a) => ["publish", "discard", "restore"].includes(a)],
    uploads: ["Uploads", (a) => a.startsWith("media.")],
    people: ["People", (a) => a.startsWith("people.")],
    signins: ["Sign-ins", (a) => a === "sign-in"],
  };

  function details(row) {
    const d = row.detail || {};
    if (row.action === "publish") {
      const pages = String(row.target || "").split(",").map((s) => s.trim()).filter(Boolean).map(Admin.labelForKey).join(", ");
      return [pages, d.note ? `“${d.note}”` : "", d.version ? `version ${d.version}` : ""].filter(Boolean).join(" · ");
    }
    if (row.action === "discard") return Admin.labelForKey(row.target || "");
    if (row.action.startsWith("people.")) return [row.target, d.role ? Backend.ROLES[d.role] : ""].filter(Boolean).join(" · ");
    if (row.action === "restore") return [row.target, d.drafted != null ? `${d.drafted} drafts` : ""].filter(Boolean).join(" · ");
    return row.target || "";
  }

  Admin.register("activity", {
    async render(panel) {
      const title = head("Activity log", "Sign-ins, publishing, uploads and changes to people, newest first.");
      panel.replaceChildren(title, loading());
      let rows;
      let people = [];
      try {
        [rows, people] = await Promise.all([Backend.activity.list(300), Backend.people.list().catch(() => [])]);
      } catch (err) {
        panel.replaceChildren(title, h("p", { class: "admin-empty", text: err.message }));
        return;
      }
      const names = new Map(people.map((p) => [p.email, p.name || p.email]));
      const who = h("select", { class: "admin-select", "aria-label": "Person" }, [
        h("option", { value: "" }, "Everyone"),
        ...Array.from(new Set(rows.map((r) => r.actor))).map((a) => h("option", { value: a }, names.get(a) || a)),
      ]);
      const kind = h("select", { class: "admin-select", "aria-label": "Kind" }, Object.entries(KINDS).map(([k, [label]]) => h("option", { value: k }, label)));
      const host = h("div");
      const draw = () => {
        const list = rows.filter((r) => (!who.value || r.actor === who.value) && KINDS[kind.value][1](r.action || ""));
        if (!list.length) { host.replaceChildren(h("p", { class: "admin-empty", text: "Nothing recorded yet." })); return; }
        host.replaceChildren(buildTable(["When", "Who", "What", "Details"], list.map((r) => [
          Admin.fmtDate(r.at),
          names.get(r.actor) || r.actor,
          ACTIONS[r.action] || r.action,
          details(r),
        ])));
      };
      who.addEventListener("change", draw);
      kind.addEventListener("change", draw);
      panel.replaceChildren(title, h("div", { class: "activity-filters" }, [who, kind]), host);
      draw();
    },
  });
})();
