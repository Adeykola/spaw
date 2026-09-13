/**
 * admin.js
 * ----------------------------------------------------------------------
 * A helper the admin screens share. The screens themselves live in
 * admin-site.js (the website), admin-content.js (lists and details),
 * admin-inbox.js (the inbox and the dashboard) and admin-team.js (people
 * and the activity log); admin-core.js signs people in and shows them.
 * ----------------------------------------------------------------------
 */

// A plain table: cells may be text or DOM nodes.
function buildTable(columns, rows) {
  const thead = el("thead", {}, [el("tr", {}, columns.map((c) => el("th", { text: c })))]);
  const tbody = el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((c) => {
    const td = document.createElement("td");
    if (c instanceof Node) td.appendChild(c); else td.textContent = c;
    return td;
  }))));
  return el("div", { class: "admin-table-wrap" }, [el("table", { class: "admin-table" }, [thead, tbody])]);
}
