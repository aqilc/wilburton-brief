// Wilburton zoning page. All data is static (data/bundle.js); every figure shown comes from rules.json rows or lots.json facts.
const D = window.WB;
const $ = s => document.querySelector(s);
const LAND = "425-452-4188";
const NEW = ["UC", "MU-H", "MU-M", "MUR-M"];
const CAP_COLOR = { UC: "#27358f", "MU-H": "#2f78b7", "MU-M": "#5aa0a8", "MUR-M": "#5aa0a8" };
const RAIL = "#6b3fa0", TRAIL = "#2f7d3a", DRAWN = ["Wilburton", "East Main"];
const lots = new Map(D.lots.map(l => [l.id, l]));
const core = D.lots.filter(l => l.state === "ok");
const odd = D.lots.filter(l => l.state === "split" || l.state === "nozone");
const rule = (d, k) => D.rules.rows.find(r => r.district === d && r.key === k).value;
const fmt = n => n.toLocaleString("en-US");
const far = v => (v == null ? "Unlimited" : v.toFixed(1));
const pct = v => `${Math.round(v * 100)}%`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let farMode = "max", map = null, selected = null;

function street(a) {
  if (!a) return "";
  return a.split(/\s+/).map(w => /^(N|S|E|W|NE|NW|SE|SW)$/.test(w) ? w : /^\d+(ST|ND|RD|TH)$/.test(w) ? w.toLowerCase() : w.toLowerCase().replace(/(^|-)[a-z]/g, c => c.toUpperCase())).join(" ");
}
const title = l => street(l.addr) || `Parcel ${l.id}`;
const capText = d => `up to ${rule(d, "height")} ft with amenity incentives`;

// ---- build-out: one way a lot could fill in, all homes to its Max FAR and height cap on 11 ft floors, a rough 1,000 sq ft a home
const FLOOR_FT = 11, HOME_SF = 1000, M_PER_FT = 0.3048;
const PODIUM = rule("all", "floor_plate_from") / FLOOR_FT;  // the floor plate limit starts at 55 ft: 5 floors over the whole lot
const homes = fa => Math.round(fa / HOME_SF / 10) * 10;
function buildOut(l) {
  const far = rule(l.zone, "max_far_res");
  if (far != null) return { floors: Math.ceil(far), plate: l.sqft, fa: l.fa.max_res };  // MU-M, MUR-M: the whole lot, Max FAR floors high
  const floors = Math.floor(rule(l.zone, "height") / FLOOR_FT), plate = Math.min(rule(l.zone, "floor_plate_res"), l.sqft);
  return { floors, plate, fa: l.sqft * PODIUM + plate * (floors - PODIUM) };  // UC, MU-H: residential FAR is unlimited, so the cap and plate bound it
}
const bo = new Map(core.map(l => [l.id, buildOut(l)]));
// the tower is the lot shrunk about its centroid to the plate's area
const shrink = (poly, k) => { const [cx, cy] = centroid({ type: "Polygon", coordinates: poly }); return poly.map(r => r.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k])); };
const BO = { type: "FeatureCollection", features: D.map.caps.features.flatMap(f => {
  const l = lots.get(f.properties.id), b = bo.get(l.id), top = b.floors * FLOOR_FT * M_PER_FT, p = f.properties;
  if (b.plate === l.sqft) return [{ ...f, properties: { ...p, cap_m: top } }];
  const g = f.geometry, k = Math.sqrt(b.plate / l.sqft), base = PODIUM * FLOOR_FT * M_PER_FT;
  const tower = g.type === "Polygon" ? shrink(g.coordinates, k) : g.coordinates.map(poly => shrink(poly, k));
  return [{ ...f, properties: { ...p, cap_m: base } }, { type: "Feature", geometry: { type: g.type, coordinates: tower }, properties: { ...p, base_m: base, cap_m: top } }];
}) };
function boNote(l) {
  const b = bo.get(l.id);
  const rest = b.plate === l.sqft ? " over the whole lot" : `: ${PODIUM} over the whole lot, then ${fmt(b.plate)} sq ft a floor`;
  return `Build-out puts homes on ${b.floors} floors${rest}. About ${fmt(homes(b.fa))} homes at a rough ${fmt(HOME_SF)} sq ft each. One way the lot could fill in, not a forecast.`;
}

// ---- card
const CHIP = { chart: "Chart 20.20.010", amen: "LUC 20.25R.050.D.1", b2: "LUC 20.25R.040.B.2", b3: "LUC 20.25R.040.B.3", c8: "LUC 20.20.525.C.8",
  afj: "LUC 20.20.128.J", ph1: "LUC 20.25R.060.A.4", blk: "LUC 20.25R.020.B.2", rcw: "RCW 36.70A.840", park: "ESSB 5184",
  sta: "RCW 36.70A.030", gc: "LUC 20.25R.020.C.3", gcw: "LUC 20.25R.030.G.3", gcd: "LUC 20.50.022" };
const chip = k => `<button type="button" class="chip" data-cite="${k}" aria-expanded="false">${esc(CHIP[k].replace("LUC ", ""))}</button>`;
const tr = (label, value, cites = [], sub = "") =>
  `<tr><th scope="row">${label}</th><td>${value}${sub ? `<span class="sub">${sub}</span>` : ""}</td><td class="cites">${cites.map(chip).join("")}</td></tr>`;

