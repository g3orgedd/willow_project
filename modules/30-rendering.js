// ---------- Rendering ----------
function updateHiddenCanvasToggleButton() {
  const btn = $("btnShowHiddenOnCanvas");
  if (!btn) return;

  const showHidden = !!state.showHiddenOnCanvas;
  const label = showHidden ? t("panel.hideHidden") : t("panel.showHidden");
  const icon = showHidden ? "./resourses/visibility_off_24dp.svg" : "./resourses/visibility_24dp.svg";

  btn.innerHTML = `<img class="btnIcon" src="${icon}" alt="" aria-hidden="true" />`;
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.toggle = true;
  btn.selected = showHidden;
}

const MULTI_FIELD_DRAG_EVENT_NS = ".ciffMultiFieldDrag";
let multiFieldDragStartPointer = null;
let multiFieldDragState = null;
let transformerBackProxyDisabled = false;

function getPrintableAreaBoundsInternal() {
  return {
    x: 0,
    y: 0,
    w: getCanvasInternalWidth(),
    h: getCanvasInternalHeight()
  };
}

function getFieldRenderedBoundsInternal(field) {
  const orientation = normalizeOrientation(field?.orientation);
  const x = Number(field?.geom?.x ?? 0);
  const y = Number(field?.geom?.y ?? 0);
  const w = Number(field?.geom?.w ?? 0);
  const h = Number(field?.geom?.h ?? 0);
  const isSideways = orientation === 90 || orientation === 270;

  return {
    x,
    y,
    w: isSideways ? h : w,
    h: isSideways ? w : h
  };
}

function isBoundsInsideArea(bounds, area) {
  const epsilon = 0.001;
  return bounds.x >= area.x - epsilon &&
    bounds.y >= area.y - epsilon &&
    bounds.x + bounds.w <= area.x + area.w + epsilon &&
    bounds.y + bounds.h <= area.y + area.h + epsilon;
}

function validatePrintableFieldsInsideArea() {
  const area = getPrintableAreaBoundsInternal();
  const invalidNames = [];

  if (state.xmlDoc && area.w > 0 && area.h > 0) {
    state.fields.forEach((field) => {
      if (!field.printed) return;
      if (isBoundsInsideArea(getFieldRenderedBoundsInternal(field), area)) return;
      invalidNames.push(field.name);
    });
  }

  state.validation = { invalidPrintableFieldNames: invalidNames };
  return state.validation;
}

function getInvalidPrintableFieldNames() {
  return state.validation?.invalidPrintableFieldNames ?? [];
}

function isInvalidPrintableField(field) {
  return !!field?.printed && getInvalidPrintableFieldNames().includes(field.name);
}

function renderPrintableValidationWarning() {
  const invalidNames = getInvalidPrintableFieldNames();
  const hasInvalid = invalidNames.length > 0;

  if (elBtnSave) {
    elBtnSave.disabled = hasInvalid;
    elBtnSave.title = hasInvalid
      ? "Move printable fields back inside the printable area before saving."
      : "";
  }

}

function updatePrintableValidation() {
  const result = validatePrintableFieldsInsideArea();
  renderPrintableValidationWarning();
  return result;
}

function renderAll() {
  updatePrintableValidation();
  renderGrid();
  renderObjects();
  renderFieldLists();
  renderSelectionPanels();
  renderHiddenEditor();
  renderOffsetsEditor();
  renderTemplateSizePanel();
  renderTemplateTargetPanel();
  updateHiddenCanvasToggleButton();
  renderRulers();
  renderUI();
}

