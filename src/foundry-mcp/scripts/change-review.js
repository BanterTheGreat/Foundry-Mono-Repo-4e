/**
 * Escape every document value, including authored HTML, in the review surface.
 */
function escape(value) {
  const text = value === undefined ? "(unset)" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/**
 * Present common power fields in ordinary language; keep the full source below.
 */
function powerDetails(power) {
  const system = power.system ?? {};
  const ranges = { closeBurst: `Close burst ${system.area ?? ""}`, closeBlast: `Close blast ${system.area ?? ""}`,
    rangeBurst: `Area burst ${system.area ?? ""} within ${system.rangePower ?? ""} squares`,
    rangeBlast: `Area blast ${system.area ?? ""} within ${system.rangePower ?? ""} squares` };
  const usage = { atwill: "At-will", encounter: "Encounter", daily: "Daily", recharge: "Recharge" };
  const fields = [
    ["Usage", usage[system.useType] ?? system.useType], ["Action", system.actionType],
    ["Range", ranges[system.rangeType] ?? system.rangeText ?? system.rangeType], ["Target", system.target],
    ["Attack roll", system.attack?.isAttack === false ? "None" : system.attack?.formula],
    ["Damage roll", system.hit?.isDamage === false ? "None" : system.hit?.formula],
    ["Chat card", system.autoGenChatPowerCard === undefined ? undefined : system.autoGenChatPowerCard ? "Automatic" : "Manual"]
  ];
  return `<dl>${fields.filter(([, value]) => value !== undefined && value !== "").map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join("")}</dl>`;
}

/**
 * Build a document navigator and readable details without hiding any proposed data.
 */
export function changeReviewContent({ name, changes, overview }) {
  const groups = [];
  for (const change of changes) {
    const key = `${change.uuid ?? ""}:${change.document}`;
    let group = groups.find(entry => entry.key === key);
    if (!group) {
      group = { key, name: change.document, changes: [] };
      groups.push(group);
    }
    group.changes.push(change);
  }
  const panels = groups.map((group, index) => {
    const addition = group.changes.find(change => change.path.startsWith("items: add power") && change.after?.system);
    const rows = group.changes.map(change => `<tr><th scope="row">${escape(change.path)}</th><td><pre>${escape(change.before)}</pre></td><td><pre>${escape(change.after)}</pre></td></tr>`).join("");
    return `<section class="mcp-review-panel" data-panel="${index}" ${index ? "hidden" : ""} aria-label="${escape(group.name)}">
      <span class="mcp-review-kind">${addition ? "NEW POWER" : "PROPOSED CHANGES"}</span><h2>${escape(group.name)}</h2>
      ${addition ? powerDetails(addition.after) : ""}
      <${addition ? "details" : "div"} class="mcp-review-source">${addition ? "<summary>Inspect source data</summary>" : ""}
      <table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${rows}</tbody></table></${addition ? "details" : "div"}>
    </section>`;
  }).join("");
  return `<style>
    .mcp-review{padding:8px;overflow-wrap:anywhere}.mcp-review h2{font-size:20px;margin:8px 0 18px}
    .mcp-review-context{font-size:12px;opacity:.7;margin-bottom:12px}.mcp-review-overview{white-space:pre-wrap}
    .mcp-review-layout{display:grid;grid-template-columns:190px minmax(0,1fr);gap:22px;margin:18px 0;max-height:55vh;overflow:auto}
    .mcp-review-nav{display:flex;flex-direction:column;gap:5px}.mcp-review-nav button{height:auto;text-align:left;line-height:1.4;padding:12px;border:0;border-left:3px solid transparent;background:transparent;box-shadow:none;white-space:normal;overflow-wrap:anywhere}
    .mcp-review-nav button[aria-pressed=true]{border-left-color:#779e7e;background:#779e7e26;font-weight:bold}
    .mcp-review-nav small{display:block;font-size:10px;opacity:.7}.mcp-review-kind{font-size:10px;letter-spacing:1px;font-weight:bold}
    .mcp-review-panel{min-width:0}.mcp-review-panel[hidden]{display:none}.mcp-review dl{display:grid;grid-template-columns:95px minmax(0,1fr);gap:12px;margin:18px 0}.mcp-review dt{opacity:.7}.mcp-review dd{margin:0;white-space:pre-wrap}
    .mcp-review summary{cursor:pointer;padding:10px 0}.mcp-review table{table-layout:fixed;width:100%}.mcp-review th,.mcp-review td{text-align:left;vertical-align:top;padding:8px;overflow-wrap:anywhere}.mcp-review pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace;margin:0;max-height:300px;overflow:auto}
    @media(max-width:600px){.mcp-review-layout{grid-template-columns:1fr}.mcp-review-nav{flex-direction:row;flex-wrap:wrap}.mcp-review-nav button{flex:1;min-width:110px}}
  </style><div class="mcp-review"><div class="mcp-review-context">${escape(name)} · ${groups.length} document${groups.length === 1 ? "" : "s"} · ${changes.length} proposed change${changes.length === 1 ? "" : "s"}</div>
    <p class="mcp-review-overview"><strong>${escape(overview)}</strong></p><p>Nothing is saved until you confirm. You have 2 minutes to review.</p>
    <h3>Detailed changes</h3><div class="mcp-review-layout"><nav class="mcp-review-nav" aria-label="Documents to review">${groups.map((group, index) => `<button type="button" data-review-index="${index}" aria-pressed="${index === 0}"><small>${group.changes.some(change => change.path.startsWith("items: add power")) ? "NEW POWER" : `${group.changes.length} CHANGES`}</small>${escape(group.name)}</button>`).join("")}</nav><div>${panels}</div></div></div>`;
}

/**
 * Bind navigation only within this dialog; buttons never approve a proposal.
 */
export function bindChangeReview(html) {
  const root = html?.[0] ?? html;
  const buttons = root?.querySelectorAll?.("[data-review-index]") ?? [];
  for (const button of buttons) {
    button.addEventListener("click", event => {
      event.preventDefault();
      for (const candidate of buttons) {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      }
      for (const panel of root.querySelectorAll("[data-panel]")) {
        panel.hidden = panel.dataset.panel !== button.dataset.reviewIndex;
      }
    });
  }
}