const sec = (name, cites, body, lead = "") => `<section class="sec"><div class="sechead"><h3>${name}</h3><span class="chips">${lead}${cites.map(chip).join("")}</span></div>${body}</section>`;
function oddSentence(l) {
  if (l.state === "nozone") return `This lot falls outside every polygon in the city's zoning layer (the parcel layer says ${l.old}), so this page can't tell its district. Call Land Use at ${LAND}.`;
  if (l.state === "split") {
    const parts = Object.entries(l.share).sort((a, b) => b[1] - a[1]).map(([z, v]) => `${z} (${pct(v)})`);
    return `This lot is split between ${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}, and this page doesn't work out height or floor area for a split lot. Call Land Use at ${LAND}.`;
  }
  return `This lot is zoned ${l.zone}, outside the four new Wilburton districts this page covers. Call Land Use at ${LAND}.`;
}
const day = iso => new Date(`${iso}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const list = xs => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const ASK = ["Predevelopment Services", "Preapplication Conference", "Zoning Status"];
// filings since the rezone, from the city's permit data at bake time; names of people and companies are dropped in bake.py
function filedSec(l) {
  const fs = D.feed.filed[l.id] ?? [];
  const items = fs.map(f => `<li><span>${esc(f.type)}</span><span class="num">${day(f.date)}</span><span class="sub">${esc(f.no)}${!ASK.includes(f.type) && f.homes ? `, ${fmt(f.homes)} homes in the filing` : ""}</span></li>`).join("");
  return sec("Filed since the rezone", [], `${items ? `<ul class="filed">${items}</ul>` : `<p class="secval">None on this lot.</p>`}<p class="secnote">Requests for predevelopment help, preapplication conferences and zoning status, design reviews and master development plans, from the city's permit data on ${day(D.feed.pulled)}. Filed is not approved.</p>`);
}
// any intersection counts, so a sliver at the lot's edge counts too
function hazardSec(l) {
  const t = D.feed.touches[l.id];
  return t ? sec("Mapped on this lot", [], `<p class="secval">City maps show ${list(t.map(x => `a ${x}`))} touching this lot. How much of the lot ${t.length > 1 ? "they cover" : "it covers"} wasn't measured. Ask Land Use at ${LAND}.</p>`) : "";
}
function lawSecs(l) {
  const all = k => rule("all", k);
  const afford = sec("Affordable homes", ["afj", "ph1"], `<p class="secval">Applies to a new building with ${all("afford_min_units")} or more homes, or more than ${fmt(all("afford_min_nonres_sf"))} sq ft of nonresidential floor area. For rent, one of: ${all("afford_rent_a_pct")}% of homes affordable at ${all("afford_rent_a_ami")}% of area median income, ${all("afford_rent_b_pct")}% at ${all("afford_rent_b_ami")}%, or ${all("afford_rent_c_pct")}% at ${all("afford_rent_c_ami")}%. The code also allows a fee in lieu, a land transfer or a mix.</p>
    <p class="secnote">In the ordinance's first phase it's ${all("afford_first_pct")}% at ${all("afford_first_ami")}% for rent, and the fee is ${all("afford_first_fee_cut")}% lower. Which phase applies is the Director's call, so ask Land Use at ${LAND}.</p>`);
  const blocks = l.sqft >= all("block_min_site_sf") ? sec("Blocks", ["blk"], `<p class="secval">On a site of ${fmt(all("block_min_site_sf"))} sq ft or more, a block runs at most ${fmt(all("block_perimeter_ft"))} ft around and ${all("block_ns_ft")} ft north to south, bordered by streets or access corridors.</p><p class="secnote">Sites between I-405 and 116th Ave NE, and parcels on 116th with light rail guideway, follow their own limits in the same section.</p>`) : "";
  const law = sec("State law", ["park", "rcw", "sta"], `<p class="secval">Washington caps required parking at ${all("parking_max_per_home")} space per multifamily home. Cities must allow at least ${all("station_far_avg").toFixed(1)} FAR on average within a rail station area by December 31, 2029 at the latest.</p><p class="secval">${stationSentence(l)}</p><p class="secnote">The city can redraw a station area with the state Commerce department's approval, and can leave out parts of a lot such as critical areas (RCW 36.70A.840).</p>`);
  const gc = sec("Grand Connection", ["gc", "gcw", "gcd"], `<p class="secval">A building next to an elevated segment of the Grand Connection gives the public direct access to it where feasible. Where a building adjoins the Grand Connection, 75% of that frontage holds active uses, level with any elevated segment.</p><p class="secnote">The ordinance names the Grand Connection, but this page found no published route for it, so it doesn't draw one or say which lots it passes.</p>`);
  return afford + blocks + law + gc;
}
// a rail station area is every lot "fully or partially within one-half mile walking distance of an entrance" to a light rail station (RCW 36.70A.030); scripts/transit.py walks OpenStreetMap streets and paths from each entrance
function stationSentence(l) {
  const at = D.transit.lots[l.id];
  if (!at) return "By this page's measure, this lot is outside every rail station area.";
  return `By this page's measure, part of this lot is within a half-mile walk of ${at.length > 1 ? `entrances to the ${list(at)} stations` : `an entrance to ${at[0]} Station`}, along OpenStreetMap streets and paths.`;
}
function modelLine(l, ref = "the table above") {
  const s = D.sentences[l.id];
  if (!s || !s.ok) return "";
  return `<figure class="model"><blockquote>${esc(s.text)}</blockquote><figcaption>Written by a language model when this page was built. Every figure in it was checked against ${ref}.</figcaption></figure>`;
}
function cardHTML(l) {
  const head = `<h2 tabindex="-1">${esc(title(l))}</h2><p class="meta">Parcel ${l.id}, ${fmt(l.sqft)} sq ft lot</p>`;
  if (l.state !== "ok") {
    const shares = Object.entries(l.share).sort((a, b) => b[1] - a[1]);
    const rows = shares.map(([z, v]) => tr(z, pct(v), NEW.includes(z) ? ["chart"] : [], NEW.includes(z) ? D.rules.districts[z] : "Outside the new districts")).join("");
    const near = l.state === "other" ? "" : hazardSec(l) + filedSec(l);
    return `${head}<p class="state">${esc(oddSentence(l))}</p>${rows ? `<table class="facts num"><caption>Share of the lot in each zoning polygon</caption>${rows}</table>` : ""}${near}${modelLine(l)}${actions()}`;
  }
  const d = l.zone, fa = l.fa, plate = rule(d, "floor_plate_nonres");
  const unm = l.unmeasured ? `${l.unmeasured} more ${l.unmeasured === 1 ? "footprint has" : "footprints have"} no measured height, hatched on the map.` : "";
  const stood = l.tallest == null ? `<div class="stat">None</div><div class="statlab">measured on this lot</div>` : `<div class="stat">${l.tallest}<small> ft</small></div><div class="statlab">tallest of ${l.measured} measured, 2021 lidar</div>`;
  const sf = v => (v == null ? "Unlimited" : `${fmt(v)} sf`);
  const row = (m, label, a, b) => `<tr class="${m && farMode === m ? "on" : ""}"><th scope="row">${label}</th><td>${a}</td><td>${b}</td></tr>`;
  const mx = rows => `<table class="mx num"><thead><tr><th></th><th scope="col">Nonresidential</th><th scope="col">Residential</th></tr></thead><tbody>${rows}</tbody></table>`;
  return `${head}<div class="distwrap"><p class="dist"><b>${d}</b> ${D.rules.districts[d]} ${chip("chart")}</p></div><p class="note">The parcel layer still says ${esc(l.old)}, from before the rezone.</p>
    ${sec("Height", ["chart", "amen"], `<div class="hero"><div><div class="stat">${rule(d, "height")}<small> ft</small></div><div class="statlab">cap, with amenity incentives</div></div><div>${stood}</div></div>${unm ? `<p class="note">${unm}</p>` : ""}`, `<span class="forwhat">Cap</span>`)}
    ${rule(d, "height") >= 100 ? sec("Above the cap", ["b2", "c8"], `<p class="secval">Mechanical equipment up to ${rule("all", "projection_mech")} ft more, ${rule("all", "projection_mech_lifesci")} ft with life&nbsp;science uses.</p>`) : ""}
    ${sec("Floor area", ["chart", "amen"], `${mx(row("base", "Base FAR", far(rule(d, "base_far_nonres")), far(rule(d, "base_far_res"))) + row("base", "At base", sf(fa.base_nonres), sf(fa.base_res)) + row("max", "Max FAR", far(rule(d, "max_far_nonres")), far(rule(d, "max_far_res"))) + row("max", "At max", sf(fa.max_nonres), sf(fa.max_res)) + (farMode === "build" ? row("build", "Build-out", "None", sf(bo.get(l.id).fa)) : ""))}<p class="secnote">Max needs bonus floor area from amenity incentives.</p>${farMode === "build" ? `<p class="secnote">${boNote(l)}</p>` : ""}`)}
    ${plate ? sec("Floor plate", ["chart", "b3"], `${mx(row("", "Maximum", `${fmt(plate)} gsf`, `${fmt(rule(d, "floor_plate_res"))} gsf`))}<p class="secnote">Above ${rule("all", "floor_plate_from")} ft, where a building exceeds ${rule("all", "floor_plate_when_over")} ft.</p>`) : ""}
    <div class="more">${lawSecs(l)}${hazardSec(l)}${filedSec(l)}</div>
    ${modelLine(l, "the figures above")}${actions()}`;
}
const actions = () => `<div class="actions"><button type="button" data-act="link">Copy link</button><button type="button" data-act="csv">Download CSV</button><button type="button" data-act="print">Print</button><button type="button" data-act="report" aria-expanded="false">Report a wrong figure</button></div>`;