function fitHiDPICanvas(canvas) {
  if (!canvas) return null;

  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function getRulerConfig() {
  const pxPerMm = getPixelsPerMm();
  if (pxPerMm >= 8) return { minorStep: 1, mediumStep: 5, labelStep: 10 };
  if (pxPerMm >= 4) return { minorStep: 2, mediumStep: 10, labelStep: 10 };
  return { minorStep: 5, mediumStep: 10, labelStep: 10 };
}

function getCssColorVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function colorWithAlpha(color, alpha) {
  const value = String(color || "").trim();
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));

  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((char) => char + char).join("");
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every(Number.isFinite)) {
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
      }
    }
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const channels = rgbMatch[1].split(",").map((part) => Number(part.trim()));
    if (channels.length >= 3 && channels.slice(0, 3).every(Number.isFinite)) {
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${normalizedAlpha})`;
    }
  }

  return value;
}

function getRulerTheme() {
  const surfaceContainerHighest = getCssColorVar("--md-sys-color-surface-container-highest", "#33353d");
  const outline = getCssColorVar("--md-sys-color-outline", "#8f909a");
  const outlineVariant = getCssColorVar("--md-sys-color-outline-variant", "#45464f");
  const onSurface = getCssColorVar("--md-sys-color-on-surface", "#e4e2e8");
  const onSurfaceVariant = getCssColorVar("--md-sys-color-on-surface-variant", "#c6c6d0");

  return {
    background: colorWithAlpha(surfaceContainerHighest, 0.7),
    divider: colorWithAlpha(outlineVariant, 0.9),
    edgeHighlight: colorWithAlpha(onSurface, 0.05),
    tickMinor: colorWithAlpha(outlineVariant, 0.58),
    tickMedium: colorWithAlpha(outline, 0.54),
    tickMajor: colorWithAlpha(outline, 0.78),
    tickZero: colorWithAlpha(onSurface, 0.72),
    label: colorWithAlpha(onSurfaceVariant, 0.92),
    labelStrong: colorWithAlpha(onSurface, 0.88)
  };
}

function renderRulers() {
  if (!stage) return;

  const top = fitHiDPICanvas(elRulerTop);
  const left = fitHiDPICanvas(elRulerLeft);
  if (!top || !left) return;

  const cfg = getRulerConfig();
  const pxPerMm = getPixelsPerMm();
  const theme = getRulerTheme();

  drawTopRuler(top.ctx, top.width, top.height, cfg, pxPerMm, theme);
  drawLeftRuler(left.ctx, left.width, left.height, cfg, pxPerMm, theme);
}

function drawRulerSurface(ctx, width, height, theme, axis) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = "butt";
  ctx.strokeStyle = theme.edgeHighlight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (axis === "x") {
    ctx.moveTo(0, 0.5);
    ctx.lineTo(width, 0.5);
  } else {
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, height);
  }
  ctx.stroke();

  ctx.strokeStyle = theme.divider;
  ctx.beginPath();
  if (axis === "x") {
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
  } else {
    ctx.moveTo(width - 0.5, 0);
    ctx.lineTo(width - 0.5, height);
  }
  ctx.stroke();
}

function drawTopRuler(ctx, width, height, cfg, pxPerMm, theme) {
  drawRulerSurface(ctx, width, height, theme, "x");

  const startMm = Math.floor(pxToMm(-stage.x()) / cfg.minorStep) * cfg.minorStep;
  const endMm = Math.ceil(pxToMm(width - stage.x()) / cfg.minorStep) * cfg.minorStep;
  const majorTick = Math.min(14, Math.max(8, height - 16));
  const mediumTick = Math.max(6, Math.round(majorTick * 0.72));
  const minorTick = Math.max(4, Math.round(majorTick * 0.45));

  ctx.font = '500 10px "Google Sans Flex", "Segoe UI", Arial, sans-serif';
  ctx.lineCap = "round";
  ctx.textBaseline = "top";

  for (let mm = startMm; mm <= endMm; mm += cfg.minorStep) {
    const x = stage.x() + (mm * pxPerMm);
    if (x < -20 || x > width + 20) continue;

    const isMajor = mm % cfg.labelStep === 0;
    const isMedium = !isMajor && mm % cfg.mediumStep === 0;
    const isZero = mm === 0;
    const tickHeight = isMajor ? majorTick : (isMedium ? mediumTick : minorTick);
    const lineX = Math.round(x) + 0.5;

    ctx.strokeStyle = isZero ? theme.tickZero : (isMajor ? theme.tickMajor : (isMedium ? theme.tickMedium : theme.tickMinor));
    ctx.lineWidth = isMajor ? 1 : 0.75;
    ctx.beginPath();
    ctx.moveTo(lineX, height);
    ctx.lineTo(lineX, height - tickHeight);
    ctx.stroke();

    if (!isMajor) continue;

    const label = String(mm);
    const labelWidth = ctx.measureText(label).width;
    if (width <= labelWidth + 8) continue;

    const labelX = clamp(4, width - labelWidth - 4, x - (labelWidth / 2));
    ctx.fillStyle = isZero ? theme.labelStrong : theme.label;
    ctx.fillText(label, labelX, 4);
  }
}

function drawLeftRuler(ctx, width, height, cfg, pxPerMm, theme) {
  drawRulerSurface(ctx, width, height, theme, "y");

  const startMm = Math.floor(pxToMm(-stage.y()) / cfg.minorStep) * cfg.minorStep;
  const endMm = Math.ceil(pxToMm(height - stage.y()) / cfg.minorStep) * cfg.minorStep;
  const majorTick = Math.min(14, Math.max(8, width - 16));
  const mediumTick = Math.max(6, Math.round(majorTick * 0.72));
  const minorTick = Math.max(4, Math.round(majorTick * 0.45));
  const labelOffset = Math.max(9, Math.min(12, width * 0.36));

  ctx.font = '500 10px "Google Sans Flex", "Segoe UI", Arial, sans-serif';
  ctx.lineCap = "round";
  ctx.textBaseline = "middle";

  for (let mm = startMm; mm <= endMm; mm += cfg.minorStep) {
    const y = stage.y() + (mm * pxPerMm);
    if (y < -20 || y > height + 20) continue;

    const isMajor = mm % cfg.labelStep === 0;
    const isMedium = !isMajor && mm % cfg.mediumStep === 0;
    const isZero = mm === 0;
    const tickWidth = isMajor ? majorTick : (isMedium ? mediumTick : minorTick);
    const lineY = Math.round(y) + 0.5;

    ctx.strokeStyle = isZero ? theme.tickZero : (isMajor ? theme.tickMajor : (isMedium ? theme.tickMedium : theme.tickMinor));
    ctx.lineWidth = isMajor ? 1 : 0.75;
    ctx.beginPath();
    ctx.moveTo(width, lineY);
    ctx.lineTo(width - tickWidth, lineY);
    ctx.stroke();

    if (!isMajor) continue;

    const label = String(mm);
    const labelWidth = ctx.measureText(label).width;
    if (height <= labelWidth + 8) continue;

    const labelY = clamp((labelWidth / 2) + 4, height - (labelWidth / 2) - 4, y);
    ctx.save();
    ctx.translate(labelOffset, labelY);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = isZero ? theme.labelStrong : theme.label;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function renderGrid() {
  gridLayer.destroyChildren();
  if (!state.xmlDoc) { gridLayer.draw(); return; }

  const wMm = internalToMm(getCanvasInternalWidth());
  const hMm = internalToMm(getCanvasInternalHeight());
  const wPx = mmToPx(wMm);
  const hPx = mmToPx(hMm);

  gridLayer.add(new Konva.Rect({
    x: 0, y: 0,
    width: wPx, height: hPx,
    fill: "white",
    stroke: "rgba(0,0,0,0.2)",
    strokeWidth: 1
  }));

  if (elToggleGrid.checked) {
    const stepPx = mmToPx(GRID_MM);
    const finePx = mmToPx(GRID_MM / 2);

    for (let x = 0; x <= wPx; x += finePx) gridLayer.add(new Konva.Line({ points:[x,0,x,hPx], stroke:"rgba(0,0,0,0.05)", strokeWidth:1 }));
    for (let y = 0; y <= hPx; y += finePx) gridLayer.add(new Konva.Line({ points:[0,y,wPx,y], stroke:"rgba(0,0,0,0.05)", strokeWidth:1 }));

    for (let x = 0; x <= wPx; x += stepPx) gridLayer.add(new Konva.Line({ points:[x,0,x,hPx], stroke:"rgba(0,0,0,0.10)", strokeWidth:1 }));
    for (let y = 0; y <= hPx; y += stepPx) gridLayer.add(new Konva.Line({ points:[0,y,wPx,y], stroke:"rgba(0,0,0,0.10)", strokeWidth:1 }));
  }

  gridLayer.draw();
}

function renderObjects() {
  objLayer.destroyChildren();
  state.fields.forEach((field) => {
    field._konva = null;
  });
  updatePrintableValidation();
  if (!state.xmlDoc) { objLayer.draw(); return; }

  const visible = state.fields.filter(shouldRenderFieldOnCanvas);
  visible.forEach(f => {
    const g = makeFieldGroup(f, { selectionOnly: isSelectionOnlyHiddenField(f) });
    f._konva = g;
    objLayer.add(g);
  });

  objLayer.draw();
}

function shouldRenderFieldOnCanvas(field) {
  return !!field && (
    field.printed ||
    state.showHiddenOnCanvas ||
    (isTextSelectionBoundsField(field) && isFieldSelected(field.name))
  );
}

function isSelectionOnlyHiddenField(field) {
  return !!field && isTextSelectionBoundsField(field) && !field.printed && !state.showHiddenOnCanvas && isFieldSelected(field.name);
}

function rememberMultiFieldDragStartPointer() {
  multiFieldDragStartPointer = getStageLocalPointerPosition();
}

function getUnionClientRect(nodes) {
  const boxes = nodes
    .filter((node) => node?.getLayer?.())
    .map((node) => node.getClientRect({ relativeTo: objLayer }))
    .filter((box) => Number.isFinite(box.x) && Number.isFinite(box.y) && box.width >= 0 && box.height >= 0);

  if (!boxes.length) return null;

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getMultiDragTargetBoxes(excludedNames) {
  return state.fields
    .map((field) => field._konva)
    .filter((node) => node && node.getLayer?.() && !excludedNames.has(node.name()))
    .map((node) => node.getClientRect({ relativeTo: objLayer }))
    .filter((box) => Number.isFinite(box.x) && Number.isFinite(box.y) && box.width > 0 && box.height > 0);
}

function resolveMultiDragDelta(rawDx, rawDy, dragState) {
  let dx = Number.isFinite(rawDx) ? rawDx : 0;
  let dy = Number.isFinite(rawDy) ? rawDy : 0;

  if (elToggleSnap.checked) {
    const snapped = snapPoint(dragState.bounds.x + dx, dragState.bounds.y + dy);
    dx = snapped.x - dragState.bounds.x;
    dy = snapped.y - dragState.bounds.y;
  }

  if (elToggleAlign?.checked) {
    const movingBox = {
      x: dragState.bounds.x + dx,
      y: dragState.bounds.y + dy,
      width: dragState.bounds.width,
      height: dragState.bounds.height
    };
    const targetBoxes = getMultiDragTargetBoxes(dragState.names);
    const snapX = findClosestAlignmentSnap(movingBox, targetBoxes, "x");
    const snapY = findClosestAlignmentSnap(movingBox, targetBoxes, "y");

    if (snapX) dx += snapX.delta;
    if (snapY) dy += snapY.delta;
    drawAlignmentGuides({
      x: snapX?.guide,
      y: snapY?.guide
    });
  } else {
    clearAlignmentGuides();
  }

  return { dx, dy };
}

function beginMultiFieldDrag(activeName = null) {
  if (isMobilePanMode || multiFieldDragState) return !!multiFieldDragState;

  const fields = getSelectedFields().filter((selectedField) => selectedField._konva?.getLayer?.());
  if (fields.length <= 1) return false;
  if (activeName && !fields.some((selectedField) => selectedField.name === activeName)) return false;

  const nodes = fields.map((selectedField) => selectedField._konva);
  const bounds = getUnionClientRect(nodes);
  if (!bounds) return false;

  const pointer = multiFieldDragStartPointer || getStageLocalPointerPosition();
  const positions = new Map();
  const internalPositions = new Map();

  fields.forEach((selectedField) => {
    positions.set(selectedField.name, {
      x: selectedField._konva.x(),
      y: selectedField._konva.y()
    });
    internalPositions.set(selectedField.name, {
      x: selectedField.geom.x,
      y: selectedField.geom.y
    });
  });

  multiFieldDragState = {
    names: new Set(fields.map((selectedField) => selectedField.name)),
    pointer,
    bounds,
    positions,
    internalPositions,
    delta: { dx: 0, dy: 0 }
  };

  return true;
}

function applyMultiFieldDragMove() {
  const dragState = multiFieldDragState;
  if (!dragState) return false;

  const pointer = getStageLocalPointerPosition();
  const rawDx = pointer && dragState.pointer ? pointer.x - dragState.pointer.x : dragState.delta.dx;
  const rawDy = pointer && dragState.pointer ? pointer.y - dragState.pointer.y : dragState.delta.dy;
  const { dx, dy } = resolveMultiDragDelta(rawDx, rawDy, dragState);

  dragState.delta = { dx, dy };

  dragState.names.forEach((name) => {
    const field = state.fieldByName.get(name);
    const start = dragState.positions.get(name);
    if (!field?._konva || !start) return;
    field._konva.position({ x: start.x + dx, y: start.y + dy });
  });

  transformer?.forceUpdate?.();
  objLayer.batchDraw();
  uiLayer.batchDraw();
  return true;
}

function finishMultiFieldDrag() {
  const dragState = multiFieldDragState;
  if (!dragState) return false;

  clearAlignmentGuides();
  pushHistory();

  const dxInternal = mmToInternal(pxToMm(dragState.delta.dx));
  const dyInternal = mmToInternal(pxToMm(dragState.delta.dy));

  dragState.names.forEach((name) => {
    const field = state.fieldByName.get(name);
    const start = dragState.internalPositions.get(name);
    if (!field || !start) return;
    field.geom.x = start.x + dxInternal;
    field.geom.y = start.y + dyInternal;
  });

  multiFieldDragState = null;
  multiFieldDragStartPointer = null;

  renderObjects();
  renderUI();
  renderFieldLists();
  renderSelectionPanels();
  return true;
}

function disableTransformerNodeDragProxyForMultiSelection(nodes) {
  if (!transformer || nodes.length <= 1) return;

  const namespace = transformer._getEventNamespace?.();
  if (!namespace) return;

  nodes.forEach((node) => node.off(`dragstart.${namespace} dragmove.${namespace}`));
}

function syncTransformerBackProxyForSelection(nodes) {
  if (!transformer) return;

  const namespace = transformer._getEventNamespace?.();
  const back = transformer.findOne?.(".back");
  if (!namespace || !back) return;

  back.off(
    `mousedown${MULTI_FIELD_DRAG_EVENT_NS} touchstart${MULTI_FIELD_DRAG_EVENT_NS} ` +
    `dragstart${MULTI_FIELD_DRAG_EVENT_NS} dragmove${MULTI_FIELD_DRAG_EVENT_NS} dragend${MULTI_FIELD_DRAG_EVENT_NS}`
  );

  if (nodes.length <= 1) {
    if (transformerBackProxyDisabled) {
      transformer._proxyDrag?.(back);
      transformerBackProxyDisabled = false;
    }
    return;
  }

  if (!transformerBackProxyDisabled) {
    back.off(`dragstart.${namespace} dragmove.${namespace}`);
    transformerBackProxyDisabled = true;
  }

  back.on(`mousedown${MULTI_FIELD_DRAG_EVENT_NS} touchstart${MULTI_FIELD_DRAG_EVENT_NS}`, () => {
    rememberMultiFieldDragStartPointer();
  });
  back.on(`dragstart${MULTI_FIELD_DRAG_EVENT_NS}`, (e) => {
    e.cancelBubble = true;
    beginMultiFieldDrag();
  });
  back.on(`dragmove${MULTI_FIELD_DRAG_EVENT_NS}`, (e) => {
    e.cancelBubble = true;
    applyMultiFieldDragMove();
  });
  back.on(`dragend${MULTI_FIELD_DRAG_EVENT_NS}`, (e) => {
    e.cancelBubble = true;
    finishMultiFieldDrag();
  });
}

function makeFieldGroup(field, options = {}) {
  const { x, y, w, h } = field.geom;
  const xPx = mmToPx(internalToMm(x));
  const yPx = mmToPx(internalToMm(y));
  const wPx = mmToPx(internalToMm(w));
  const hPx = mmToPx(internalToMm(h));

  const isDM = field.fldType === "Barcode" && field.barcode?.dataMatrix;
  const isHidden = !field.printed;
  const selectionOnly = !!options.selectionOnly;
  const useHiddenTextBacking = isHidden && isTextSelectionBoundsField(field);

  const group = new Konva.Group({ x: xPx, y: yPx, draggable: !isMobilePanMode, name: field.name });
  const content = new Konva.Group({ name: "PreviewContent" });

  const rect = new Konva.Rect({
    width: wPx,
    height: hPx,
    fill: isDM ? "rgba(255,255,255,0.98)" : (isHidden ? "rgba(106,168,255,0.10)" : "rgba(0,0,0,0.001)"),
    stroke: isHidden ? "rgba(106,168,255,0.5)" : (isDM ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0)"),
    strokeWidth: isHidden ? 1 : (isDM ? 1 : 0),
    visible: !selectionOnly && !useHiddenTextBacking,
    listening: !selectionOnly && !useHiddenTextBacking
  });

  content.add(rect);
  const previewNode = makePreviewNode(field, wPx, hPx);
  if (selectionOnly) previewNode.visible?.(false);
  if (!selectionOnly && useHiddenTextBacking) {
    addHiddenTextBacking(content, previewNode, previewNode._ciffPreviewTextStyle);
  }
  content.add(previewNode);
  if (isTextSelectionBoundsField(field)) {
    addTextPreviewSelectionBounds(content, previewNode, previewNode._ciffPreviewTextStyle);
  }
  if (!selectionOnly && isInvalidPrintableField(field)) {
    content.add(new Konva.Rect({
      width: wPx,
      height: hPx,
      stroke: "#ff5449",
      strokeWidth: 2,
      dash: [6, 4],
      fill: "rgba(255, 84, 73, 0.06)",
      listening: false,
      strokeScaleEnabled: false,
      name: "PrintableAreaError"
    }));
  }
  applyFieldOrientation(content, wPx, hPx, field.orientation);

  group.add(content);
  installTextSelectionClientRect(group, field);

  group.on("click", (e) => {
    e.cancelBubble = true;
    if (isMobilePanMode) return;
    selectField(field.name, { additive: !!e.evt.shiftKey, toggle: !!e.evt.shiftKey });
    renderUI();
  });

  group.on("mousedown touchstart", () => {
    if (isMobilePanMode) return;
    if (!isFieldSelected(field.name) || getSelectedNames().length <= 1) return;
    rememberMultiFieldDragStartPointer();
  });

  group.on("dragstart", () => {
    beginMultiFieldDrag(field.name);
  });

  group.on("dragmove", () => {
    if (multiFieldDragState?.names.has(field.name)) {
      applyMultiFieldDragMove();
      return;
    }

    if (elToggleSnap.checked) {
      const snapped = snapPoint(group.x(), group.y());
      group.position(snapped);
    }
    snapGroupToElementAlignment(group);
  });

  group.on("dragend", () => {
    if (multiFieldDragState?.names.has(field.name)) {
      finishMultiFieldDrag();
      return;
    }

    clearAlignmentGuides();
    pushHistory();
    const geomNew = pxGeomToInternal(group.x(), group.y(), rect.width(), rect.height());
    field.geom.x = geomNew.x;
    field.geom.y = geomNew.y;
    renderObjects();
    renderUI();
    renderFieldLists();
    renderSelectionPanels();
  });

  return group;
}

const PREVIEW_TEXT_FONT_FAMILY = `Arial, "Liberation Sans", Helvetica, sans-serif`;
const PREVIEW_TEXT_PROBE_FONT_SIZE = 100;
const PREVIEW_TEXT_MIN_FONT_SIZE = 1;
const PREVIEW_TEXT_FONT_MM_PER_PITCH = 0.33;
const PREVIEW_TEXT_CLARISOFT_OFFSET_X_MM = 0.42;
const PREVIEW_TEXT_CLARISOFT_OFFSET_Y_MM = 0.50;
const PREVIEW_TEXT_CLARISOFT_WIDTH_SCALE = 1.049;
const PREVIEW_TEXT_RIGHT_CLIP_GUARD_PX = 3;
const PREVIEW_TEXT_SELECTION_PADDING_MM = 0.15;
const PREVIEW_TEXT_SELECTION_MIN_SIZE_PX = 4;
const PREVIEW_TEXT_CLIP_DEBUG = globalThis.CIFF_TEXT_PREVIEW_DEBUG === true || globalThis.CIFF_TEXT_CLIP_DEBUG === true;

function measurePreviewTextBounds(text, options) {
  const probe = new Konva.Text({
    x: 0,
    y: 0,
    text: String(text || "0"),
    fontSize: options.fontSize,
    fontFamily: options.fontFamily,
    lineHeight: options.lineHeight,
    letterSpacing: options.letterSpacing,
    padding: 0,
    wrap: "none",
    ellipsis: false,
    listening: false,
    perfectDrawEnabled: false
  });
  return probe.getClientRect({ skipShadow: true, skipStroke: true });
}

function clarisoftFontSizeToCanvasPx(pitch) {
  const normalizedPitch = Math.max(1, Number(pitch) || 10);
  return Math.max(PREVIEW_TEXT_MIN_FONT_SIZE, mmToPx(normalizedPitch * PREVIEW_TEXT_FONT_MM_PER_PITCH));
}

function logPreviewTextClipDebug(field, textValue, textStyle, wPx, hPx, node) {
  if (!PREVIEW_TEXT_CLIP_DEBUG || !field || field.fldType === "Barcode") return;

  console.debug("[text-clip-preview]", {
    field: field.name,
    textValue,
    sourceFieldWidth: field.geom?.w,
    convertedPreviewWidth: Number(wPx.toFixed(3)),
    convertedPreviewHeight: Number(hPx.toFixed(3)),
    finalKonvaTextWidth: Number(textStyle.width.toFixed(3)),
    measuredTextWidth: Number((textStyle.measuredTextBounds.width * textStyle.scaleX).toFixed(3)),
    finalFontSize: Number(textStyle.fontSize.toFixed(3)),
    fontFamily: textStyle.fontFamily,
    pixelsPerMm: Number(getPixelsPerMm().toFixed(3)),
    devicePixelRatio: window.devicePixelRatio || 1,
    estimatedCanvasDpi: Number((96 * (window.devicePixelRatio || 1)).toFixed(3)),
    zoomPct,
    stageScale: {
      x: stage?.scaleX?.() ?? 1,
      y: stage?.scaleY?.() ?? 1
    },
    nodeScale: {
      x: node?.scaleX?.() ?? 1,
      y: node?.scaleY?.() ?? 1
    },
    clipEnabled: false,
    wrap: "none",
    ellipsis: false,
    calculatedSafetyPadding: textStyle.rightClipGuardPx,
    clarisoftCalibration: {
      offsetXmm: PREVIEW_TEXT_CLARISOFT_OFFSET_X_MM,
      offsetYmm: PREVIEW_TEXT_CLARISOFT_OFFSET_Y_MM,
      widthScale: PREVIEW_TEXT_CLARISOFT_WIDTH_SCALE
    },
    fontSizeConversion: {
      sourcePitch: textStyle.sourcePitch,
      mmPerPitch: PREVIEW_TEXT_FONT_MM_PER_PITCH,
      sourceTextHeightMm: Number(internalToMm(field.geom?.h ?? 0).toFixed(3))
    }
  });
}

function getPreviewTextStyle(field, wPx, hPx, previewText = "") {
  const isDM = field.fldType === "Barcode" && field.barcode?.dataMatrix;
  if (isDM) {
    return {
      x: 6,
      y: 4,
      width: Math.max(0, wPx - 12),
      height: Math.max(0, hPx - 8),
      fontSize: Math.max(12, Math.min(22, hPx * 0.12)),
      lineHeight: 1,
      scaleX: 1
    };
  }

  const rawXMag = field.text?.xMag == null ? NaN : Number(field.text.xMag);
  const pitch = getEffectiveTextPitch(field, 10);
  const xMag = Number.isFinite(rawXMag) ? Math.max(1, rawXMag) : 100;
  const paddingX = Math.max(0.5, Math.min(1.25, hPx * 0.018));
  const availableWidth = Math.max(0, wPx - paddingX * 2);
  const availableHeight = Math.max(0, hPx);
  const scaleX = (xMag / 100) * PREVIEW_TEXT_CLARISOFT_WIDTH_SCALE;
  const letterSpacing = 0;
  const lineHeight = 1;
  const fontSize = clarisoftFontSizeToCanvasPx(pitch);
  const measuredTextBounds = measurePreviewTextBounds(previewText, {
    fontSize,
    fontFamily: PREVIEW_TEXT_FONT_FAMILY,
    lineHeight,
    letterSpacing
  });
  const baseWidth = availableWidth / Math.max(0.01, scaleX);
  // Konva.Text clips exactly at width; tiny sub-pixel differences at different
  // zoom levels can hide the last glyph. Keep this guard preview-only.
  const rightClipGuardPx = PREVIEW_TEXT_RIGHT_CLIP_GUARD_PX;
  const localClipGuardPx = rightClipGuardPx / Math.max(0.01, scaleX);
  const previewTextWidth = Math.ceil(Math.max(
    baseWidth + localClipGuardPx,
    measuredTextBounds.width + localClipGuardPx
  ));

  return {
    x: 0,
    y: 0,
    width: previewTextWidth,
    selfWidth: baseWidth,
    selfHeight: availableHeight,
    height: Math.max(availableHeight, fontSize * lineHeight + 2),
    fontSize,
    lineHeight,
    scaleX,
    padding: 0,
    verticalAlign: "top",
    fontFamily: PREVIEW_TEXT_FONT_FAMILY,
    letterSpacing,
    paddingX,
    contentOffsetX: mmToPx(PREVIEW_TEXT_CLARISOFT_OFFSET_X_MM),
    contentOffsetY: mmToPx(PREVIEW_TEXT_CLARISOFT_OFFSET_Y_MM),
    measuredTextBounds,
    rightClipGuardPx,
    sourcePitch: pitch
  };
}

function alignTextPreviewNode(node, textStyle, wPx, hPx) {
  const rect = node.getClientRect({ skipShadow: true, skipStroke: true });
  const targetX = textStyle.paddingX + textStyle.contentOffsetX;
  const targetY = Math.max(0, (hPx - rect.height) / 2) + textStyle.contentOffsetY;
  node.x(node.x() + (targetX - rect.x));
  node.y(node.y() + (targetY - rect.y));
}

function isTextSelectionBoundsField(field) {
  return !!field && !(field.fldType === "Barcode" && field.barcode?.dataMatrix);
}

function getTextSelectionPaddingPx() {
  return Math.max(2, mmToPx(PREVIEW_TEXT_SELECTION_PADDING_MM));
}

function getTextPreviewSelectionRect(node, textStyle) {
  const measured = textStyle?.measuredTextBounds;
  const scaleX = Math.max(0.01, node?.scaleX?.() ?? textStyle?.scaleX ?? 1);
  const scaleY = Math.max(0.01, node?.scaleY?.() ?? 1);
  const pad = getTextSelectionPaddingPx();
  const textWidth = Math.max(1, Number(measured?.width ?? 0) * scaleX);
  const textHeight = Math.max(1, Number(measured?.height ?? textStyle?.fontSize ?? 0) * scaleY);
  const textX = (node?.x?.() ?? 0) + (Number(measured?.x ?? 0) * scaleX);
  const textY = (node?.y?.() ?? 0) + (Number(measured?.y ?? 0) * scaleY);

  return {
    x: textX - pad,
    y: textY - pad,
    width: Math.max(PREVIEW_TEXT_SELECTION_MIN_SIZE_PX, textWidth + pad * 2),
    height: Math.max(PREVIEW_TEXT_SELECTION_MIN_SIZE_PX, textHeight + pad * 2)
  };
}

function clearPreviewSelectionBounds(content) {
  const current = content?.findOne?.(".SelectionBounds");
  if (current) current.destroy();
}

function clearHiddenTextBacking(content) {
  const current = content?.findOne?.(".HiddenTextBacking");
  if (current) current.destroy();
}

function addHiddenTextBacking(content, node, textStyle) {
  if (!content || !node || !textStyle?.measuredTextBounds) return null;

  const rect = getTextPreviewSelectionRect(node, textStyle);
  const backing = new Konva.Rect({
    name: "HiddenTextBacking",
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    fill: "rgba(106,168,255,0.10)",
    stroke: "rgba(106,168,255,0.5)",
    strokeWidth: 1
  });
  content.add(backing);
  return backing;
}

function addTextPreviewSelectionBounds(content, node, textStyle) {
  if (!content || !node || !textStyle?.measuredTextBounds) return null;

  const rect = getTextPreviewSelectionRect(node, textStyle);
  const selectionBounds = new Konva.Rect({
    name: "SelectionBounds",
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    visible: false,
    listening: false,
    strokeWidth: 0
  });
  content.add(selectionBounds);
  return selectionBounds;
}

function installTextSelectionClientRect(group, field) {
  if (!isTextSelectionBoundsField(field) || group._ciffDefaultGetClientRect) return;

  group._ciffDefaultGetClientRect = group.getClientRect.bind(group);
  group.getClientRect = function(config = {}) {
    const selectionBounds = this.findOne?.(".SelectionBounds");
    if (!selectionBounds || !this._transformedRect) {
      return this._ciffDefaultGetClientRect(config);
    }

    const localRect = selectionBounds.getClientRect({
      relativeTo: this,
      skipShadow: true,
      skipStroke: true
    });

    if (!Number.isFinite(localRect.x) || !Number.isFinite(localRect.y) || localRect.width <= 0 || localRect.height <= 0) {
      return this._ciffDefaultGetClientRect(config);
    }

    if (config.skipTransform) return localRect;
    return this._transformedRect(localRect, config.relativeTo);
  };
}

function makePreviewNode(field, wPx, hPx, now = new Date()) {
  const isDM = field.fldType === "Barcode" && field.barcode?.dataMatrix;
  if (isDM) return makeDataMatrixPreviewNode(field, wPx, hPx, now);

  const previewText = makePreviewText(field, now);
  const textStyle = getPreviewTextStyle(field, wPx, hPx, previewText);
  const node = new Konva.Text({
    name: "PreviewValue",
    x: textStyle.x,
    y: textStyle.y,
    width: textStyle.width,
    height: textStyle.height,
    text: previewText,
    fontSize: textStyle.fontSize,
    fontFamily: textStyle.fontFamily,
    lineHeight: textStyle.lineHeight,
    verticalAlign: textStyle.verticalAlign,
    padding: textStyle.padding,
    letterSpacing: textStyle.letterSpacing,
    scaleX: textStyle.scaleX,
    fill: "#111",
    wrap: "none",
    ellipsis: false,
    listening: false,
    perfectDrawEnabled: false
  });
  alignTextPreviewNode(node, textStyle, wPx, hPx);
  node._ciffPreviewTextStyle = textStyle;
  node.getSelfRect = () => ({
    x: -(node.x() || 0) / Math.max(0.01, node.scaleX?.() ?? 1),
    y: -(node.y() || 0),
    width: wPx / Math.max(0.01, node.scaleX?.() ?? 1),
    height: hPx
  });
  logPreviewTextClipDebug(field, previewText, textStyle, wPx, hPx, node);
  return node;
}

function makeDataMatrixPreviewNode(field, wPx, hPx, now = new Date()) {
  const preview = buildDataMatrixPreview(field, now);
  if (!preview.ok) return makeDataMatrixFallbackNode(field, wPx, hPx, preview.message);

  const matrix = preview.matrix;
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const quietModules = getDataMatrixQuietZoneModules();
  const paddedRows = rows + quietModules * 2;
  const paddedCols = cols + quietModules * 2;
  const moduleSize = mmToPx(normalizeDataMatrixModuleSizeValue(field.barcode?.dataMatrix?.moduleSize ?? 0.5));
  if (!Number.isFinite(moduleSize) || moduleSize <= 0) {
    return makeDataMatrixFallbackNode(field, wPx, hPx, "Preview too small");
  }

  const offsetX = (wPx - (moduleSize * paddedCols)) / 2 + (quietModules * moduleSize);
  const offsetY = (hPx - (moduleSize * paddedRows)) / 2 + (quietModules * moduleSize);
  const snapToPixels = moduleSize >= 1;

  const group = new Konva.Group({ name: "PreviewValue", listening: false });
  for (let row = 0; row < rows; row++) {
    const top = snapToPixels ? Math.round(offsetY + (row * moduleSize)) : (offsetY + (row * moduleSize));
    const bottom = snapToPixels ? Math.round(offsetY + ((row + 1) * moduleSize)) : (offsetY + ((row + 1) * moduleSize));
    const height = Math.max(moduleSize, bottom - top);
    for (let col = 0; col < cols; col++) {
      if (!matrix[row][col]) continue;
      const left = snapToPixels ? Math.round(offsetX + (col * moduleSize)) : (offsetX + (col * moduleSize));
      const right = snapToPixels ? Math.round(offsetX + ((col + 1) * moduleSize)) : (offsetX + ((col + 1) * moduleSize));
      group.add(new Konva.Rect({
        x: left,
        y: top,
        width: Math.max(moduleSize, right - left),
        height,
        fill: "#111",
        strokeWidth: 0,
        listening: false,
        perfectDrawEnabled: false
      }));
    }
  }

  return group;
}

function makeDataMatrixFallbackNode(field, wPx, hPx, message) {
  const textStyle = getPreviewTextStyle(field, wPx, hPx);
  const symbolSize = field.barcode?.dataMatrix?.symbolSize || "DM";
  const lines = [`DataMatrix ${symbolSize}`];
  if (message) lines.push(message);

  return new Konva.Text({
    name: "PreviewValue",
    x: textStyle.x,
    y: textStyle.y,
    width: textStyle.width,
    height: textStyle.height,
    text: lines.join("\n"),
    fontSize: textStyle.fontSize,
    lineHeight: textStyle.lineHeight,
    fill: "rgba(0,0,0,0.92)",
    ellipsis: true
  });
}

function normalizeDataMatrixModuleSizeValue(value) {
  let size = toFloat(value, 0.5);
  if (size > 5) size /= 100;
  size = clamp(DATA_MATRIX_MODULE_SIZES[0], DATA_MATRIX_MODULE_SIZES[DATA_MATRIX_MODULE_SIZES.length - 1], size);

  let nearest = DATA_MATRIX_MODULE_SIZES[0];
  let bestDistance = Math.abs(nearest - size);
  DATA_MATRIX_MODULE_SIZES.forEach((option) => {
    const distance = Math.abs(option - size);
    if (distance < bestDistance) {
      nearest = option;
      bestDistance = distance;
    }
  });

  return Number(nearest.toFixed(2));
}

function formatDataMatrixModuleSize(value) {
  return normalizeDataMatrixModuleSizeValue(value).toFixed(2);
}

function serializeDataMatrixModuleSize(value) {
  return String(Math.round(normalizeDataMatrixModuleSizeValue(value) * 100));
}

function getDataMatrixQuietZoneModules() {
  return 1;
}

function getDataMatrixEffectiveSymbolInfo(field, now = new Date()) {
  const dm = field.barcode?.dataMatrix;
  if (!dm) return null;
  const tokens = getDataMatrixValueTokens(field, now);
  const dataCodewords = encodeDataMatrixAscii(tokens);
  return resolveDataMatrixSymbolInfo(dm.symbolSize, dataCodewords.length);
}

function getDataMatrixTotalModules(field, now = new Date()) {
  const symbolInfo = getDataMatrixEffectiveSymbolInfo(field, now);
  if (!symbolInfo) return null;

  const quietModules = getDataMatrixQuietZoneModules();
  return {
    cols: symbolInfo.symbolCols + (quietModules * 2),
    rows: symbolInfo.symbolRows + (quietModules * 2),
    symbolInfo
  };
}

function getDataMatrixFieldSizeMm(field, moduleSize = null, now = new Date()) {
  const totalModules = getDataMatrixTotalModules(field, now);
  if (!totalModules) return null;

  const moduleSizeMm = normalizeDataMatrixModuleSizeValue(moduleSize ?? field.barcode?.dataMatrix?.moduleSize ?? 0.5);
  return {
    w: totalModules.cols * moduleSizeMm,
    h: totalModules.rows * moduleSizeMm,
    moduleSize: moduleSizeMm,
    symbolInfo: totalModules.symbolInfo
  };
}

function syncDataMatrixGeomToModuleSize(field, now = new Date()) {
  const size = getDataMatrixFieldSizeMm(field, null, now);
  if (!size) return;

  field.barcode.dataMatrix.moduleSize = size.moduleSize;
  field.geom.w = mmToInternal(size.w);
  field.geom.h = mmToInternal(size.h);
  if (field.barcode) field.barcode.bcH = field.geom.h;
}

function getNearestDataMatrixModuleSizeForGeom(field, wPx, hPx, now = new Date()) {
  const totalModules = getDataMatrixTotalModules(field, now);
  if (!totalModules) return normalizeDataMatrixModuleSizeValue(field.barcode?.dataMatrix?.moduleSize ?? 0.5);

  const widthModule = pxToMm(wPx) / Math.max(1, totalModules.cols);
  const heightModule = pxToMm(hPx) / Math.max(1, totalModules.rows);
  return normalizeDataMatrixModuleSizeValue((widthModule + heightModule) / 2);
}
function normalizeDataMatrixSymbolSizeName(symbolSize) {
  return normalizeDataMatrixSymbolSizeValue(symbolSize, "Auto");
}

function resolveDataMatrixSymbolInfo(symbolSize, dataCodewordCount) {
  const normalized = normalizeDataMatrixSymbolSizeName(symbolSize);
  if (normalized === "Auto") {
    const selected = DATA_MATRIX_SYMBOLS.find((info) => dataCodewordCount <= info.dataCodewords) || DATA_MATRIX_SYMBOLS[DATA_MATRIX_SYMBOLS.length - 1];
    return DATA_MATRIX_SYMBOLS_BY_NAME.get(selected.name) || selected;
  }
  return DATA_MATRIX_SYMBOLS_BY_NAME.get(normalized) || null;
}

function buildDataMatrixPreview(field, now = new Date()) {
  const dm = field.barcode?.dataMatrix;
  if (!dm) return { ok: false, message: "No DataMatrix" };

  try {
    const tokens = getDataMatrixValueTokens(field, now);
    const dataCodewords = encodeDataMatrixAscii(tokens);
    const symbolInfo = resolveDataMatrixSymbolInfo(dm.symbolSize, dataCodewords.length);

    if (!symbolInfo) {
      return { ok: false, message: `Unsupported ${dm.symbolSize || "Auto"}` };
    }
    if (dataCodewords.length > symbolInfo.dataCodewords) {
      return { ok: false, message: `Data too long for ${symbolInfo.name}` };
    }

    const codewords = finalizeDataMatrixCodewords(dataCodewords, symbolInfo.dataCodewords, symbolInfo.errorCodewords);
    const placement = placeDataMatrixCodewords(codewords, symbolInfo.dataRows, symbolInfo.dataCols);
    return {
      ok: true,
      matrix: buildDataMatrixRenderMatrix(placement, symbolInfo),
      symbolInfo
    };
  } catch (error) {
    return { ok: false, message: error?.message || "Preview error" };
  }
}

function getDataMatrixValueTokens(field, now = new Date()) {
  const dm = field.barcode?.dataMatrix;
  if (!dm) return [];

  const segments = [...(dm.segments || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const tokens = [];

  segments.forEach((segment) => {
    let value = segment.defaultValue ?? "";
    if (segment.srcField) {
      const sourceField = state.fieldByName.get(segment.srcField);
      if (sourceField) value = getFieldDisplayValue(sourceField, now);
    }
    tokens.push(...tokenizeDataMatrixValue(value));
  });

  return tokens;
}

function tokenizeDataMatrixValue(value) {
  const text = String(value ?? "");
  const tokens = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "~") {
      if (text[i + 1] === "1") {
        tokens.push({ type: "fnc1" });
        i += 1;
        continue;
      }

      const decimalChunk = text.slice(i + 2, i + 5);
      if (text[i + 1] === "d" && /^\d{3}$/.test(decimalChunk)) {
        tokens.push({ type: "byte", value: Math.max(0, Math.min(255, Number(decimalChunk))) });
        i += 4;
        continue;
      }
    }

    const code = text.charCodeAt(i);
    tokens.push({ type: "byte", value: code <= 255 ? code : 63 });
  }

  return tokens;
}

function isDataMatrixDigitToken(token) {
  return token?.type === "byte" && token.value >= 48 && token.value <= 57;
}

function encodeDataMatrixAscii(tokens) {
  const codewords = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.type === "fnc1") {
      codewords.push(232);
      continue;
    }

    if (isDataMatrixDigitToken(token) && isDataMatrixDigitToken(tokens[i + 1])) {
      const pairValue = ((token.value - 48) * 10) + (tokens[i + 1].value - 48);
      codewords.push(130 + pairValue);
      i += 1;
      continue;
    }

    if (token.value > 127) {
      codewords.push(235);
      codewords.push(token.value - 127);
      continue;
    }

    codewords.push(token.value + 1);
  }

  return codewords;
}

function randomizeDataMatrix253State(codeword, position) {
  const pseudoRandom = ((149 * position) % 253) + 1;
  const randomized = codeword + pseudoRandom;
  return randomized <= 254 ? randomized : randomized - 254;
}

function finalizeDataMatrixCodewords(dataCodewords, dataCapacity, errorCount) {
  const padded = dataCodewords.slice();
  if (padded.length < dataCapacity) padded.push(129);
  while (padded.length < dataCapacity) {
    padded.push(randomizeDataMatrix253State(129, padded.length + 1));
  }
  return padded.concat(createDataMatrixErrorCodewords(padded, errorCount));
}

function ensureDataMatrixGaloisTables() {
  if (ensureDataMatrixGaloisTables.ready) return;

  const exp = new Array(512).fill(0);
  const log = new Array(256).fill(0);
  let value = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value >= 256) value ^= 0x12D;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];

  ensureDataMatrixGaloisTables.exp = exp;
  ensureDataMatrixGaloisTables.log = log;
  ensureDataMatrixGaloisTables.generators = new Map([[0, [1]]]);
  ensureDataMatrixGaloisTables.ready = true;
}

function dataMatrixGfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  ensureDataMatrixGaloisTables();
  const exp = ensureDataMatrixGaloisTables.exp;
  const log = ensureDataMatrixGaloisTables.log;
  return exp[log[a] + log[b]];
}

function getDataMatrixGeneratorPolynomial(degree) {
  ensureDataMatrixGaloisTables();
  const cache = ensureDataMatrixGaloisTables.generators;
  if (cache.has(degree)) return cache.get(degree);

  for (let d = 1; d <= degree; d++) {
    if (cache.has(d)) continue;
    const prev = cache.get(d - 1);
    const next = new Array(prev.length + 1).fill(0);
    const root = ensureDataMatrixGaloisTables.exp[d];
    for (let i = 0; i < prev.length; i++) {
      next[i] ^= prev[i];
      next[i + 1] ^= dataMatrixGfMul(prev[i], root);
    }
    cache.set(d, next);
  }

  return cache.get(degree);
}

function createDataMatrixErrorCodewords(dataCodewords, errorCount) {
  const generator = getDataMatrixGeneratorPolynomial(errorCount);
  const buffer = dataCodewords.concat(new Array(errorCount).fill(0));

  for (let i = 0; i < dataCodewords.length; i++) {
    const factor = buffer[i];
    if (factor === 0) continue;
    for (let j = 1; j < generator.length; j++) {
      buffer[i + j] ^= dataMatrixGfMul(generator[j], factor);
    }
  }

  return buffer.slice(dataCodewords.length);
}

function placeDataMatrixCodewords(codewords, numRows, numCols) {
  const bits = new Array(numRows * numCols).fill(-1);

  const indexFor = (row, col) => (row * numCols) + col;
  const hasBit = (col, row) => bits[indexFor(row, col)] >= 0;
  const setBit = (col, row, value) => { bits[indexFor(row, col)] = value ? 1 : 0; };

  const module = (row, col, pos, bit) => {
    if (row < 0) {
      row += numRows;
      col += 4 - ((numRows + 4) % 8);
    }
    if (col < 0) {
      col += numCols;
      row += 4 - ((numCols + 4) % 8);
    }
    const codeword = codewords[pos] ?? 0;
    setBit(col, row, (codeword & (1 << (8 - bit))) !== 0);
  };

  const utah = (row, col, pos) => {
    module(row - 2, col - 2, pos, 1);
    module(row - 2, col - 1, pos, 2);
    module(row - 1, col - 2, pos, 3);
    module(row - 1, col - 1, pos, 4);
    module(row - 1, col, pos, 5);
    module(row, col - 2, pos, 6);
    module(row, col - 1, pos, 7);
    module(row, col, pos, 8);
  };

  const corner1 = (pos) => {
    module(numRows - 1, 0, pos, 1);
    module(numRows - 1, 1, pos, 2);
    module(numRows - 1, 2, pos, 3);
    module(0, numCols - 2, pos, 4);
    module(0, numCols - 1, pos, 5);
    module(1, numCols - 1, pos, 6);
    module(2, numCols - 1, pos, 7);
    module(3, numCols - 1, pos, 8);
  };

  const corner2 = (pos) => {
    module(numRows - 3, 0, pos, 1);
    module(numRows - 2, 0, pos, 2);
    module(numRows - 1, 0, pos, 3);
    module(0, numCols - 4, pos, 4);
    module(0, numCols - 3, pos, 5);
    module(0, numCols - 2, pos, 6);
    module(0, numCols - 1, pos, 7);
    module(1, numCols - 1, pos, 8);
  };

  const corner3 = (pos) => {
    module(numRows - 3, 0, pos, 1);
    module(numRows - 2, 0, pos, 2);
    module(numRows - 1, 0, pos, 3);
    module(0, numCols - 2, pos, 4);
    module(0, numCols - 1, pos, 5);
    module(1, numCols - 1, pos, 6);
    module(2, numCols - 1, pos, 7);
    module(3, numCols - 1, pos, 8);
  };

  const corner4 = (pos) => {
    module(numRows - 1, 0, pos, 1);
    module(numRows - 1, numCols - 1, pos, 2);
    module(0, numCols - 3, pos, 3);
    module(0, numCols - 2, pos, 4);
    module(0, numCols - 1, pos, 5);
    module(1, numCols - 3, pos, 6);
    module(1, numCols - 2, pos, 7);
    module(1, numCols - 1, pos, 8);
  };

  let row = 4;
  let col = 0;
  let pos = 0;

  do {
    if (row === numRows && col === 0) corner1(pos++);
    if (row === numRows - 2 && col === 0 && (numCols % 4) !== 0) corner2(pos++);
    if (row === numRows - 2 && col === 0 && (numCols % 8) === 4) corner3(pos++);
    if (row === numRows + 4 && col === 2 && (numCols % 8) === 0) corner4(pos++);

    do {
      if (row < numRows && col >= 0 && !hasBit(col, row)) utah(row, col, pos++);
      row -= 2;
      col += 2;
    } while (row >= 0 && col < numCols);
    row += 1;
    col += 3;

    do {
      if (row >= 0 && col < numCols && !hasBit(col, row)) utah(row, col, pos++);
      row += 2;
      col -= 2;
    } while (row < numRows && col >= 0);
    row += 3;
    col += 1;
  } while (row < numRows || col < numCols);

  if (!hasBit(numCols - 1, numRows - 1)) {
    setBit(numCols - 1, numRows - 1, true);
    setBit(numCols - 2, numRows - 2, true);
  }

  return {
    bits,
    rows: numRows,
    cols: numCols,
    getBit(row, col) {
      return bits[indexFor(row, col)] === 1;
    }
  };
}

function buildDataMatrixRenderMatrix(placement, symbolInfo) {
  const matrix = [];

  for (let row = 0; row < symbolInfo.dataRows; row++) {
    if (row % symbolInfo.dataRegionRows === 0) {
      const topBorder = [];
      for (let col = 0; col < symbolInfo.symbolCols; col++) topBorder.push(col % 2 === 0 ? 1 : 0);
      matrix.push(topBorder);
    }

    const outputRow = [];
    for (let col = 0; col < symbolInfo.dataCols; col++) {
      if (col % symbolInfo.dataRegionCols === 0) outputRow.push(1);
      outputRow.push(placement.getBit(row, col) ? 1 : 0);
      if (col % symbolInfo.dataRegionCols === symbolInfo.dataRegionCols - 1) outputRow.push(row % 2 === 0 ? 1 : 0);
    }
    matrix.push(outputRow);

    if (row % symbolInfo.dataRegionRows === symbolInfo.dataRegionRows - 1) {
      matrix.push(new Array(symbolInfo.symbolCols).fill(1));
    }
  }

  return matrix;
}

function rebuildFieldPreviewNode(field, now = new Date()) {
  if (!field?._konva) return false;
  if (!shouldRenderFieldOnCanvas(field)) return false;

  const content = field._konva.findOne(".PreviewContent");
  const rect = field._konva.findOne("Rect");
  if (!content || !rect) return false;
  const selectionOnly = isSelectionOnlyHiddenField(field);
  const useHiddenTextBacking = !field.printed && isTextSelectionBoundsField(field);

  const currentPreview = content.findOne(".PreviewValue");
  if (currentPreview) currentPreview.destroy();
  clearPreviewSelectionBounds(content);
  clearHiddenTextBacking(content);

  const previewNode = makePreviewNode(field, rect.width(), rect.height(), now);
  if (selectionOnly) previewNode.visible?.(false);
  if (!selectionOnly && useHiddenTextBacking) {
    addHiddenTextBacking(content, previewNode, previewNode._ciffPreviewTextStyle);
  }
  content.add(previewNode);
  if (isTextSelectionBoundsField(field)) {
    addTextPreviewSelectionBounds(content, previewNode, previewNode._ciffPreviewTextStyle);
  }
  return true;
}

function refreshSelectionBoundsForField(field) {
  if (!field || !isFieldSelected(field.name)) return;
  transformer?.forceUpdate?.();
  uiLayer?.batchDraw();
}

function refreshFieldCanvasPreview(field, now = new Date()) {
  if (!rebuildFieldPreviewNode(field, now)) return;
  refreshSelectionBoundsForField(field);
  objLayer.batchDraw();
}

function refreshCanvasPreviews(now = new Date()) {
  let changed = false;
  const visibleFields = state.fields.filter((field) => field._konva && shouldRenderFieldOnCanvas(field));

  visibleFields.forEach((field) => {
    const needsRefresh = field.fldType === "TimeText" ||
      field.fldType === "DateText" ||
      field.fldType === "OffsetDateText" ||
      (field.fldType === "Barcode" && field.barcode?.dataMatrix);
    if (!needsRefresh) return;
    if (rebuildFieldPreviewNode(field, now)) {
      changed = true;
      refreshSelectionBoundsForField(field);
    }
  });

  if (changed) objLayer.batchDraw();
}
function getTimeFormatTokens(value) {
  return normalizeTimeFormat(value).match(/HH|hh|h|mm|m|ss|s/g) || [];
}

function getTimeFormatPreset(value) {
  const tokens = getTimeFormatTokens(value);
  return tokens.length ? tokens.join(":") : "HH:mm";
}

function getTimeSeparator(value) {
  const normalized = normalizeTimeFormat(value);
  if (!normalized) return ":";

  const separatorChars = normalized.replace(/HH|hh|h|mm|m|ss|s/g, "");
  return separatorChars ? separatorChars[0] : "";
}

function buildTimeTemplateFormat(formatPreset, separator) {
  const tokens = getTimeFormatTokens(formatPreset);
  if (!tokens.length) return "";
  if (separator == null) separator = ":";
  if (separator === "") return tokens.join("");
  return tokens.join(`'${separator}'`);
}

function getDateFormatTokens(value) {
  return normalizeTimeFormat(value).match(/yyyy|yy|MMM|MM|dd/g) || [];
}

function getDateFormatPreset(value) {
  const tokens = getDateFormatTokens(value);
  return tokens.length ? tokens.join("/") : "dd/MM/yy";
}

function getDateSeparator(value) {
  const normalized = normalizeTimeFormat(value);
  if (!normalized) return ".";

  const separatorChars = normalized.replace(/yyyy|yy|MMM|MM|dd/g, "");
  const separator = separatorChars ? separatorChars[0] : "";
  return separator === "/" ? "." : separator;
}

function buildDateTemplateFormat(formatPreset, separator) {
  const tokens = getDateFormatTokens(formatPreset);
  if (!tokens.length) return "";
  if (separator == null) separator = ".";
  if (separator === "") return tokens.join("");
  return tokens.join(`'${separator}'`);
}

function applyDateOffsetDelta(baseDate, delta) {
  const date = new Date(baseDate);
  if (!delta) return date;

  const years = toInt(delta.y, 0);
  const months = toInt(delta.m, 0);
  const days = toInt(delta.d, 0);

  if (years) date.setFullYear(date.getFullYear() + years);
  if (months) date.setMonth(date.getMonth() + months);
  if (days) date.setDate(date.getDate() + days);

  return date;
}

function getComputedDateOffsetCurrent(offset, now = new Date()) {
  const date = applyDateOffsetDelta(now, offset?.default);
  return {
    d: date.getDate(),
    m: date.getMonth() + 1,
    y: date.getFullYear()
  };
}

function inferDateLocale(fldType, formatValue, calcData) {
  if (fldType !== "DateText" && fldType !== "OffsetDateText") return null;
  if (!/MMM/.test(normalizeTimeFormat(formatValue))) return "en";
  return /[\u0410-\u042f\u0430-\u044f\u0401\u0451]/u.test(calcData || "") ? "ru" : "en";
}

function getDateBaseValue(field, now = new Date()) {
  const date = new Date(now);
  if (field.fldType !== "OffsetDateText") return date;

  const offset = state.dateOffsets.find(o => o.name === field.data.offsetRef);
  return offset ? applyDateOffsetDelta(date, offset.default) : date;
}

function getTimeTextValue(field, now = new Date()) {
  const format = normalizeTimeFormat(field?.data?.defaultValue || buildTimeTemplateFormat("HH:mm", ":")) || "HH:mm";
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  return format.replace(/HH|hh|h|mm|m|ss|s/g, (token) => {
    switch (token) {
      case "HH": return pad2(hours24);
      case "hh": return pad2(hours12);
      case "h": return String(hours12);
      case "mm": return pad2(minutes);
      case "m": return String(minutes);
      case "ss": return pad2(seconds);
      case "s": return String(seconds);
      default: return token;
    }
  });
}

function getDateTextValue(field, now = new Date()) {
  const format = normalizeTimeFormat(field?.data?.defaultValue || buildDateTemplateFormat("dd/MM/yy", ".")) || "dd.MM.yy";
  const date = getDateBaseValue(field, now);
  const locale = field?.data?.dateLocale === "ru" ? "ru" : "en";
  const months = DATE_MONTH_NAMES[locale] || DATE_MONTH_NAMES.en;
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return format.replace(/yyyy|yy|MMM|MM|dd/g, (token) => {
    switch (token) {
      case "dd": return pad2(day);
      case "MM": return pad2(month + 1);
      case "MMM": return months[month];
      case "yy": return String(year).slice(-2);
      case "yyyy": return String(year);
      default: return token;
    }
  });
}

function getDynamicFieldValue(field, now = new Date()) {
  if (field.fldType === "TimeText") return getTimeTextValue(field, now);
  if (field.fldType === "DateText" || field.fldType === "OffsetDateText") return getDateTextValue(field, now);
  return null;
}

function getFieldDisplayValue(field, now = new Date()) {
  const dynamicValue = getDynamicFieldValue(field, now);
  if (dynamicValue != null) return dynamicValue;
  return getStoredTextFieldValue(field);
}

function syncDynamicFieldCalcData(now = new Date()) {
  return;
}

function refreshSelectedDynamicFieldPreview(now = new Date()) {
  const field = state.selectedName ? state.fieldByName.get(state.selectedName) : null;
  if (field) {
    const value = getDynamicFieldValue(field, now);
    if (value != null) {
      const valueInput = elPropsPanel.querySelector('[data-dynamic-preview-value="1"]');
      if (valueInput && document.activeElement !== valueInput) valueInput.value = value;
    }
  }

  refreshCanvasPreviews(now);
}

function startDynamicFieldValueTicker() {
  window.setInterval(() => {
    refreshSelectedDynamicFieldPreview();
  }, 1000);
}

function makePreviewText(field, now = new Date()) {
  const t = field.fldType;
  if (t === "Barcode" && field.barcode?.dataMatrix) {
    return `DataMatrix ${field.barcode.dataMatrix.symbolSize || "DM"}`;
  }
  if (t === "TimeText") return getTimeTextValue(field, now);
  if (t === "DateText" || t === "OffsetDateText") return getDateTextValue(field, now);
  if (t === "CounterText") return field.calcData || field.data.defaultValue || "";
  return getStoredTextFieldValue(field);
}

function parseCounterNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const num = Number(String(value).trim());
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function getCounterMaxValue(noOfChars) {
  const digits = Math.max(1, Math.round(parseCounterNumber(noOfChars, 1) ?? 1));
  return Number.parseInt("9".repeat(digits), 10);
}

function formatCounterValue(value, noOfChars) {
  const digits = Math.max(1, Math.round(parseCounterNumber(noOfChars, 1) ?? 1));
  const safeValue = Math.max(0, Math.trunc(parseCounterNumber(value, 0) ?? 0));
  return String(safeValue).padStart(digits, "0");
}

function normalizeCounterField(field, options = {}) {
  if (!field || field.fldType !== "CounterText") return;

  const preserveCurrent = options.preserveCurrent !== false;
  const counter = field.data.counter ?? (field.data.counter = {});
  const noOfChars = Math.max(1, Math.round(parseCounterNumber(counter.noOfChars, 4) ?? 4));
  const maxValue = getCounterMaxValue(noOfChars);
  const stepSize = Math.max(1, parseCounterNumber(counter.stepSize, 1) ?? 1);

  let startVal = parseCounterNumber(counter.startVal, null);
  if (startVal == null) {
    startVal = parseCounterNumber(field.calcData ?? field.data.defaultValue, 1) ?? 1;
  }
  startVal = clamp(0, maxValue, startVal);

  let endVal = parseCounterNumber(counter.endVal, maxValue);
  endVal = clamp(startVal, maxValue, endVal == null ? maxValue : endVal);
  endVal = startVal + Math.floor((endVal - startVal) / stepSize) * stepSize;
  endVal = clamp(startVal, maxValue, endVal);

  let currentValue = preserveCurrent
    ? parseCounterNumber(field.calcData ?? field.data.defaultValue, startVal)
    : startVal;
  currentValue = clamp(startVal, endVal, currentValue == null ? startVal : currentValue);
  currentValue = startVal + Math.floor((currentValue - startVal) / stepSize) * stepSize;
  currentValue = clamp(startVal, endVal, currentValue);

  counter.noOfChars = noOfChars;
  counter.significance = parseCounterNumber(counter.significance, 0) ?? 0;
  counter.startVal = String(startVal);
  counter.endVal = String(endVal);
  counter.stepSize = stepSize;
  counter.clrStCntType = counter.clrStCntType ?? "";

  field.data.dataType = 4;
  field.data.defaultValue = formatCounterValue(currentValue, noOfChars);
  field.calcData = field.data.defaultValue;
}

function applyCounterFieldChange(field, updater, options = {}) {
  if (!field || field.fldType !== "CounterText") return;
  pushHistory();
  updater(field.data.counter ?? (field.data.counter = {}));
  normalizeCounterField(field, { preserveCurrent: options.preserveCurrent ?? false });
  renderSelectionPanels();
  refreshFieldCanvasPreview(field);
}

function getSelectedNames() {
  const names = Array.isArray(state.selectedNames)
    ? state.selectedNames.filter((name) => state.fieldByName.has(name))
    : [];
  if (names.length) return names;
  if (state.selectedName && state.fieldByName.has(state.selectedName)) return [state.selectedName];
  return [];
}

function getSelectedFields() {
  return getSelectedNames().map((name) => state.fieldByName.get(name)).filter(Boolean);
}

function isFieldSelected(name) {
  return getSelectedNames().includes(name);
}

function setSelectedNames(names, primaryName = null) {
  const unique = [...new Set((names || []).filter((name) => state.fieldByName.has(name)))];
  state.selectedNames = unique;
  if (!unique.length) {
    state.selectedName = null;
    return;
  }
  state.selectedName = primaryName && unique.includes(primaryName)
    ? primaryName
    : unique[unique.length - 1];
}

function renderUI() {
  transformer.nodes([]);
  const nodes = getSelectedFields().map((field) => field._konva).filter(Boolean);
  if (nodes.length) {
    transformer.nodes(nodes);
    disableTransformerNodeDragProxyForMultiSelection(nodes);
  }
  syncTransformerBackProxyForSelection(nodes);
  uiLayer.draw();
}

function renderFieldLists() {
  const q = (elSearch.value || "").trim().toLowerCase();
  const printed = state.fields.filter(f => f.printed);
  const hidden = state.fields.filter(f => !f.printed);

  const printedFiltered = q ? printed.filter(f => f.name.toLowerCase().includes(q)) : printed;
  const hiddenFiltered = q ? hidden.filter(f => f.name.toLowerCase().includes(q)) : hidden;

  elFieldsPrinted.innerHTML = "";
  elFieldsHidden.innerHTML = "";

  for (const f of printedFiltered) elFieldsPrinted.appendChild(makeListItem(f));
  for (const f of hiddenFiltered) elFieldsHidden.appendChild(makeListItem(f));
}

function makeListItem(field) {
  const item = document.createElement("button");
  item.className = "listItem" + (isFieldSelected(field.name) ? " listItem--active" : "");
  item.type = "button";

  const main = document.createElement("div");
  main.className = "listItem__main";

  const headline = document.createElement("div");
  headline.className = "listItem__headline";
  headline.textContent = field.name;

  const supporting = document.createElement("div");
  supporting.className = "listItem__supporting";
  supporting.textContent = getFieldSubtypeLabel(field);

  const trailing = document.createElement("span");
  trailing.className = "badge";
  trailing.textContent = field.printed ? t("panel.printed.title") : t("panel.hidden.title");

  main.appendChild(headline);
  main.appendChild(supporting);
  item.appendChild(main);
  item.appendChild(trailing);
  item.addEventListener("click", () => {
    selectField(field.name);
    centerOnField(field);
    renderAll();
  });
  return item;
}

function centerOnField(field) {
  if (!field?._konva) return;
  const g = field._konva;
  const r = g.getClientRect({ relativeTo: objLayer });
  const host = elCanvasHost.getBoundingClientRect();
  const cx = (host.width / 2) - (r.x + r.width / 2) - stage.x();
  const cy = (host.height / 2) - (r.y + r.height / 2) - stage.y();
  stage.position({ x: stage.x() + cx, y: stage.y() + cy });
  stage.batchDraw();
  renderRulers();
}

function renderSelectionPanels() {
  const selectedFields = getSelectedFields();
  const f = selectedFields.length === 1 ? selectedFields[0] : null;

  if (!selectedFields.length) {
    elPropsEmpty.classList.remove("hidden");
    elPropsPanel.classList.add("hidden");
    elBtnDelete.disabled = true;

    elDmEmpty.classList.remove("hidden");
    elDmPanel.classList.add("hidden");
    elDmPanel.innerHTML = "";
    elStatusLeft.textContent = t("status.nothingSelected");
    return;
  }

  elBtnDelete.disabled = false;

  if (selectedFields.length > 1) {
    elPropsEmpty.classList.add("hidden");
    elPropsPanel.classList.remove("hidden");
    elPropsPanel.innerHTML = "";
    elPropsPanel.appendChild(buildMultiSelectionProps(selectedFields));

    elDmEmpty.classList.remove("hidden");
    elDmPanel.classList.add("hidden");
    elDmPanel.innerHTML = "";

    updateStatusSelectionMulti(selectedFields);
    return;
  }

  elPropsEmpty.classList.add("hidden");
  elPropsPanel.classList.remove("hidden");
  elPropsPanel.innerHTML = "";

  elPropsPanel.appendChild(buildCommonProps(f));
  elPropsPanel.appendChild(document.createElement("div")).className = "hr1";

  if (f.fldType === "Barcode" && f.barcode?.dataMatrix) {
    elPropsPanel.appendChild(buildBarcodeProps(f));
  } else {
    elPropsPanel.appendChild(buildTextLikeProps(f));
  }

  if (f.fldType === "Barcode" && f.barcode?.dataMatrix) {
    elDmEmpty.classList.add("hidden");
    elDmPanel.classList.remove("hidden");
    elDmPanel.innerHTML = "";
    elDmPanel.appendChild(buildDataMatrixPanel(f));
  } else {
    elDmEmpty.classList.remove("hidden");
    elDmPanel.classList.add("hidden");
    elDmPanel.innerHTML = "";
  }

  updateStatusSelection(f);
}

function updateStatusSelection(f) {
  elStatusLeft.textContent =
    `${t("status.selected")}: ${f.name} | ${f.fldType} | X=${internalToMm(f.geom.x).toFixed(2)} ` +
    `Y=${internalToMm(f.geom.y).toFixed(2)} W=${internalToMm(f.geom.w).toFixed(2)} ` +
    `H=${internalToMm(f.geom.h).toFixed(2)} (mm)`;
}

function updateStatusSelectionMulti(fields) {
  elStatusLeft.textContent = t("status.selectedMultiple", { count: fields.length });
}

function updateTemplateSize(widthMm, heightMm) {
  if (!state.xmlDoc) return;

  const limitWidthInternal = EMPTY_TEMPLATE_SUBIMAGE.maxImageWidth;
  const limitHeightInternal = EMPTY_TEMPLATE_SUBIMAGE.maxImageHeight;
  const currentWidthInternal = state.subImage.maxWidth || state.subImage.width || limitWidthInternal;
  const currentHeightInternal = state.subImage.maxHeight || state.subImage.height || limitHeightInternal;
  const nextWidthMm = normalizeEmptyTemplateDimensionMm(widthMm, limitWidthInternal, currentWidthInternal);
  const nextHeightMm = normalizeEmptyTemplateDimensionMm(heightMm, limitHeightInternal, currentHeightInternal);
  const nextWidthInternal = Math.min(limitWidthInternal, mmToInternal(nextWidthMm));
  const nextHeightInternal = Math.min(limitHeightInternal, mmToInternal(nextHeightMm));

  if (nextWidthInternal === state.subImage.maxWidth && nextHeightInternal === state.subImage.maxHeight) return;

  pushHistory();
  state.subImage.maxWidth = nextWidthInternal;
  state.subImage.maxHeight = nextHeightInternal;
  if (!state.subImage.width) state.subImage.width = nextWidthInternal;
  if (!state.subImage.height) state.subImage.height = nextHeightInternal;
  renderAll();
}

function renderTemplateSizePanel() {
  if (!elTemplateSizePanel) return;
  elTemplateSizePanel.innerHTML = "";

  if (!state.xmlDoc) {
    const note = document.createElement("div");
    note.className = "muted";
    note.textContent = t("status.noTemplate");
    elTemplateSizePanel.appendChild(note);
    return;
  }

  const limitWidthInternal = EMPTY_TEMPLATE_SUBIMAGE.maxImageWidth;
  const limitHeightInternal = EMPTY_TEMPLATE_SUBIMAGE.maxImageHeight;
  const currentWidthInternal = state.subImage.maxWidth || state.subImage.width || limitWidthInternal;
  const currentHeightInternal = state.subImage.maxHeight || state.subImage.height || limitHeightInternal;
  const currentWidthMm = normalizeEmptyTemplateDimensionMm(internalToMm(currentWidthInternal), limitWidthInternal, currentWidthInternal);
  const currentHeightMm = normalizeEmptyTemplateDimensionMm(internalToMm(currentHeightInternal), limitHeightInternal, currentHeightInternal);
  const maxWidthMm = internalToMm(limitWidthInternal);
  const maxHeightMm = internalToMm(limitHeightInternal);

  const wrap = document.createElement("div");
  wrap.className = "form";
  wrap.appendChild(fieldRow(t("template.width"), inputNumber(currentWidthMm, (v) => updateTemplateSize(v, currentHeightMm), { min: 0.01, max: maxWidthMm, step: 0.01 })));
  wrap.appendChild(fieldRow(t("template.height"), inputNumber(currentHeightMm, (v) => updateTemplateSize(currentWidthMm, v), { min: 0.01, max: maxHeightMm, step: 0.01 })));

  const note = document.createElement("div");
  note.className = "note";
  note.textContent = t("template.sizeLimit", {
    maxWidth: maxWidthMm.toFixed(2),
    maxHeight: maxHeightMm.toFixed(2),
    usedWidth: internalToMm(getUsedImageInternalWidth()).toFixed(2),
    usedHeight: internalToMm(getUsedImageInternalHeight()).toFixed(2)
  });

  elTemplateSizePanel.appendChild(wrap);
  elTemplateSizePanel.appendChild(note);
}

function updateTemplateTarget(printerModel, printMode) {
  if (!state.xmlDoc) return;

  const nextPrinterModel = normalizePrinterModel(printerModel);
  const nextPrintMode = normalizePrintMode(printMode);
  const nextDesignedFor = buildDesignedForLabel(nextPrinterModel, nextPrintMode);

  if (
    nextPrinterModel === normalizePrinterModel(state.docMeta.printerModel) &&
    nextPrintMode === normalizePrintMode(state.docMeta.printMode) &&
    nextDesignedFor === String(state.docMeta.designedFor ?? "").trim()
  ) {
    return;
  }

  pushHistory();
  state.docMeta.printerModel = nextPrinterModel;
  state.docMeta.printMode = nextPrintMode;
  state.docMeta.designedFor = nextDesignedFor;
  renderAll();
}

function renderTemplateTargetPanel() {
  if (!elTemplateTargetPanel) return;
  elTemplateTargetPanel.innerHTML = "";

  if (!state.xmlDoc) {
    const note = document.createElement("div");
    note.className = "muted";
    note.textContent = t("status.noTemplate");
    elTemplateTargetPanel.appendChild(note);
    return;
  }

  const currentPrinterModel = normalizePrinterModel(state.docMeta.printerModel);
  const currentPrintMode = normalizePrintMode(state.docMeta.printMode);

  const wrap = document.createElement("div");
  wrap.className = "form";
  wrap.appendChild(fieldRow(
    t("template.printerModel"),
    selectStringOptions(currentPrinterModel, TEMPLATE_TARGET_PRINTER_MODELS, (value) => updateTemplateTarget(value, currentPrintMode))
  ));
  wrap.appendChild(fieldRow(
    t("template.printMode"),
    createMaterialSelect(
      EMPTY_TEMPLATE_PRINT_MODES.map((mode) => ({ value: mode, label: mode })),
      currentPrintMode,
      (value) => updateTemplateTarget(currentPrinterModel, value)
    )
  ));

  const note = document.createElement("div");
  note.className = "note";
  note.textContent = t("template.designedFor", { value: buildDesignedForLabel(currentPrinterModel, currentPrintMode) });

  elTemplateTargetPanel.appendChild(wrap);
  elTemplateTargetPanel.appendChild(note);
}
