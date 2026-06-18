export function selectModelView(models = [], id = "") {
  const list = Array.isArray(models) ? models : [];
  if (!list.length) {
    return { selected: null, index: -1, isFallback: true, models: [] };
  }
  const defaultIndex = Math.max(0, list.findIndex((model) => model.isDefault));
  const requestedIndex = list.findIndex((model) => model.id === id);
  const index = requestedIndex === -1 ? defaultIndex : requestedIndex;
  return {
    selected: list[index] || null,
    index: list[index] ? index : -1,
    isFallback: requestedIndex === -1,
    models: list,
  };
}

export function initLandingInteractive(root) {
  if (!root) return () => {};
  const buttons = Array.from(root.querySelectorAll?.("[data-model]") || []);
  const detail = root.querySelector?.("[data-model-detail]");
  const handlers = buttons.map((button) => {
    const onClick = () => {
      const id = button.dataset.model;
      const modelButtons = buttons.map((item) => ({
        id: item.dataset.model,
        label: item.dataset.modelLabel || item.textContent.trim(),
        speed: item.dataset.modelSpeed || "",
        note: item.dataset.modelNote || "",
        isDefault: item.dataset.modelDefault === "true",
      }));
      const view = selectModelView(modelButtons, id);
      buttons.forEach((item) => item.classList.toggle("active", item.dataset.model === view.selected?.id));
      if (detail && view.selected) {
        detail.innerHTML = `
          <h3>${escapeHtml(view.selected.label)}</h3>
          <dl>
            <div><dt>模型 ID</dt><dd>${escapeHtml(view.selected.id)}</dd></div>
            <div><dt>响应速度</dt><dd>${escapeHtml(view.selected.speed)}</dd></div>
            <div><dt>定位说明</dt><dd>${escapeHtml(view.selected.note)}</dd></div>
          </dl>
        `;
      }
    };
    button.addEventListener?.("click", onClick);
    return { button, onClick };
  });

  return () => {
    handlers.forEach(({ button, onClick }) => button.removeEventListener?.("click", onClick));
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
