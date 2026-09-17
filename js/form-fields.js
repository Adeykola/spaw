/**
 * form-fields.js
 * ----------------------------------------------------------------------
 * The pieces the site's forms share: a phone number with its country
 * code, where someone lives (state and country, with Nigeria's states to
 * pick from), gender, age category, and the extra questions an event's
 * registration form asks (set in the admin: Events → Registration form).
 *
 * FormFields.render(question) builds a question's inputs and hands back
 * read() and check(); formatValue() turns an answer back into words for
 * the inbox, spreadsheets and analytics. A question is
 *   { id, label, type, required, options: [..], help }
 * with type one of TYPES below, or "phone" / "email" for the fixed fields.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  // Name | ISO code | dialling code.
  const COUNTRY_LIST =
    "Afghanistan|AF|93;Albania|AL|355;Algeria|DZ|213;Andorra|AD|376;Angola|AO|244;Antigua and Barbuda|AG|1268;Argentina|AR|54;" +
    "Armenia|AM|374;Australia|AU|61;Austria|AT|43;Azerbaijan|AZ|994;Bahamas|BS|1242;Bahrain|BH|973;Bangladesh|BD|880;Barbados|BB|1246;" +
    "Belarus|BY|375;Belgium|BE|32;Belize|BZ|501;Benin|BJ|229;Bhutan|BT|975;Bolivia|BO|591;Bosnia and Herzegovina|BA|387;Botswana|BW|267;" +
    "Brazil|BR|55;Brunei|BN|673;Bulgaria|BG|359;Burkina Faso|BF|226;Burundi|BI|257;Cabo Verde|CV|238;Cambodia|KH|855;Cameroon|CM|237;" +
    "Canada|CA|1;Central African Republic|CF|236;Chad|TD|235;Chile|CL|56;China|CN|86;Colombia|CO|57;Comoros|KM|269;Congo|CG|242;" +
    "Congo (DRC)|CD|243;Costa Rica|CR|506;Côte d'Ivoire|CI|225;Croatia|HR|385;Cuba|CU|53;Cyprus|CY|357;Czechia|CZ|420;Denmark|DK|45;" +
    "Djibouti|DJ|253;Dominica|DM|1767;Dominican Republic|DO|1809;Ecuador|EC|593;Egypt|EG|20;El Salvador|SV|503;Equatorial Guinea|GQ|240;" +
    "Eritrea|ER|291;Estonia|EE|372;Eswatini|SZ|268;Ethiopia|ET|251;Fiji|FJ|679;Finland|FI|358;France|FR|33;Gabon|GA|241;Gambia|GM|220;" +
    "Georgia|GE|995;Germany|DE|49;Ghana|GH|233;Greece|GR|30;Grenada|GD|1473;Guatemala|GT|502;Guinea|GN|224;Guinea-Bissau|GW|245;" +
    "Guyana|GY|592;Haiti|HT|509;Honduras|HN|504;Hong Kong|HK|852;Hungary|HU|36;Iceland|IS|354;India|IN|91;Indonesia|ID|62;Iran|IR|98;" +
    "Iraq|IQ|964;Ireland|IE|353;Israel|IL|972;Italy|IT|39;Jamaica|JM|1876;Japan|JP|81;Jordan|JO|962;Kazakhstan|KZ|7;Kenya|KE|254;" +
    "Kiribati|KI|686;Kuwait|KW|965;Kyrgyzstan|KG|996;Laos|LA|856;Latvia|LV|371;Lebanon|LB|961;Lesotho|LS|266;Liberia|LR|231;Libya|LY|218;" +
    "Liechtenstein|LI|423;Lithuania|LT|370;Luxembourg|LU|352;Madagascar|MG|261;Malawi|MW|265;Malaysia|MY|60;Maldives|MV|960;Mali|ML|223;" +
    "Malta|MT|356;Marshall Islands|MH|692;Mauritania|MR|222;Mauritius|MU|230;Mexico|MX|52;Micronesia|FM|691;Moldova|MD|373;Monaco|MC|377;" +
    "Mongolia|MN|976;Montenegro|ME|382;Morocco|MA|212;Mozambique|MZ|258;Myanmar|MM|95;Namibia|NA|264;Nauru|NR|674;Nepal|NP|977;" +
    "Netherlands|NL|31;New Zealand|NZ|64;Nicaragua|NI|505;Niger|NE|227;Nigeria|NG|234;North Korea|KP|850;North Macedonia|MK|389;" +
    "Norway|NO|47;Oman|OM|968;Pakistan|PK|92;Palau|PW|680;Palestine|PS|970;Panama|PA|507;Papua New Guinea|PG|675;Paraguay|PY|595;" +
    "Peru|PE|51;Philippines|PH|63;Poland|PL|48;Portugal|PT|351;Qatar|QA|974;Romania|RO|40;Russia|RU|7;Rwanda|RW|250;" +
    "Saint Kitts and Nevis|KN|1869;Saint Lucia|LC|1758;Saint Vincent and the Grenadines|VC|1784;Samoa|WS|685;San Marino|SM|378;" +
    "São Tomé and Príncipe|ST|239;Saudi Arabia|SA|966;Senegal|SN|221;Serbia|RS|381;Seychelles|SC|248;Sierra Leone|SL|232;" +
    "Singapore|SG|65;Slovakia|SK|421;Slovenia|SI|386;Solomon Islands|SB|677;Somalia|SO|252;South Africa|ZA|27;South Korea|KR|82;" +
    "South Sudan|SS|211;Spain|ES|34;Sri Lanka|LK|94;Sudan|SD|249;Suriname|SR|597;Sweden|SE|46;Switzerland|CH|41;Syria|SY|963;" +
    "Taiwan|TW|886;Tajikistan|TJ|992;Tanzania|TZ|255;Thailand|TH|66;Timor-Leste|TL|670;Togo|TG|228;Tonga|TO|676;" +
    "Trinidad and Tobago|TT|1868;Tunisia|TN|216;Turkey|TR|90;Turkmenistan|TM|993;Tuvalu|TV|688;Uganda|UG|256;Ukraine|UA|380;" +
    "United Arab Emirates|AE|971;United Kingdom|GB|44;United States|US|1;Uruguay|UY|598;Uzbekistan|UZ|998;Vanuatu|VU|678;" +
    "Vatican City|VA|39;Venezuela|VE|58;Vietnam|VN|84;Yemen|YE|967;Zambia|ZM|260;Zimbabwe|ZW|263";
  const COUNTRIES = COUNTRY_LIST.split(";").map((row) => {
    const [name, iso, dial] = row.split("|");
    return { name, iso, dial: `+${dial}` };
  });
  const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
  // Listed first: where most of the audience is.
  const FIRST = ["NG", "GH", "GB", "US", "CA", "ZA", "KE"];

  const NG_STATES = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
    "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
  ];
  const GENDERS = ["Female", "Male", "Prefer not to say"];
  const AGE_CATEGORIES = ["Under 18", "18–24", "25–34", "35–44", "45–54", "55 and over"];

  // The kinds of question the admin can add to a registration form.
  const TYPES = [
    ["text", "Short answer"], ["textarea", "Paragraph"], ["select", "Dropdown list"], ["radio", "Choice buttons"],
    ["checkbox", "Tick box (yes or no)"], ["number", "Number"], ["date", "Date"], ["location", "State and country"],
  ];
  // Ready-made questions. Their ids stay the same on every event, so the
  // analytics can put the answers side by side.
  const PRESETS = {
    location: { id: "location", label: "Where do you live?", type: "location", required: true, options: [], help: "" },
    gender: { id: "gender", label: "Gender", type: "select", required: true, options: GENDERS, help: "" },
    age: { id: "age", label: "Age category", type: "select", required: true, options: AGE_CATEGORIES, help: "" },
  };
  const preset = (key) => JSON.parse(JSON.stringify(PRESETS[key]));

  function make(tag, attrs = {}, kids = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k in node && typeof v !== "string") node[k] = v;
      else node.setAttribute(k, v === true ? "" : v);
    });
    kids.filter((k) => k != null && k !== false).forEach((k) => node.append(k));
    return node;
  }

  function countryOptions(select, { dial = false, value = "NG" } = {}) {
    const option = (c) => make("option", { value: c.iso, selected: c.iso === value }, [dial ? `${c.dial} ${c.name}` : c.name]);
    select.replaceChildren(
      ...FIRST.map((iso) => option(BY_ISO.get(iso))),
      make("option", { disabled: true }, ["──────────"]),
      ...COUNTRIES.filter((c) => !FIRST.includes(c.iso)).map(option)
    );
  }

  // A phone number as it's kept: "+234 8031234567". A number typed with its
  // own + is kept as typed; a leading 0 goes (0803… is +234 803…), except
  // where the 0 is part of the number.
  function phoneValue(iso, typed) {
    const raw = String(typed || "").trim();
    if (!raw.replace(/[^\d]/g, "")) return "";
    if (raw.startsWith("+")) return raw;
    const c = BY_ISO.get(iso) || BY_ISO.get("NG");
    const local = ["IT", "VA", "SM"].includes(c.iso) ? raw : raw.replace(/^0/, "");
    return `${c.dial} ${local}`;
  }

  const filled = (v) => (v && typeof v === "object" ? Boolean(v.state && v.country) : String(v == null ? "" : v).trim() !== "");

  let seq = 0;
  function render(q, { prefix = "ff" } = {}) {
    seq += 1;
    const id = `${prefix}-${String(q.id || seq).replace(/[^\w-]/g, "")}-${seq}`;
    const label = `${q.label || ""}${q.required ? " *" : ""}`;
    const error = make("p", { class: "field-error" });
    const hint = q.help ? make("p", { class: "field-hint", text: q.help }) : null;
    const box = (controls, { labelFor = id, cls = "" } = {}) => make("div", { class: `field${q.full ? " field--full" : ""}${cls ? ` ${cls}` : ""}`, "data-question": q.id }, [
      labelFor ? make("label", { for: labelFor, text: label }) : make("p", { class: "field-label", id: `${id}-label`, text: label }),
      controls, hint, error,
    ]);
    const say = (message) => { error.textContent = message; return message; };
    const options = (list) => (Array.isArray(list) ? list : []).map((o) => String(o).trim()).filter(Boolean);
    let node;
    let read;
    let focus;
    let setOptions = null;

    switch (q.type) {
      case "textarea": {
        const ta = make("textarea", { id, rows: "3" });
        node = box(ta);
        read = () => ta.value.trim();
        focus = () => ta.focus();
        break;
      }
      case "select": {
        const sel = make("select", { id });
        setOptions = (list) => {
          const now = sel.value;
          sel.replaceChildren(make("option", { value: "", text: "Choose…" }), ...options(list).map((o) => make("option", { value: o, text: o, selected: o === now })));
        };
        setOptions(q.options);
        node = box(sel);
        read = () => sel.value;
        focus = () => sel.focus();
        break;
      }
      case "radio": {
        const group = make("div", { class: "field-choices", role: "radiogroup", "aria-labelledby": `${id}-label` },
          options(q.options).map((o, i) => make("label", {}, [make("input", { type: "radio", name: id, value: o, id: i ? null : id }), make("span", { text: o })])));
        node = box(group, { labelFor: null });
        read = () => { const on = group.querySelector("input:checked"); return on ? on.value : ""; };
        focus = () => { const first = group.querySelector("input"); if (first) first.focus(); };
        break;
      }
      case "checkbox": {
        const input = make("input", { type: "checkbox", id });
        node = make("div", { class: "field", "data-question": q.id }, [
          make("div", { class: "checkbox-field" }, [input, make("label", { for: id, text: label })]), hint, error,
        ]);
        read = () => (input.checked ? "Yes" : "No");
        focus = () => input.focus();
        break;
      }
      case "location": {
        const country = make("select", { id, autocomplete: "country-name", "aria-label": "Country" });
        countryOptions(country, { value: "NG" });
        const holder = make("div", { class: "field-pair__state" });
        let state;
        const drawState = () => {
          const before = state ? state.value : "";
          if (country.value === "NG") {
            state = make("select", { "aria-label": "State", autocomplete: "address-level1" }, [
              make("option", { value: "", text: "State…" }),
              ...NG_STATES.map((s) => make("option", { value: s, text: s, selected: s === before })),
            ]);
          } else {
            state = make("input", { type: "text", placeholder: "State, region or province", "aria-label": "State, region or province", autocomplete: "address-level1" });
          }
          holder.replaceChildren(state);
        };
        drawState();
        country.addEventListener("change", drawState);
        node = box(make("div", { class: "field-pair" }, [country, holder]));
        read = () => ({ state: String(state.value || "").trim(), country: (BY_ISO.get(country.value) || {}).name || "" });
        focus = () => (country.value ? state : country).focus();
        break;
      }
      case "phone": {
        const code = make("select", { "aria-label": "Country code", autocomplete: "tel-country-code" });
        countryOptions(code, { dial: true, value: "NG" });
        const input = make("input", { type: "tel", id, autocomplete: "tel-national", placeholder: "803 123 4567", inputmode: "tel" });
        node = box(make("div", { class: "field-phone" }, [code, input]));
        read = () => phoneValue(code.value, input.value);
        focus = () => input.focus();
        break;
      }
      default: {
        const type = ["number", "date", "email"].includes(q.type) ? q.type : "text";
        const input = make("input", { type, id, autocomplete: q.autocomplete || null, inputmode: type === "number" ? "decimal" : null });
        node = box(input);
        read = () => input.value.trim();
        focus = () => input.focus();
      }
    }

    const check = () => {
      const v = read();
      if (q.type === "checkbox") return say(q.required && v !== "Yes" ? "Tick this to continue." : "");
      if (q.type === "location") {
        if (q.required && !filled(v)) return say("Choose your country and your state.");
        return say("");
      }
      if (!filled(v)) {
        if (!q.required) return say("");
        if (q.type === "phone") return say("Enter a phone number.");
        return say(q.type === "select" || q.type === "radio" ? "Choose one." : "Answer this question.");
      }
      if (q.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return say("That email address doesn't look right.");
      if (q.type === "phone" && v.replace(/[^\d]/g, "").length < 7) return say("That phone number looks too short.");
      if (q.type === "number" && Number.isNaN(Number(v))) return say("Enter a number.");
      return say("");
    };

    return { question: q, node, read, check, focus, setOptions, disable: (on) => node.querySelectorAll("input, select, textarea").forEach((x) => { x.disabled = on; }) };
  }

  // The answers a form sends: one per question, skipping blanks.
  function answersOf(rendered) {
    return rendered
      .map((r) => ({ id: r.question.id, label: r.question.label, type: r.question.type, value: r.read() }))
      .filter((a) => (a.type === "checkbox" ? true : filled(a.value)));
  }

  function formatValue(v) {
    if (v == null) return "";
    if (typeof v === "object") return [v.state, v.country].filter(Boolean).join(", ");
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  }

  window.FormFields = { COUNTRIES, NG_STATES, GENDERS, AGE_CATEGORIES, TYPES, PRESETS, preset, render, answersOf, formatValue, phoneValue, filled, make };
})();
