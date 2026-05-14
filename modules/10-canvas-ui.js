function initCanvas() {
  const rect = elCanvasHost.getBoundingClientRect();

  stage = new Konva.Stage({
    container: "canvasHost",
    width: rect.width,
    height: rect.height,
    draggable: false
  });

  gridLayer = new Konva.Layer({ listening: false });
  objLayer = new Konva.Layer();
  uiLayer = new Konva.Layer();

  stage.add(gridLayer);
  stage.add(objLayer);
  stage.add(uiLayer);

  transformer = new Konva.Transformer({
    rotateEnabled: false,
    ignoreStroke: true,
    boundBoxFunc: (oldBox, newBox) => {
      if (newBox.width < 5 || newBox.height < 5) return oldBox;
      return newBox;
    }
  });
  selectionRect = new Konva.Rect({
    visible: false,
    listening: false,
    fill: "rgba(106,168,255,0.18)",
    stroke: "rgba(106,168,255,0.75)",
    strokeWidth: 1,
    dash: [4, 4]
  });
  alignmentGuideGroup = new Konva.Group({
    name: "AlignmentGuides",
    visible: false,
    listening: false
  });
  uiLayer.add(alignmentGuideGroup);
  uiLayer.add(selectionRect);
  uiLayer.add(transformer);

  stage.on("mousedown", (e) => {
    if ((e.evt?.button ?? 0) !== 0) return;
    if (isSpaceDown) {
      isPanning = true;
      const p = stage.getPointerPosition();
      panStart = { x: stage.x(), y: stage.y(), px: p?.x ?? 0, py: p?.y ?? 0 };
      return;
    }
    if (e.target === stage) {
      const p = getStageLocalPointerPosition();
      if (!p) return;
      isSelectionBoxActive = true;
      selectionBoxAdditive = !!e.evt.shiftKey;
      selectionStart = p;
      selectionRect.setAttrs({ x: p.x, y: p.y, width: 0, height: 0, visible: true });
      uiLayer.batchDraw();
    }
  });

  stage.on("mousemove", () => {
    const p = stage.getPointerPosition();
    if (!p) return;

    if (isPanning && panStart) {
      const dx = p.x - panStart.px;
      const dy = p.y - panStart.py;
      stage.position({ x: panStart.x + dx, y: panStart.y + dy });
      stage.batchDraw();
      renderRulers();
      return;
    }

    if (isSelectionBoxActive && selectionStart) {
      const local = getStageLocalPointerPosition();
      if (!local) return;
      selectionRect.setAttrs({
        x: Math.min(selectionStart.x, local.x),
        y: Math.min(selectionStart.y, local.y),
        width: Math.abs(local.x - selectionStart.x),
        height: Math.abs(local.y - selectionStart.y),
        visible: true
      });
      uiLayer.batchDraw();
      return;
    }

    const mm = pxToMmWorld(p.x, p.y);
    elStatusRight.textContent = `Cursor: X = ${mm.x.toFixed(2)} mm  Y = ${mm.y.toFixed(2)} mm`;
  });

  stage.on("mouseup", () => {
    if (isSelectionBoxActive) {
      const box = selectionRect.getClientRect({ relativeTo: uiLayer });
      const hasArea = box.width > 3 && box.height > 3;
      selectionRect.visible(false);

      if (hasArea) {
        const nextNames = selectionBoxAdditive ? getSelectedNames().slice() : [];
        state.fields.forEach((field) => {
          if (!field._konva) return;
          const fieldRect = field._konva.getClientRect({ relativeTo: objLayer });
          if (!rectsIntersect(box, fieldRect)) return;
          if (!nextNames.includes(field.name)) nextNames.push(field.name);
        });
        setSelectedNames(nextNames, nextNames[nextNames.length - 1] ?? null);
        renderSelectionPanels();
        renderFieldLists();
        renderUI();
      } else if (!selectionBoxAdditive) {
        setSelectedNames([]);
        renderSelectionPanels();
        renderFieldLists();
        renderUI();
      }

      isSelectionBoxActive = false;
      selectionStart = null;
      selectionBoxAdditive = false;
      uiLayer.batchDraw();
    }

    isPanning = false;
    panStart = null;
  });

  elCanvasHost.addEventListener("wheel", (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    const delta = -ev.deltaY;
    const step = delta > 0 ? 10 : -10;
    setZoom(clamp(25, 400, zoomPct + step));
  }, { passive: false });

  window.addEventListener("resize", () => {
    const r = elCanvasHost.getBoundingClientRect();
    stage.size({ width: r.width, height: r.height });
    stage.batchDraw();
    renderRulers();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") isSpaceDown = true;
    if (e.key === "Delete") deleteSelected();
    if (matchesPrimaryShortcut(e, "KeyZ", "z")) { e.preventDefault(); undo(); }
    if (matchesPrimaryShortcut(e, "KeyY", "y")) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); downloadCiff(); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { isSpaceDown = false; isPanning = false; } });

  // Transformer transformend => apply resize to internal geometry
  transformer.on("transformend", () => {
    const selectedFields = getSelectedFields().filter((field) => field._konva);
    if (!selectedFields.length) return;

    pushHistory();

    selectedFields.forEach((field) => {
      const group = field._konva;
      const rect = group.findOne("Rect");
      if (!rect) return;

      const scaleX = group.scaleX();
      const scaleY = group.scaleY();

      let newW = Math.max(5, rect.width() * scaleX);
      let newH = Math.max(5, rect.height() * scaleY);

      group.scaleX(1);
      group.scaleY(1);

      if (field.fldType === "Barcode" && field.barcode?.dataMatrix) {
        const nextModuleSize = getNearestDataMatrixModuleSizeForGeom(field, newW, newH);
        field.barcode.dataMatrix.moduleSize = nextModuleSize;
        const syncedSize = getDataMatrixFieldSizeMm(field, nextModuleSize);
        if (syncedSize) {
          newW = mmToPx(syncedSize.w);
          newH = mmToPx(syncedSize.h);
        }
      }

      rect.width(newW);
      rect.height(newH);

      const label = group.findOne("Text");
      if (label) {
        label.width(Math.max(0, newW - 12));
        label.height(Math.max(0, newH - 8));
      }

      const geomNew = pxGeomToInternal(group.x(), group.y(), newW, newH);
      field.geom.x = geomNew.x;
      field.geom.y = geomNew.y;
      field.geom.w = geomNew.w;
      field.geom.h = geomNew.h;
      if (field.fldType === "Barcode" && field.barcode) field.barcode.bcH = geomNew.h;
    });

    renderAll();
  });
}

