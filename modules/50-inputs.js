// ---------- Snap helpers ----------
function snapPoint(xPx, yPx) {
  const stepPx = mmToPx(SNAP_MM);
  return { x: Math.round(xPx / stepPx) * stepPx, y: Math.round(yPx / stepPx) * stepPx };
}

function pxGeomToInternal(xPx, yPx, wPx, hPx) {
  let xMm = pxToMm(xPx);
  let yMm = pxToMm(yPx);
  let wMm = pxToMm(wPx);
  let hMm = pxToMm(hPx);

  if (elToggleSnap.checked) {
    xMm = Math.round(xMm / SNAP_MM) * SNAP_MM;
    yMm = Math.round(yMm / SNAP_MM) * SNAP_MM;
    wMm = Math.round(wMm / SNAP_MM) * SNAP_MM;
    hMm = Math.round(hMm / SNAP_MM) * SNAP_MM;
  }
  return { x: mmToInternal(xMm), y: mmToInternal(yMm), w: mmToInternal(wMm), h: mmToInternal(hMm) };
}

function getAlignmentBoxPoints(box, axis) {
  if (axis === "x") {
    return [
      { type: "left", value: box.x },
      { type: "centerX", value: box.x + box.width / 2 },
      { type: "right", value: box.x + box.width }
    ];
  }

  return [
    { type: "top", value: box.y },
    { type: "centerY", value: box.y + box.height / 2 },
    { type: "bottom", value: box.y + box.height }
  ];
}

function findClosestAlignmentSnap(movingBox, targetBoxes, axis) {
  const movingPoints = getAlignmentBoxPoints(movingBox, axis);
  let best = null;

  targetBoxes.forEach((targetBox) => {
    const targetPoints = getAlignmentBoxPoints(targetBox, axis);
    movingPoints.forEach((movingPoint) => {
      targetPoints.forEach((targetPoint) => {
        const delta = targetPoint.value - movingPoint.value;
        const distance = Math.abs(delta);
        if (distance > ALIGNMENT_SNAP_THRESHOLD_PX) return;
        if (best && distance >= best.distance) return;
        best = {
          delta,
          distance,
          guide: targetPoint.value,
          movingType: movingPoint.type,
          targetType: targetPoint.type
        };
      });
    });
  });

  return best;
}

function clearAlignmentGuides() {
  if (!alignmentGuideGroup) return;
  alignmentGuideGroup.destroyChildren();
  alignmentGuideGroup.visible(false);
  uiLayer?.batchDraw();
}

function drawAlignmentGuides(guides) {
  if (!alignmentGuideGroup) return;

  alignmentGuideGroup.destroyChildren();
  const hasVertical = Number.isFinite(guides?.x);
  const hasHorizontal = Number.isFinite(guides?.y);

  if (!hasVertical && !hasHorizontal) {
    alignmentGuideGroup.visible(false);
    uiLayer?.batchDraw();
    return;
  }

  const viewportLeft = -stage.x();
  const viewportTop = -stage.y();
  const viewportRight = viewportLeft + stage.width();
  const viewportBottom = viewportTop + stage.height();
  const guideAttrs = {
    stroke: "#4fc3ff",
    strokeWidth: 1,
    dash: [5, 5],
    listening: false,
    strokeScaleEnabled: false
  };

  if (hasVertical) {
    alignmentGuideGroup.add(new Konva.Line({
      ...guideAttrs,
      points: [guides.x, viewportTop, guides.x, viewportBottom]
    }));
  }

  if (hasHorizontal) {
    alignmentGuideGroup.add(new Konva.Line({
      ...guideAttrs,
      points: [viewportLeft, guides.y, viewportRight, guides.y]
    }));
  }

  alignmentGuideGroup.visible(true);
  uiLayer?.batchDraw();
}