function quoteHTML(k) {
  const q = D.rules.quotes[CHIP[k]];
  let body = q.text.split("\n").map(p => `<p>${esc(p)}</p>`).join("");
  if (q.table) {
    const cols = [["UC", "Nonres."], ["UC", "Res."], ["MU-H", "Nonres."], ["MU-H", "Res."], ["MU-M", "All"], ["MUR-M", "All"]];
    const key = (c, base) => base + (c[1] === "Res." ? "_res" : "_nonres");
    const val = (c, k2) => { const v = rule(c[0], k2); return v == null ? (k2.startsWith("max_far") ? "Unlimited" : "N/A") : k2 === "height" ? `${v}'` : k2.startsWith("floor") ? `${fmt(v)} gsf` : v.toFixed(1); };
    const sel = selected && lots.get(selected).zone;
    const line = (label, f) => `<tr><th scope="row">${label}</th>${cols.map(c => `<td class="${c[0] === sel ? "on" : ""}">${f(c)}</td>`).join("")}</tr>`;
    body = `<div class="chartwrap" tabindex="0" role="region" aria-label="Chart 20.20.010, scrolls sideways"><table class="chart num"><tr><th></th>${cols.map(c => `<th scope="col" class="${c[0] === sel ? "on" : ""}">${c[0]}<br><span>${c[1]}</span></th>`).join("")}</tr>
      ${line("Max Height (3)", c => val(c, "height"))}${line("Base FAR", c => val(c, key(c, "base_far")))}${line("Max. FAR", c => val(c, key(c, "max_far")))}
      ${line("Maximum Floor Plate Above 55' Where Building Exceeds 100' (4)(5)", c => val(c, key(c, "floor_plate")))}</table></div>${body}`;
  }
  return `<div class="quote"><p class="qtitle">${esc(q.title)}</p>${body}<p class="src">${esc(q.src)}</p></div>`;
}

// use counts kept in this browser only (no server): read and exported on tally.html
function tally(k) {
  try {
    const t = JSON.parse(localStorage.getItem("wb-tally") || "null") ?? { since: new Date().toISOString().slice(0, 10) };
    t[k] = (t[k] ?? 0) + 1;
    localStorage.setItem("wb-tally", JSON.stringify(t));
  } catch {}  // storage off (private window, locked-down profile): the page works without counts
}
function openQuote(btn) {
  const card = $("#card"), section = btn.closest(".sec, .distwrap"), was = btn.getAttribute("aria-expanded") === "true";
  card.querySelectorAll(".qrow").forEach(r => r.remove());
  card.querySelectorAll(".chip[aria-expanded=true]").forEach(b => b.setAttribute("aria-expanded", "false"));
  if (was) return;
  tally("quotes");
  btn.setAttribute("aria-expanded", "true");
  if (section) section.insertAdjacentHTML("beforeend", `<div class="qrow">${quoteHTML(btn.dataset.cite)}</div>`);
  else btn.closest("tr").insertAdjacentHTML("afterend", `<tr class="qrow"><td colspan="3">${quoteHTML(btn.dataset.cite)}</td></tr>`);
  // the chart is wider than the card on a narrow panel: start this lot's district columns just right of the sticky row labels
  const wrap = card.querySelector(".qrow .chartwrap"), on = wrap && wrap.querySelector("th.on");
  if (on) wrap.scrollLeft = on.offsetLeft - wrap.querySelector("th").offsetWidth;
}