function matchesPrimaryShortcut(e, code, key) {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;

  // KeyboardEvent.code is based on the physical key and does not depend on
  // the active keyboard layout. Keep event.key as a fallback for older paths.
  return e.code === code || String(e.key || "").toLowerCase() === key;
}

// ---------- UI init ----------
function initUI() {
  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => {
        b.classList.remove("tab--active");
        b.active = false;
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("tab--active");
      btn.active = true;
      btn.setAttribute("aria-selected", "true");
      const tab = btn.dataset.tab;

      document.querySelectorAll(".tabview").forEach(v => v.classList.remove("tabview--active"));
      $(`tab-${tab}`).classList.add("tabview--active");
    });
  });

  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileSmart(file);
    loadXml(text);
  });
  $("btnOpenFile")?.addEventListener("click", () => $("fileInput").click());

  $("btnSave").addEventListener("click", () => downloadCiff());

  populateNewTemplateOptions();
  $("btnNewTemplate").addEventListener("click", () => openNewTemplateModal());
  $("btnCancelNewTemplate").addEventListener("click", () => closeNewTemplateModal());
  $("btnCreateNewTemplate").addEventListener("click", () => createNewTemplateFromDialog());
  elNewTemplateModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.modalClose === "1") closeNewTemplateModal();
  });
  elZoomRange.addEventListener("input", () => setZoom(parseInt(String(elZoomRange.value), 10)));
  $("zoomIn").addEventListener("click", () => setZoom(clamp(25, 400, zoomPct + 10)));
  $("zoomOut").addEventListener("click", () => setZoom(clamp(25, 400, zoomPct - 10)));

  elToggleGrid.addEventListener("change", () => renderGrid());
  elToggleSnap.addEventListener("change", () => {/* used during drag */});
  elToggleAlign?.addEventListener("change", () => clearAlignmentGuides());

  elSearch.addEventListener("input", () => renderFieldLists());

  $("addFixedText").addEventListener("click", () => addField("FixedText"));
  $("addDateText").addEventListener("click", () => addField("DateText"));
  $("addOffsetDateText").addEventListener("click", () => addField("OffsetDateText"));
  $("addTimeText").addEventListener("click", () => addField("TimeText"));
  $("addCounterText").addEventListener("click", () => addField("CounterText"));
  $("addDataMatrix").addEventListener("click", () => addField("Barcode"));

  elBtnDelete.addEventListener("click", () => deleteSelected());

  $("btnShowHiddenOnCanvas").addEventListener("click", () => {
    state.showHiddenOnCanvas = !state.showHiddenOnCanvas;
    renderAll();
  });
  $("addOffset").addEventListener("click", () => {
    if (!state.xmlDoc) return;
    pushHistory();
    createDateOffset();
    renderAll();
  });

  $("btnUndo").addEventListener("click", undo);
  $("btnRedo").addEventListener("click", redo);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elNewTemplateModal && !elNewTemplateModal.classList.contains("hidden")) {
      closeNewTemplateModal();
    }
  });

  updateHiddenCanvasToggleButton();
  elStatusLeft.textContent = "Open a CIFF file (.ciff/.xml).";
  elStatusRight.textContent = "-";
}

function setZoom(pct) {
  zoomPct = pct;
  elZoomRange.value = String(pct);
  elZoomLabel.textContent = `${pct}%`;

  renderGrid();
  renderObjects();
  renderRulers();
  renderUI();
}

function getPixelsPerMm() { return MM_TO_PX_BASE * (zoomPct / 100); }
function mmToPx(mm) { return mm * getPixelsPerMm(); }
function pxToMm(px) { return px / getPixelsPerMm(); }
function internalToMm(v) { return v / INTERNAL_PER_MM; }
function mmToInternal(mm) { return Math.round(mm * INTERNAL_PER_MM); }

function pxToMmWorld(px, py) {
  const x = pxToMm(px - stage.x());
  const y = pxToMm(py - stage.y());
  return { x, y };
}

function getStageLocalPointerPosition() {
  const p = stage.getPointerPosition();
  if (!p) return null;
  return { x: p.x - stage.x(), y: p.y - stage.y() };
}

function rectsIntersect(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function getCanvasInternalWidth() {
  return state.subImage.maxWidth || state.subImage.width || 0;
}

function getCanvasInternalHeight() {
  return state.subImage.maxHeight || state.subImage.height || 0;
}

function getUsedImageInternalWidth() {
  return state.subImage.width || state.subImage.maxWidth || 0;
}

function getUsedImageInternalHeight() {
  return state.subImage.height || state.subImage.maxHeight || 0;
}