function snapGroupToElementAlignment(group) {
  if (!elToggleAlign?.checked || !group) {
    clearAlignmentGuides();
    return false;
  }

  const movingBox = group.getClientRect({ relativeTo: objLayer });
  const targetBoxes = state.fields
    .map((field) => field._konva)
    .filter((node) => node && node !== group && node.getLayer())
    .map((node) => node.getClientRect({ relativeTo: objLayer }))
    .filter((box) => Number.isFinite(box.x) && Number.isFinite(box.y) && box.width > 0 && box.height > 0);

  if (!targetBoxes.length) {
    clearAlignmentGuides();
    return false;
  }

  const snapX = findClosestAlignmentSnap(movingBox, targetBoxes, "x");
  const snapY = findClosestAlignmentSnap(movingBox, targetBoxes, "y");
  const nextPosition = { x: group.x(), y: group.y() };

  if (snapX) nextPosition.x += snapX.delta;
  if (snapY) nextPosition.y += snapY.delta;
  if (snapX || snapY) group.position(nextPosition);

  drawAlignmentGuides({
    x: snapX?.guide,
    y: snapY?.guide
  });

  return !!(snapX || snapY);
}

// ---------- Inputs ----------
function setControlAriaLabel(control, label) {
  if (!control || typeof control.setAttribute !== "function") return;
  if (!control.hasAttribute("aria-label")) control.setAttribute("aria-label", label);
}

function fieldRow(label, inputEl) {
  const row = document.createElement("div");
  row.className = "fieldRow";
  const lab = document.createElement("label");
  lab.textContent = label;
  setControlAriaLabel(inputEl, label);
  row.appendChild(lab);
  row.appendChild(inputEl);
  return row;
}

function labeledMini(label, el) {
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "6px";
  const lab = document.createElement("div");
  lab.className = "muted";
  lab.textContent = label;
  wrap.appendChild(lab);
  setControlAriaLabel(el, label);
  wrap.appendChild(el);
  return wrap;
}