function show(id, { move = true, focus = false } = {}) {
  const l = lots.get(id);
  if (!l) return;
  if (selected !== id) tally(l.state === "ok" ? "answered" : "refused");
  selected = id;
  $("#card").innerHTML = cardHTML(l);
  $("#card").classList.add("has");
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  if (focus) $("#card h2").focus({ preventScroll: true });
  if (matchMedia("(max-width: 760px)").matches && focus) $("#card").scrollIntoView({ block: "start" });
  if (map) {
    if (map.getLayer("cap-sel")) {
      map.setFilter("sel-line", ["==", ["get", "id"], id]);
      map.setFilter("cap-sel", ["==", ["get", "id"], id]);
    }
    if (move) {
      const f = D.map.lots.features.find(x => x.properties.id === id);
      const c = centroid(f.geometry);
      map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 16), duration: reduced ? 0 : 800, easing: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) });
    }
  }
  if (!map) document.querySelectorAll("#nogl tr[data-id]").forEach(r => r.classList.toggle("on", r.dataset.id === id));
}
function centroid(g) {
  const ring = (g.type === "Polygon" ? g.coordinates : g.coordinates[0])[0];
  const s = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

function emptyCard() {
  $("#card").classList.remove("has");
  const where = document.body.classList.contains("nogl") ? "Pick a lot in the table" : "Click a lot on the map";
  const F = D.feed, asked = n => ASK.reduce((a, t) => a + n[t], 0);
  $("#card").innerHTML = `<p class="hint">${where}, or find one by address. The card lists the code's numbers for that lot, each with the section it comes from.</p>
    <p class="demand">Since the rezone on ${day(F.rezone)}, <b>${asked(F.after)}</b> requests for predevelopment help, preapplication conferences or zoning status were filed on ${F.ask_lots} of the ${F.lots} lots in the new districts, against ${asked(F.before)} in the same span before. City permit data to ${day(F.latest)}.</p>`;
}

// ---- record export
function csv(l) {
  const rows = [["Field", "Value", "Source"], ["Address", title(l), "City of Bellevue parcels"], ["Parcel", l.id, "City of Bellevue parcels"], ["Lot area (sq ft)", l.sqft, "City of Bellevue parcels"]];
  if (l.state === "ok") {
    const d = l.zone;
    rows.push(["District", d, "Zoning polygons (Ord 6847)"], ["Parcel layer zoning column", l.old, "City of Bellevue parcels (predates the rezone)"],
      ["Height", capText(d), "Chart 20.20.010; LUC 20.25R.050.D.1"],
      ["Base FAR nonresidential", far(rule(d, "base_far_nonres")), "Chart 20.20.010"], ["Base FAR residential", far(rule(d, "base_far_res")), "Chart 20.20.010"],
      ["Max FAR nonresidential", far(rule(d, "max_far_nonres")), "Chart 20.20.010"], ["Max FAR residential", far(rule(d, "max_far_res")), "Chart 20.20.010"],
      ["Floor area at base FAR nonresidential (sf)", l.fa.base_nonres, "lot area x Chart 20.20.010"], ["Floor area at base FAR residential (sf)", l.fa.base_res, "lot area x Chart 20.20.010"],
      ["Floor area at max FAR nonresidential (sf)", l.fa.max_nonres, "lot area x Chart 20.20.010"], ["Floor area at max FAR residential (sf)", l.fa.max_res ?? "Unlimited", "lot area x Chart 20.20.010"]);
  } else rows.push(["Districts (share of lot)", Object.entries(l.share).map(([z, v]) => `${z} ${pct(v)}`).join(", "), "Zoning polygons"], ["Note", oddSentence(l), ""]);
  rows.push(["Tallest measured building (ft)", l.tallest ?? "none measured", "King County West 2021 lidar"], ["Footprints with no measured height", l.unmeasured, "City buildings layer vs 2021 lidar"]);
  if (l.state !== "other") {
    rows.push(["Mapped on the lot (touches)", (D.feed.touches[l.id] ?? ["none"]).join(", "), `City GIS, pulled ${D.feed.pulled}`]);
    for (const f of D.feed.filed[l.id] ?? []) rows.push([`Filed ${f.date}`, `${f.type}, ${f.no}${f.homes && !ASK.includes(f.type) ? `, ${f.homes} homes in the filing` : ""}`, `City permit data, pulled ${D.feed.pulled}; filed, not approved`]);
  }
  rows.push([$("#panel footer p").textContent, "", ""]);  // the print keeps this footer line; the CSV carries it too
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
function reportBox(l) {
  const text = `Wrong figure on the Wilburton zoning page\nLot: ${l.addr ? `${title(l)}, parcel ${l.id}` : `parcel ${l.id}`}\nLink: ${location.href}\nWhich figure: \nWhat it should be: \nWhere the right figure comes from: `;
  return `<div class="report"><label for="rtext">Fill in the last three lines, then copy the text into an email or note to whoever keeps this page.</label><textarea id="rtext" rows="7">${esc(text)}</textarea><div class="actions"><button type="button" data-act="rcopy">Copy text</button><a href="mailto:" data-act="rmail">Open in email</a></div></div>`;
}
async function act(kind) {
  const l = lots.get(selected);
  if (kind === "print") return print();
  if (kind === "report") {
    const btn = $('[data-act="report"]'), open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    if (open) return $("#card .report").remove();
    btn.closest(".actions").insertAdjacentHTML("afterend", reportBox(l));
    // caret after "Which figure: ", the first line to fill in
    const box = $("#rtext"), at = box.value.indexOf("Which figure: ") + 14;
    box.focus();
    return box.setSelectionRange(at, at);
  }
  if (kind === "rcopy" || kind === "rmail") {
    tally("reports");
    // no address: the person picks who gets it
    if (kind === "rmail") return ($('[data-act="rmail"]').href = `mailto:?subject=${encodeURIComponent("Wrong figure on the Wilburton zoning page")}&body=${encodeURIComponent($("#rtext").value)}`);
    try { await navigator.clipboard.writeText($("#rtext").value); $('[data-act="rcopy"]').textContent = "Copied"; }
    catch { $("#rtext").select(); }
    return;
  }
  if (kind === "csv") {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv(l)], { type: "text/csv" })), download: `wilburton-${l.id}.csv` });
    a.click();
    return URL.revokeObjectURL(a.href);
  }
  const btn = $('[data-act="link"]');
  try { await navigator.clipboard.writeText(location.href); btn.textContent = "Link copied"; }
  catch { prompt("Link to this lot", location.href); }
}