function createMaterialSelect(items, currentValue, onChange, opts = {}) {
  const sel = document.createElement("select");
  sel.className = "select";
  if (opts.disabled) sel.disabled = true;

  const current = String(currentValue ?? "");
  items.forEach((item) => {
    const opt = document.createElement("option");
    const value = String(item.value ?? "");
    const label = String(item.label ?? value);
    opt.value = value;
    opt.textContent = label;
    if (value === current) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.value = current;
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function inputText(value, onChange, opts = {}) {
  const inp = document.createElement("input");
  inp.className = "input";
  inp.value = String(value ?? "");
  inp.type = opts.type || "text";
  if (opts.disabled) inp.disabled = true;
  if (opts.readOnly) {
    inp.readOnly = true;
    inp.setAttribute("readonly", "");
  }
  inp.addEventListener("change", () => onChange(inp.value));
  return inp;
}

function inputNumber(value, onChange, opts = {}) {
  const inp = document.createElement("input");
  inp.className = "input";
  inp.type = "number";
  inp.step = String(opts.step ?? 0.01);
  if (opts.min != null) inp.min = String(opts.min);
  if (opts.max != null) inp.max = String(opts.max);
  inp.value = String(value ?? 0);

  let lastEmitted = null;

  const normalizeValue = () => {
    let next = Number(inp.value);
    if (!Number.isFinite(next)) next = Number(value ?? 0);
    if (opts.integer) next = Math.round(next);
    if (opts.min != null) next = Math.max(Number(opts.min), next);
    if (opts.max != null) next = Math.min(Number(opts.max), next);
    return next;
  };

  const emit = () => {
    const next = normalizeValue();
    if (lastEmitted === next) {
      if (String(inp.value) !== String(next)) inp.value = String(next);
      return;
    }
    lastEmitted = next;
    inp.value = String(next);
    onChange(next);
  };

  if (opts.live) inp.addEventListener("input", emit);
  inp.addEventListener("change", emit);
  return inp;
}

function mkNum(value, onChange) {
  return inputNumber(value, onChange, { step: 1, integer: true });
}

function inputCheckbox(value, onChange, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "checkboxField";

  const switchEl = document.createElement("md-switch");
  switchEl.className = "checkboxField__switch";
  switchEl.setAttribute("aria-label", opts.ariaLabel || opts.label || "Toggle");
  switchEl.toggleAttribute("selected", !!value);
  switchEl.toggleAttribute("disabled", !!opts.disabled);
  switchEl.addEventListener("change", () => onChange(!!switchEl.selected));

  if (opts.label) {
    const label = document.createElement("span");
    label.className = "checkboxField__label";
    label.textContent = opts.label;
    wrap.appendChild(label);
  }

  wrap.appendChild(switchEl);
  return wrap;
}

function selectDataMatrixModuleSize(value, onChange) {
  const current = formatDataMatrixModuleSize(value);
  const options = DATA_MATRIX_MODULE_SIZES.map((option) => formatDataMatrixModuleSize(option));
  if (!options.includes(current)) options.unshift(current);
  return createMaterialSelect(
    options.map((option) => ({ value: option, label: option })),
    current,
    (nextValue) => onChange(normalizeDataMatrixModuleSizeValue(nextValue))
  );
}

function selectSymbolSize(value, onChange) {
  const current = normalizeDataMatrixSymbolSizeValue(value, "22X22");
  const sizes = DATA_MATRIX_SYMBOL_SIZE_OPTIONS.slice();
  if (!sizes.includes(current)) sizes.unshift(current);
  return createMaterialSelect(
    sizes.map((size) => ({ value: size, label: size })),
    current,
    (nextValue) => onChange(normalizeDataMatrixSymbolSizeValue(nextValue, "22X22"))
  );
}

function selectOffsetName(value, onChange) {
  const opts = state.dateOffsets.map(o => o.name);
  return createMaterialSelect(
    [{ value: "", label: "(none)" }, ...opts.map((name) => ({ value: name, label: name }))],
    value ?? "",
    onChange
  );
}

function selectStringOptions(value, options, onChange) {
  const current = value ?? "";
  const list = [];

  if (current && !options.includes(current)) list.push(current);
  options.forEach(opt => { if (!list.includes(opt)) list.push(opt); });
  return createMaterialSelect(
    list.map((option) => ({ value: option, label: option })),
    current,
    onChange
  );
}

function selectTimeSeparator(value, onChange) {
  const current = value ?? ":";
  const options = [];

  if (!TIME_SEPARATOR_OPTIONS.some(opt => opt.value === current)) {
    options.push({ value: current, label: current || "\u0411\u0435\u0437 \u0441\u0435\u043f\u0430\u0440\u0430\u0442\u043e\u0440\u0430" });
  }
  TIME_SEPARATOR_OPTIONS.forEach(opt => {
    if (!options.some(item => item.value === opt.value)) options.push(opt);
  });
  return createMaterialSelect(options, current, onChange);
}

function selectDateFormat(value, locale, onChange) {
  const currentFormat = value || "dd/MM/yy";
  const currentLocale = locale || "en";
  const currentValue = `${currentFormat}::${currentLocale}`;
  const options = [];

  if (!DATE_TEXT_FORMAT_OPTIONS.some(opt => opt.value === currentValue)) {
    options.push({ value: currentValue, format: currentFormat, locale: currentLocale, label: currentFormat });
  }
  DATE_TEXT_FORMAT_OPTIONS.forEach(opt => {
    if (!options.some(item => item.value === opt.value)) options.push(opt);
  });
  return createMaterialSelect(options, currentValue, (nextValue) => {
    const selected = options.find(opt => opt.value === nextValue);
    onChange(selected?.format ?? currentFormat, selected?.locale ?? currentLocale);
  });
}

function selectDateSeparator(value, onChange) {
  const current = value ?? "/";
  const options = [];

  if (!DATE_SEPARATOR_OPTIONS.some(opt => opt.value === current)) {
    options.push({ value: current, label: current || "\u0411\u0435\u0437 \u0441\u0435\u043f\u0430\u0440\u0430\u0442\u043e\u0440\u0430" });
  }
  DATE_SEPARATOR_OPTIONS.forEach(opt => {
    if (!options.some(item => item.value === opt.value)) options.push(opt);
  });
  return createMaterialSelect(options, current, onChange);
}

function normalizeTimeFormat(value) {
  return String(value ?? "").replace(/'/g, "");
}