// ---- find
const norm = s => s.toUpperCase().replace(/[.,#]/g, " ").replace(/\bAVENUE\b/g, "AVE").replace(/\bSTREET\b/g, "ST").replace(/\bPLACE\b/g, "PL").replace(/\bNORTHEAST\b/g, "NE").replace(/\bSOUTHEAST\b/g, "SE").replace(/\b(\d+)\s+(ST|ND|RD|TH)\b/g, "$1$2").replace(/\s+/g, " ").trim();
function find(q) {
  // "Parcel 332505-9041" (the Assessor's dashed form) and "316 116th Ave NE, Bellevue WA 98004" both reduce to what lots.json holds
  const n = norm(q.split(",")[0]).replace(/^PARCEL\s+/, "").replace(/(\s+(BELLEVUE|WA|\d{5}(-\d{4})?))+$/, "").replace(/(\d)-(\d)/g, "$1$2");
  if (!n) return null;
  const all = D.lots;
  return all.find(l => l.id === n) || all.find(l => norm(l.addr) === n) || all.find(l => l.addr && norm(l.addr).startsWith(n)) || all.find(l => l.addr && norm(l.addr).includes(n));
}

// the address list is drawn by the page: the browser's own datalist can't be styled or sized to the input
const qInput = $("#q"), sugg = $("#sugg");
let hits = [], hitAt = -1, hitMore = 0;
function paintSugg() {
  sugg.innerHTML = hits.map((l, i) => `<li role="option" data-id="${l.id}" aria-selected="${i === hitAt}"><span>${esc(title(l))}</span><span class="z">${l.state === "ok" ? esc(l.zone) : ""}</span></li>`).join("") + (hitMore ? `<li class="more" role="presentation">${hitMore} more, keep typing</li>` : "");
  sugg.style.width = `${qInput.offsetWidth}px`;
  sugg.hidden = !hits.length;
  qInput.setAttribute("aria-expanded", String(!!hits.length));
}
function closeSugg() {
  hits = [];
  hitAt = -1;
  hitMore = 0;
  paintSugg();
}
function pickSugg(l) {
  qInput.value = title(l);
  closeSugg();
  show(l.id, { focus: true });
}
qInput.addEventListener("input", () => {
  const n = norm(qInput.value);
  const all = n ? D.lots.filter(l => l.addr && norm(l.addr).includes(n)).sort((a, b) => title(a).localeCompare(title(b), "en", { numeric: true })) : [];
  hits = all.slice(0, 7);
  hitMore = all.length - hits.length;
  hitAt = -1;
  paintSugg();
});
qInput.addEventListener("keydown", e => {
  if (!hits.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    hitAt = (hitAt + (e.key === "ArrowDown" ? 1 : hits.length - 1 + (hitAt < 0 ? 1 : 0))) % hits.length;
    paintSugg();
  } else if (e.key === "Enter" && hitAt >= 0) {
    e.preventDefault();
    pickSugg(hits[hitAt]);
  } else if (e.key === "Escape") closeSugg();
});
// mousedown, so the pick lands before the input's blur closes the list
sugg.addEventListener("mousedown", e => {
  e.preventDefault();
  const li = e.target.closest("li[data-id]");
  if (li) pickSugg(lots.get(li.dataset.id));
});
qInput.addEventListener("blur", closeSugg);

// ---- FAR toggle and totals
function totals() {
  $("#k-cap").textContent = farMode === "build" ? "Build-out, all homes" : "Height cap, reached with amenity incentives";
  if (farMode === "build") {
    const line = (d, ls) => { const fa = ls.reduce((a, l) => a + bo.get(l.id).fa, 0); return `<tr><th scope="row">${d}</th><td>${ls.length}</td><td>${fmt(fa)}</td><td>${fmt(homes(fa))}</td></tr>`; };
    $("#fold summary").textContent = "Build-out by district";
    $("#totals").innerHTML = `<caption>Across the ${core.length} single-district lots</caption><tr><th></th><th scope="col">Lots</th><th scope="col">Floor area, sq ft</th><th scope="col">Homes</th></tr>${NEW.map(d => line(d, core.filter(l => l.zone === d))).join("")}${line("All", core)}`;
    $("#farnote").textContent = `Every lot built to its height cap and Max FAR with amenity incentives, all homes, on ${FLOOR_FT} ft floors at a rough ${fmt(HOME_SF)} sq ft a home. One way the lots could fill in, not a forecast.`;
    return;
  }
  const k = farMode;
  const rows = NEW.map(d => {
    const ls = core.filter(l => l.zone === d);
    const nr = ls.reduce((a, l) => a + l.fa[`${k}_nonres`], 0);
    const rr = ls.some(l => l.fa[`${k}_res`] == null) ? "Unlimited" : fmt(ls.reduce((a, l) => a + l.fa[`${k}_res`], 0));
    return `<tr><th scope="row">${d}</th><td>${ls.length}</td><td>${far(rule(d, `${k}_far_nonres`))} / ${far(rule(d, `${k}_far_res`))}</td><td>${fmt(nr)}</td><td>${rr}</td></tr>`;
  }).join("");
  $("#fold summary").textContent = `Floor area by district at ${k} FAR, sq ft`;
  $("#totals").innerHTML = `<caption>Across the ${core.length} single-district lots</caption><tr><th></th><th scope="col">Lots</th><th scope="col">FAR</th><th scope="col">Nonres.</th><th scope="col">Res.</th></tr>${rows}`;
  $("#farnote").textContent = farMode === "base"
    ? "The code sets no height for base FAR. The glass is faded because the cap applies only to a building that earns bonus floor area."
    : "Max FAR and the height cap both need bonus floor area from amenity incentives.";
}
function setFar(m) {
  farMode = m;
  document.querySelectorAll("[data-far]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.far === m)));
  totals();
  if (map) {
    map.getSource("caps").setData(m === "build" ? BO : D.map.caps);
    map.setPaintProperty("cap", "fill-extrusion-opacity", { base: 0.06, max: 0.2, build: 0.55 }[m]);
    map.setPaintProperty("cap-roof", "fill-extrusion-opacity", m === "base" ? 0.12 : 0.6);
  }
  if (selected) { const scroll = $("#card").scrollTop; show(selected, { move: false }); $("#card").scrollTop = scroll; }
}

// ---- map
function hatch(color, cross) {
  const s = 16, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath();
  for (const o of [-s, 0, s]) { g.moveTo(o, s); g.lineTo(o + s, 0); if (cross) { g.moveTo(o, 0); g.lineTo(o + s, s); } }
  g.stroke();
  return g.getImageData(0, 0, s, s);
}
function startMap() {
  map = new maplibregl.Map({
    container: "map", style: window.WB_BASEMAP.style(), minZoom: 13, maxZoom: 18.5, maxPitch: 80,
    center: [-122.1855, 47.6163], zoom: 15.0, pitch: 68, bearing: -30, attributionControl: false, preserveDrawingBuffer: true,
    maxBounds: [[-122.205, 47.594], [-122.155, 47.633]],
  });
  window.map = map;  // read by scripts/shoot.ts
  const lg = $("#legend");
  if (innerWidth > 760) map.setPadding({ left: lg.offsetLeft + lg.offsetWidth, top: 0, right: 0, bottom: 0 });  // keep the view clear of the legend
  map.addControl(new maplibregl.AttributionControl({ compact: innerWidth <= 760, customAttribution: "© OpenMapTiles © OpenStreetMap contributors. Zoning, parcels and buildings: City of Bellevue. Heights: King County West 2021 lidar (USGS 3DEP)." }));
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.on("error", e => console.warn(e.error && e.error.message));
  map.on("load", () => {
    map.addImage("hatch", hatch("#9a3412", false), { pixelRatio: 2 });
    map.addImage("hatch2", hatch("#b45309", true), { pixelRatio: 2 });
    for (const k of ["lots", "caps", "bld", "unm", "labels"]) map.addSource(k, { type: "geojson", data: D.map[k] });
    const odd = ["in", ["get", "state"], ["literal", ["split", "nozone"]]];
    map.addLayer({ id: "lot-fill", type: "fill", source: "lots", paint: { "fill-color": "#000", "fill-opacity": 0 } });
    // the two 2 Line stations in the district (win.md build 3); the card also names Bellevue Downtown, Spring District and BelRed where their walk reaches a lot
    const drawn = f => DRAWN.includes(f.properties.name);
    map.addSource("walk", { type: "geojson", data: { type: "FeatureCollection", features: D.transit.walk.features.filter(drawn) } });
    map.addSource("trail", { type: "geojson", data: D.transit.eastrail });
    map.addSource("sta", { type: "geojson", data: { type: "FeatureCollection", features: D.transit.stations.map(s => ({ type: "Feature", geometry: { type: "Point", coordinates: s.at }, properties: { name: s.name, label: `${s.name} Station` } })).filter(drawn) } });
    map.addLayer({ id: "walk-fill", type: "fill", source: "walk", paint: { "fill-color": RAIL, "fill-opacity": 0.1 } });
    map.addLayer({ id: "odd-fill", type: "fill", source: "lots", filter: odd, paint: { "fill-pattern": "hatch2", "fill-opacity": 0.7 } });
    map.addLayer({ id: "lot-line", type: "line", source: "lots", paint: { "line-color": ["case", ["==", ["get", "state"], "ok"], "#5b6b7a", "#9aa4ad"], "line-width": ["case", ["==", ["get", "state"], "ok"], 0.9, 0.5] } });
    map.addLayer({ id: "odd-line", type: "line", source: "lots", filter: odd, paint: { "line-color": "#b45309", "line-width": 1.6, "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "unm", type: "fill", source: "unm", paint: { "fill-pattern": "hatch" } });
    map.addLayer({ id: "unm-line", type: "line", source: "unm", paint: { "line-color": "#9a3412", "line-width": 1 } });
    map.addLayer({ id: "trail", type: "line", source: "trail", filter: ["get", "open"], layout: { "line-cap": "round" }, paint: { "line-color": TRAIL, "line-width": 3 } });
    map.addLayer({ id: "trail-built", type: "line", source: "trail", filter: ["!", ["get", "open"]], paint: { "line-color": TRAIL, "line-width": 3, "line-dasharray": [1.5, 1.2] } });
    map.addLayer({ id: "sel-line", type: "line", source: "lots", filter: ["==", ["get", "id"], ""], paint: { "line-color": "#111", "line-width": 3 } });
    map.addLayer({ id: "bld", type: "fill-extrusion", source: "bld", paint: { "fill-extrusion-color": "#5d636b", "fill-extrusion-height": ["max", ["get", "h"], 1], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } });
    const base = ["coalesce", ["get", "base_m"], 0];  // a build-out tower stands on its podium
    map.addLayer({ id: "cap", type: "fill-extrusion", source: "caps", paint: { "fill-extrusion-color": ["match", ["get", "zone"], "UC", CAP_COLOR.UC, "MU-H", CAP_COLOR["MU-H"], CAP_COLOR["MU-M"]], "fill-extrusion-base": base, "fill-extrusion-height": ["get", "cap_m"], "fill-extrusion-opacity": 0.2, "fill-extrusion-opacity-transition": { duration: 200 } } });
    // a thin slab at the cap height, so the glass reads as a ceiling at 100, 250 or 450 ft
    map.addLayer({ id: "cap-roof", type: "fill-extrusion", source: "caps", paint: { "fill-extrusion-color": ["match", ["get", "zone"], "UC", CAP_COLOR.UC, "MU-H", CAP_COLOR["MU-H"], CAP_COLOR["MU-M"]], "fill-extrusion-base": ["-", ["get", "cap_m"], 1.5], "fill-extrusion-height": ["get", "cap_m"], "fill-extrusion-opacity": 0.6, "fill-extrusion-opacity-transition": { duration: 200 } } });
    map.addLayer({ id: "cap-sel", type: "fill-extrusion", source: "caps", filter: ["==", ["get", "id"], ""], paint: { "fill-extrusion-color": "#0b2540", "fill-extrusion-base": base, "fill-extrusion-height": ["get", "cap_m"], "fill-extrusion-opacity": 0.5 } });
    map.addLayer({ id: "zone-label", type: "symbol", source: "labels", layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-max-width": 9, "text-allow-overlap": false }, paint: { "text-color": "#0b2540", "text-halo-color": "#fff", "text-halo-width": 1.6 } });
    // a dot on each lot with a filing since the rezone, drawn over the glass so it reads from any angle
    const pins = D.map.lots.features.filter(f => D.feed.filed[f.properties.id]).map(f => ({ type: "Feature", geometry: { type: "Point", coordinates: centroid(f.geometry) }, properties: { id: f.properties.id } }));
    map.addSource("pins", { type: "geojson", data: { type: "FeatureCollection", features: pins } });
    map.addLayer({ id: "pin", type: "circle", source: "pins", paint: { "circle-radius": 4.5, "circle-color": "#7c2d12", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-pitch-alignment": "viewport" } });
    map.addLayer({ id: "sta", type: "circle", source: "sta", paint: { "circle-radius": 6, "circle-color": RAIL, "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-pitch-alignment": "viewport" } });
    for (const l of window.WB_BASEMAP.labels) map.addLayer(l);
    // above the basemap's labels, so a street name gives way to a station's
    map.addLayer({ id: "sta-label", type: "symbol", source: "sta", layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-anchor": "left", "text-offset": [0.9, 0] }, paint: { "text-color": RAIL, "text-halo-color": "#fff", "text-halo-width": 1.6 } });
    // MapLibre draws a label half off the canvas edge; keep only the zone labels that fit (text-max-width 9 em is about 110 px)
    const fitLabels = () => {
      const { clientWidth: w, clientHeight: h } = map.getCanvas();
      const zones = D.map.labels.features.filter(f => { const p = map.project(f.geometry.coordinates); return p.x > 60 && p.x < w - 60 && p.y > 30 && p.y < h - 30; }).map(f => f.properties.zone);
      map.setFilter("zone-label", ["in", ["get", "zone"], ["literal", zones]]);
    };
    fitLabels();
    map.on("moveend", fitLabels);
    // the glass under the pointer, the nearest first; the ground is the fallback. Hover deepens that same pick (asst-122-3).
    const hit = pt => map.queryRenderedFeatures(pt, { layers: ["cap"] })[0] || map.queryRenderedFeatures(pt, { layers: ["lot-fill"] })[0];
    map.on("click", e => { const f = hit(e.point); if (f) show(f.properties.id, { move: true }); });
    if (!matchMedia("(pointer: coarse)").matches) gestures(hit);
    if (selected) show(selected, { move: true });
    // compact credit starts open and covers a third of a phone map; the (i) keeps it one tap away
    document.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show");
    window.__ready = performance.now();
  });
}

// Two-finger scroll pans, pinch zooms, Option turns and tilts, a twist turns in Safari. Middle-drag pans; every other mouse input stays as MapLibre ships it.
function gestures(hit) {
  const m = map, sz = m.scrollZoom;
  const NOTCH = 4.000244140625;   // MapLibre's constant: a delta divisible by it is a mouse wheel
  const TURN = 0.4, TILT = 0.25;  // half the right-drag rates, momentum about doubles a swipe
  let kind = null, last = 0, turning = false, held = [0, 0], settling = 0;

  // MapLibre v4.7.1's ScrollZoom.wheel test, kept per gesture, plus deltaX: a wheel has none. null: undecided, its 40 ms timer holds the event.
  const classify = (v, dx, gap) => {
    if (v && v % NOTCH === 0) kind = "wheel";
    else if (dx || (v && Math.abs(v) < 4)) kind = "trackpad";
    else if (gap > 400) kind = null;
    else kind ||= sz._type || (Math.abs(gap * v) < 200 ? "trackpad" : "wheel");
  };
  // One moveend per gesture, as a drag fires: the page's moveend reruns setFilter on the labels.
  const fire = m.fire;
  m.fire = function (ev, ...rest) { return settling && ev.type === "moveend" ? this : fire.call(this, ev, ...rest); };
  const settle = () => {
    clearTimeout(settling);
    settling = setTimeout(() => { settling = 0; m.fire("moveend"); }, 150);
  };
  const steer = (dx, dy) => {
    settle();
    if (turning) m.jumpTo({ bearing: m.getBearing() - dx * TURN, pitch: m.getPitch() + dy * TILT });  // the transform clamps pitch to maxPitch
    else m.panBy([dx, dy], { duration: 0 });
  };
  m.getCanvasContainer().addEventListener("wheel", e => {
    if (e.ctrlKey) return;  // a pinch: MapLibre zooms at the cursor
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    const now = performance.now(), gap = now - last;
    last = now;
    if (e.altKey) turning = true;  // Option turns the moment it is down, even mid-swipe
    else if (gap > 150) turning = false;  // latched: letting go of Option mid-momentum must not start a pan
    classify(dy, dx, gap);
    const [heldX, heldY] = held;
    held = kind ? [0, 0] : [dx, dy];
    if (kind !== "trackpad") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    clearTimeout(sz._timeout);  // the first event of the gesture went through undecided, its zoom must not land
    steer(dx + heldX, dy + heldY);
  }, { capture: true, passive: false });

  // Option-drag joins right-drag and Ctrl-drag. MapLibre has no option for this; v4.7.1 is vendored.
  for (const h of [m.dragRotate._mouseRotate, m.dragRotate._mousePitch]) {
    const ok = h._moveStateManager._correctEvent;
    h._moveStateManager._correctEvent = e => ok(e) || (e.button === 0 && e.altKey);
  }
  const pan = m.dragPan._mousePan._moveStateManager, panOk = pan._correctEvent;
  pan._correctEvent = e => (panOk(e) && !e.altKey) || e.button === 1;
  // Middle-drag pans, as 3D programs do. MapLibre's held-button table has no middle button, so this manager checks it here.
  const stillDown = pan.isValidMoveEvent;
  pan.isValidMoveEvent = e => pan._eventButton === 1 ? (e.buttons & 4) === 4 : stillDown.call(pan, e);
  m.getCanvasContainer().addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });  // no autoscroll puck on Windows

  // Safari is the only Mac browser that passes a trackpad twist to the page (GestureEvent.rotation, degrees clockwise); Chromium drops it.
  let twistFrom;
  const canvas = m.getCanvasContainer();
  canvas.addEventListener("gesturestart", e => { e.preventDefault(); twistFrom = m.getBearing(); });
  canvas.addEventListener("gesturechange", e => { e.preventDefault(); m.jumpTo({ bearing: twistFrom - e.rotation }); });

  const hint = document.createElement("p");
  hint.className = "note";
  hint.id = "maphint";
  hint.textContent = `Hold ${/Mac/.test(navigator.platform) ? "⌥" : "Alt"} and scroll to rotate`;
  document.querySelector("#legend").append(hint);

  if (!matchMedia("(hover: hover)").matches) return;  // a phone has no pointer to follow

  // One small source per hover, so a change retiles one lot's polygons, never the page's caps and lots.
  const group = fcol => fcol.features.reduce((all, f) => (all.get(f.properties.id)?.push(f) || all.set(f.properties.id, [f]), all), new Map());
  const caps = group(D.map.caps), blocks = group(BO), lots = group(D.map.lots), fc = features => ({ type: "FeatureCollection", features });
  for (const k of ["hov-cap", "hov-lot"]) m.addSource(k, { type: "geojson", data: fc([]) });
  const zone = ["match", ["get", "zone"], "UC", "#27358f", "MU-H", "#2f78b7", "#5aa0a8"];
  m.addLayer({ id: "hov", type: "fill-extrusion", source: "hov-cap", paint: { "fill-extrusion-color": zone, "fill-extrusion-base": ["coalesce", ["get", "base_m"], 0], "fill-extrusion-height": ["get", "cap_m"], "fill-extrusion-opacity": 0.42 } }, "cap-sel");
  m.addLayer({ id: "hov-line", type: "line", source: "hov-lot", paint: { "line-color": "#1c2733", "line-width": 2 } }, "sel-line");
  let cur = "", at = null, queued = 0;
  const set = id => {
    if (id === cur) return;
    cur = id;
    m.getCanvas().style.cursor = id ? "pointer" : "";
    m.getSource("hov-cap").setData(fc((farMode === "build" ? blocks : caps).get(id) ?? []));
    m.getSource("hov-lot").setData(fc(lots.get(id) ?? []));
  };
  const look = () => { queued = 0; if (at && !m.isMoving()) set(hit(at)?.properties.id ?? ""); };
  const ask = () => { queued ||= requestAnimationFrame(look); };  // at most one query a frame
  m.on("mousemove", e => { at = e.point; ask(); });
  m.on("moveend", ask);  // the map slid under a still pointer
  m.getCanvas().addEventListener("mouseleave", () => { at = null; set(""); });
}

function noGL() {
  map = null;
  document.body.classList.add("nogl");
  $("#legend").hidden = true;
  const box = $("#nogl");
  box.hidden = false;
  $(".lede").textContent = "Each new Wilburton district has a height cap under Ordinance 6846. A building reaches the cap only with bonus floor area earned through amenity incentives. Building heights are measured from the 2021 King County lidar.";
  emptyCard();
  // by street, then house number, so a block reads in order; lots with no address go last
  const key = l => { const m = (l.addr || "").match(/^(\d+)\s+(.*)$/); return m ? [m[2], +m[1]] : [null, +l.id]; };
  const byStreet = (x, y) => { const [a, b] = [key(x), key(y)]; return (a[0] == null) - (b[0] == null) || (a[0] ?? "").localeCompare(b[0] ?? "", "en", { numeric: true }) || a[1] - b[1]; };
  const rows = [...core, ...odd].sort(byStreet).map(l => {
    const d = l.zone;
    const cells = l.state === "ok"
      ? `<td data-label="District">${d}</td><td data-label="Height">${capText(d)}</td><td data-label="Base FAR nonres. / res.">${far(rule(d, "base_far_nonres"))} / ${far(rule(d, "base_far_res"))}</td><td data-label="Max FAR nonres. / res.">${far(rule(d, "max_far_nonres"))} / ${far(rule(d, "max_far_res"))}</td>`
      : `<td colspan="4" data-label="District">${l.state === "split" ? "Split lot" : "In no zoning polygon"}, see the card</td>`;
    return `<tr data-id="${l.id}"><th scope="row"><button type="button" class="linkish">${esc(title(l))}</button>${l.addr ? `<span class="pid">${l.id}</span>` : ""}</th>${cells}<td data-label="Tallest measured">${l.tallest == null ? "None" : `${l.tallest} ft`}</td><td data-label="Footprints not measured">${l.unmeasured}</td></tr>`;
  }).join("");
  box.innerHTML = `<p class="nogl-msg">This computer isn't drawing the 3D map because WebGL is turned off or unavailable, which is common on remote desktops. Here are the same facts as a table.</p>
    <div class="scroll"><table class="num list"><thead><tr><th scope="col">Lot</th><th scope="col">District</th><th scope="col">Height</th><th scope="col">Base FAR nonres. / res.</th><th scope="col">Max FAR nonres. / res.</th><th scope="col">Tallest measured</th><th scope="col">Footprints not measured</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  box.addEventListener("click", e => { const r = e.target.closest("tr[data-id]"); if (r) show(r.dataset.id, { focus: true }); });
}
function hasGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// ---- boot
$("#k-bld").textContent = `Building, height from 2021 lidar (${D.map.bld.features.length})`;
$("#k-unm").textContent = `Footprint, no measured height (${D.map.unm.features.length})`;
$("#k-odd").textContent = `Split lot or no district (${odd.length}), not answered`;
$("#k-pin").textContent = `Lot with a filing since the rezone (${Object.keys(D.feed.filed).length})`;
Object.assign(D.rules.quotes, D.transit.quotes);
$("#k-walk").textContent = `Half-mile walk from ${DRAWN.join(" or ")} Station`;
const sources = [...D.feed.sources, { name: "Streets, paths, light rail entrances and Eastrail", by: "OpenStreetMap contributors", got: `pulled ${day(D.transit.pulled)}`, terms: "ODbL" }];
$("#manifest ul").innerHTML = sources.map(x => `<li><b>${esc(x.name)}</b><span>${esc(x.by)}, ${esc(x.got)}</span><span>${esc(x.terms)}</span></li>`).join("");
$("#sources").textContent = `Code: Ordinance 6846 (Chart 20.20.010, LUC 20.25R, LUC 20.20.525). Districts: City of Bellevue zoning layer (Ord 6847). The parcel layer's own zoning column predates the rezone on all ${D.feed.lots} lots in the new districts, so this page reads the zoning polygons. Parcels, buildings and zoning pulled from the city's GIS on Nov 4, 2026. Heights measured from the King County West 2021 lidar flight and not checked against plans. Station walks, Eastrail and station entrances from OpenStreetMap, pulled ${day(D.transit.pulled)}.`;
document.querySelectorAll("[data-far]").forEach(b => b.addEventListener("click", () => setFar(b.dataset.far)));
$("#card").addEventListener("click", e => {
  const c = e.target.closest(".chip");
  if (c) return openQuote(c);
  const a = e.target.closest("[data-act]");
  if (a) act(a.dataset.act);  // rmail is a link: its default (the mail app) still runs
});
$("#find").addEventListener("submit", e => {
  e.preventDefault();
  const l = find($("#q").value);
  $("#findmsg").textContent = l ? "" : "No lot at that address in this area. Try the street number and street, like 316 116th Ave NE.";
  if (l) show(l.id, { focus: true });
});
addEventListener("hashchange", () => lots.has(location.hash.slice(1)) && show(location.hash.slice(1)));
totals();
// a small window (a VDI client, 125% scaling on a 1366 x 768 laptop) starts with the totals folded so the legend leaves the map visible
$("#fold").open = innerWidth >= 1200 && innerHeight >= 700;
emptyCard();
const start = location.hash.slice(1);
if (lots.has(start)) selected = start;
if (hasGL()) { try { startMap(); } catch (err) { console.warn(err); noGL(); } } else noGL();
if (selected) show(selected, { move: !!map });
