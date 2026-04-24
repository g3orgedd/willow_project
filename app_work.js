/* app.js — CIFF Editor (Videojet / Clarisoft) with LOSSLESS save (2-line, CRLF)
   Key changes per your issue:
   ✅ Lossless save keeps original formatting and ONLY patches specific parts
   ✅ Existing fields are patched "non-invasive": we DO NOT auto-insert/remove VarText/FixedLen/MaxNoOfChars/etc
      (we only change them if they already exist in that field block)
   ✅ DateOffsets: we DO NOT wipe/rebuild Header unless offsets were loaded and marked dirty
   ✅ Always save as UTF-16LE + BOM + CRLF + 2 lines (+ final CRLF)
   ✅ Validate OffsetDate references before saving (missing DateOffset => block save)

   Libraries: Konva.js included in index.html
*/

const MM_TO_PX_BASE = 12;          // 1mm -> px at zoom=100%
const INTERNAL_PER_MM = 100;       // CIFF units: 0.01mm
const SNAP_MM = 0.10;              // snap step in mm
const GRID_MM = 1.0;               // grid step in mm

// DataMatrix profiles (you can adjust fixedFields)
const DM_PROFILES = {
  "22X22": {
    symbolSize: "22X22",
    requiredSegments: ["С1","GTIN","С2","SN","С3","KRIPTO"],
    fixedFields: { "С1":"~101", "С2":"21", "С3":"~d02993" },
    disallowedFields: ["C4","KRIPTO2"]
  },
  "36X36": {
    symbolSize: "36X36",
    requiredSegments: ["С1","GTIN","С2","SN","С3","KRIPTO","C4","KRIPTO2"],
    fixedFields: { "С1":"~101", "С2":"21", "С3":"~d02991", "C4":"~d02992" }
  }
};

const ALLOWED_ORIENTATIONS = [0, 90, 180, 270];

// ---------- State ----------
let state = {
  xmlDoc: null,
  xmlText: "",              // original text (as loaded)
  line1: "",                // xml declaration line (kept)
  line2: "",                // ImageDesign single line (kept)
  lineEnding: "\r\n",        // we'll always output CRLF

  docMeta: { version: null, designedFor: "", clStVersionInfo: "" },
  subImage: { imageReference: "1", width: 0, height: 0, maxWidth: 0, maxHeight: 0, xRes: 0.12, orientation: 0 },

  dateOffsets: [],          // parsed from Header DateOffset
  dateOffsetsLoaded: false,
  dateOffsetsDirty: false,

  fields: [],               // parsed from SubImage Field
  fieldByName: new Map(),

  selectedName: null,
  showHiddenOnCanvas: false
};

// history (simple snapshot)
let history = { undo: [], redo: [] };

// ---------- UI refs ----------
const $ = (id) => document.getElementById(id);

const elFieldsPrinted = $("fieldsPrinted");
const elFieldsHidden = $("fieldsHidden");
const elSearch = $("fieldSearch");
const elPropsEmpty = $("propsEmpty");
const elPropsPanel = $("propsPanel");
const elBtnDelete = $("btnDelete");

const elDmEmpty = $("dmEmpty");
const elDmPanel = $("dmPanel");

const elHiddenEditor = $("hiddenEditor");
const elOffsetsEditor = $("offsetsEditor");

const elStatusLeft = $("statusLeft");
const elStatusRight = $("statusRight");

const elToggleGrid = $("toggleGrid");
const elToggleSnap = $("toggleSnap");
const elZoomRange = $("zoomRange");
const elZoomLabel = $("zoomLabel");

// ---------- Konva ----------
let stage, gridLayer, objLayer, uiLayer, transformer;
let zoomPct = 100;
let isSpaceDown = false;
let isPanning = false;
let panStart = null;

initCanvas();
initUI();

// ---------- Canvas init ----------
function initCanvas() {
  const host = $("canvasHost");
  const rect = host.getBoundingClientRect();

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
  uiLayer.add(transformer);

  stage.on("mousedown", (e) => {
    if (isSpaceDown) {
      isPanning = true;
      const p = stage.getPointerPosition();
      panStart = { x: stage.x(), y: stage.y(), px: p?.x ?? 0, py: p?.y ?? 0 };
      return;
    }
    if (e.target === stage) {
      selectField(null);
      renderUI();
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
      return;
    }
    const mm = pxToMmWorld(p.x, p.y);
    elStatusRight.textContent = `Cursor: X=${mm.x.toFixed(2)}mm  Y=${mm.y.toFixed(2)}mm`;
  });

  stage.on("mouseup", () => { isPanning = false; panStart = null; });

  host.addEventListener("wheel", (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    const delta = -ev.deltaY;
    const step = delta > 0 ? 10 : -10;
    setZoom(clamp(25, 400, zoomPct + step));
  }, { passive: false });

  window.addEventListener("resize", () => {
    const r = host.getBoundingClientRect();
    stage.size({ width: r.width, height: r.height });
    stage.batchDraw();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") isSpaceDown = true;
    if (e.key === "Delete") deleteSelected();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { isSpaceDown = false; isPanning = false; } });

  // Transformer transformend => apply resize to internal geometry
  transformer.on("transformend", () => {
    if (!state.selectedName) return;
    const f = state.fieldByName.get(state.selectedName);
    if (!f || !f._konva) return;

    pushHistory();

    const g = f._konva;
    const rect = g.findOne("Rect");
    if (!rect) return;

    const scaleX = g.scaleX();
    const scaleY = g.scaleY();

    const newW = Math.max(5, rect.width() * scaleX);
    const newH = Math.max(5, rect.height() * scaleY);

    g.scaleX(1); g.scaleY(1);
    rect.width(newW); rect.height(newH);

    const label = g.findOne("Text");
    if (label) {
      label.width(Math.max(0, newW - 12));
      label.height(Math.max(0, newH - 8));
    }

    const geomNew = pxGeomToInternal(g.x(), g.y(), newW, newH);
    f.geom.x = geomNew.x; f.geom.y = geomNew.y; f.geom.w = geomNew.w; f.geom.h = geomNew.h;

    renderAll();
  });
}

// ---------- UI init ----------
function initUI() {
  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("tab--active"));
      btn.classList.add("tab--active");
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

  $("btnSave").addEventListener("click", () => downloadCiff());

  elZoomRange.addEventListener("input", () => setZoom(parseInt(elZoomRange.value, 10)));
  $("zoomIn").addEventListener("click", () => setZoom(clamp(25, 400, zoomPct + 10)));
  $("zoomOut").addEventListener("click", () => setZoom(clamp(25, 400, zoomPct - 10)));

  elToggleGrid.addEventListener("change", () => renderGrid());
  elToggleSnap.addEventListener("change", () => {/* used during drag */});

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
    $("btnShowHiddenOnCanvas").textContent = state.showHiddenOnCanvas ? "Скрывать" : "Показывать";
    renderAll();
  });

  $("addOffset").addEventListener("click", () => {
    if (!state.xmlDoc) return;
    pushHistory();
    const name = uniqueName("offset", state.dateOffsets.map(o => o.name));
    state.dateOffsets.push({
      name,
      default: { y: 0, m: 0, d: 0 },
      current: null
    });
    state.dateOffsetsLoaded = true;
    state.dateOffsetsDirty = true;
    renderOffsetsEditor();
  });

  $("btnUndo").addEventListener("click", undo);
  $("btnRedo").addEventListener("click", redo);

  elStatusLeft.textContent = "Открой CIFF файл (.ciff/.xml).";
  elStatusRight.textContent = "—";
}

function setZoom(pct) {
  zoomPct = pct;
  elZoomRange.value = String(pct);
  elZoomLabel.textContent = `${pct}%`;

  renderGrid();
  renderObjects();
  renderUI();
}

function mmToPx(mm) { return mm * (MM_TO_PX_BASE * (zoomPct / 100)); }
function pxToMm(px) { return px / (MM_TO_PX_BASE * (zoomPct / 100)); }
function internalToMm(v) { return v / INTERNAL_PER_MM; }
function mmToInternal(mm) { return Math.round(mm * INTERNAL_PER_MM); }

function pxToMmWorld(px, py) {
  const x = pxToMm(px - stage.x());
  const y = pxToMm(py - stage.y());
  return { x, y };
}

function getCanvasInternalWidth() {
  return state.subImage.maxWidth || state.subImage.width || 0;
}

function getCanvasInternalHeight() {
  return state.subImage.maxHeight || state.subImage.height || 0;
}

// ---------- File read ----------
async function readFileSmart(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const hasUtf16leBom = u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE;
  const hasUtf16beBom = u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF;

  if (hasUtf16leBom) return new TextDecoder("utf-16le").decode(buf);
  if (hasUtf16beBom) return new TextDecoder("utf-16be").decode(buf);

  let zeros = 0;
  for (let i = 1; i < Math.min(u8.length, 2000); i += 2) if (u8[i] === 0) zeros++;
  if (zeros > 50) return new TextDecoder("utf-16le").decode(buf);

  return new TextDecoder("utf-8").decode(buf);
}

// ---------- XML load / parse ----------
function loadXml(xmlText) {
  // keep original line ending for diagnostics, but we will OUTPUT CRLF always
  const hasCRLF = /\r\n/.test(xmlText);
  state.lineEnding = "\r\n";

  // split to 2 lines in a robust way
  const { line1, line2 } = splitTwoLines(xmlText);
  state.line1 = line1;
  state.line2 = line2;
  state.xmlText = line1 + "\n" + line2; // internal store (we'll output CRLF later)

  const parser = new DOMParser();
  const doc = parser.parseFromString(line1 + "\n" + line2, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    alert("Ошибка парсинга XML: " + parseError.textContent.slice(0, 200));
    return;
  }

  state.xmlDoc = doc;

  parseHeader(doc);
  parseSubHeader(doc);
  parseFields(doc);

  pushHistory(true);

  stage.position({ x: 20, y: 20 });
  setZoom(100);

  renderAll();

  elStatusLeft.textContent =
    `Loaded: ${state.docMeta.designedFor} • Workspace: ${internalToMm(getCanvasInternalWidth()).toFixed(2)}×${internalToMm(getCanvasInternalHeight()).toFixed(2)}mm • Image: ${internalToMm(state.subImage.width).toFixed(2)}×${internalToMm(state.subImage.height).toFixed(2)}mm` +
    ` • InputEOL=${hasCRLF ? "CRLF" : "LF"}`;
}

function parseHeader(doc) {
  const root = doc.querySelector("ImageDesign");
  state.docMeta.version = root?.getAttribute("Version") ?? null;

  const header = doc.querySelector("ImageDesign > Header");
  state.docMeta.designedFor = header?.getAttribute("DesignedFor") ?? "";
  state.docMeta.clStVersionInfo = header?.querySelector("ClStVersionInfo")?.textContent ?? "";

  state.dateOffsets = [];
  header?.querySelectorAll("DateOffset").forEach(node => {
    const name = node.getAttribute("Name") || "";
    const def = node.querySelector("DefaultOffset");
    const cur = node.querySelector("CurrentOffset");

    state.dateOffsets.push({
      name,
      default: {
        y: toInt(def?.querySelector("Year")?.textContent, 0),
        m: toInt(def?.querySelector("Month")?.textContent, 0),
        d: toInt(def?.querySelector("Day")?.textContent, 0)
      },
      current: cur ? {
        y: toInt(cur.querySelector("Year")?.textContent, 0),
        m: toInt(cur.querySelector("Month")?.textContent, 0),
        d: toInt(cur.querySelector("Day")?.textContent, 0)
      } : null
    });
  });

  state.dateOffsetsLoaded = state.dateOffsets.length > 0;
  state.dateOffsetsDirty = false;
}

function parseSubHeader(doc) {
  const sub = doc.querySelector("SubImage");
  const sh = sub?.querySelector("SubHeader");

  state.subImage.imageReference = sub?.getAttribute("ImageReference") ?? "1";
  state.subImage.width = toInt(sh?.querySelector("ImageWidth")?.textContent, 0);
  state.subImage.height = toInt(sh?.querySelector("ImageHeight")?.textContent, 0);
  state.subImage.maxWidth = toInt(sh?.querySelector("MaxImageWidth")?.textContent, 0);
  state.subImage.maxHeight = toInt(sh?.querySelector("MaxImageHeight")?.textContent, 0);
  state.subImage.xRes = toFloat(sh?.querySelector("XRes")?.textContent, 0.12);
  state.subImage.orientation = toInt(sh?.querySelector("CurrentOrientation")?.textContent, 0);

  if (!state.subImage.width) state.subImage.width = state.subImage.maxWidth;
  if (!state.subImage.height) state.subImage.height = state.subImage.maxHeight;
}

function parseFields(doc) {
  state.fields = [];
  state.fieldByName = new Map();

  const sub = doc.querySelector("SubImage");
  const fieldNodes = [...(sub?.querySelectorAll(":scope > Field") ?? [])];

  fieldNodes.forEach(node => {
    const f = parseFieldNode(node);
    state.fields.push(f);
    state.fieldByName.set(f.name, f);
  });
}

function parseFieldNode(node) {
  const name = node.getAttribute("Name") || "";
  const fldType = node.querySelector("FldType")?.textContent || "FixedText";

  const displayedNode = node.querySelector("Displayed");
  const printed = !(displayedNode && displayedNode.textContent.trim() === "0");

  const geom = {
    x: toInt(node.querySelector("X")?.textContent, 0),
    y: toInt(node.querySelector("Y")?.textContent, 0),
    w: toInt(node.querySelector("W")?.textContent, 0),
    h: toInt(node.querySelector("H")?.textContent, 0)
  };

  const calcData = node.querySelector("CalcData")?.textContent ?? "";
  const ln = toInt(node.querySelector("Ln")?.textContent, 1);
  const orientation = normalizeOrientation(node.querySelector("Orientation")?.textContent);

  const objNode = node.querySelector("Data > Object");
  const dataType = toInt(objNode?.querySelector("DataType")?.textContent, null);
  const defVal = objNode?.querySelector("Default")?.textContent ?? "";
  const maxChars = objNode?.querySelector("MaxNoOfChars") ? toInt(objNode.querySelector("MaxNoOfChars")?.textContent, null) : null;
  const fixedLen = !!objNode?.querySelector("FixedLen");
  const staticAttr = objNode?.getAttribute("Static") ?? null;
  const parseAttr = objNode?.getAttribute("Parse") ?? null;
  const userEnter = objNode?.querySelector("VarText > UserEnterData")?.textContent ?? "";
  const mask = objNode?.querySelector("VarText > Mask")?.textContent ?? "";

  const pitch = node.querySelector("Text > Font > Pitch") ? toInt(node.querySelector("Text > Font > Pitch")?.textContent, null) : null;
  const xMag = node.querySelector("Text > Font > XMag") ? toInt(node.querySelector("Text > Font > XMag")?.textContent, null) : null;

  const clsid = node.querySelector("CLSID")?.textContent ?? "";
  const quietMargin = node.querySelector("Barcode > QuietMargin") ? toInt(node.querySelector("Barcode > QuietMargin")?.textContent, 0) : null;
  const bcH = node.querySelector("Barcode > BcH") ? toInt(node.querySelector("Barcode > BcH")?.textContent, null) : null;

  const dmNode = node.querySelector("Barcode > DataMatrix");
  const dm = dmNode ? {
    moduleSize: dmNode.querySelector("ModuleSize") ? toInt(dmNode.querySelector("ModuleSize")?.textContent, null) : null,
    symbolSize: dmNode.querySelector("SymbolSize")?.textContent ?? "22X22",
    segments: parseDataMatrixSegments(node)
  } : null;

  const offsetRef = objNode?.querySelector("OffsetDate")?.getAttribute("SrcOffset") ?? null;

  const cntNoChars = objNode?.querySelector("CounterText > SubCnt > NoOfChars")
    ? toInt(objNode.querySelector("CounterText > SubCnt > NoOfChars")?.textContent, null)
    : null;
  const cntSignificance = objNode?.querySelector("CounterText > SubCnt")
    ? toInt(objNode.querySelector("CounterText > SubCnt")?.getAttribute("Significance"), null)
    : null;

  return {
    name,
    fldType,
    printed,
    geom,
    ln,
    orientation,
    calcData,

    data: {
      dataType,
      defaultValue: defVal,
      maxChars,
      fixedLen,
      staticAttr,
      parseAttr,
      userEnterData: userEnter,
      mask,
      offsetRef,
      counter: { noOfChars: cntNoChars, significance: cntSignificance }
    },

    text: { pitch, xMag },
    barcode: dm ? { clsid, quietMargin, bcH, dataMatrix: dm } : null,

    _konva: null
  };
}

function parseDataMatrixSegments(fieldNode) {
  const objects = [...fieldNode.querySelectorAll("Data > Object")];
  const segs = [];
  objects.forEach((o, i) => {
    const idxAttr = o.getAttribute("Index");
    const idx = idxAttr != null ? toInt(idxAttr, i) : i;
    const src = o.querySelector("SrcField")?.getAttribute("SrcFieldName") ?? null;
    const defVal = o.querySelector("Default")?.textContent ?? "";
    const dataType = toInt(o.querySelector("DataType")?.textContent, 5);
    segs.push({ index: idx, srcField: src, defaultValue: defVal, dataType });
  });
  segs.sort((a,b) => a.index - b.index);
  segs.forEach((s, j) => s.index = j);
  return segs;
}

// ---------- Rendering ----------
function renderAll() {
  renderGrid();
  renderObjects();
  renderFieldLists();
  renderSelectionPanels();
  renderHiddenEditor();
  renderOffsetsEditor();
  renderUI();
}

function renderGrid() {
  gridLayer.destroyChildren();
  if (!state.xmlDoc || !elToggleGrid.checked) { gridLayer.draw(); return; }

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

  const stepPx = mmToPx(GRID_MM);
  const finePx = mmToPx(GRID_MM / 2);

  for (let x = 0; x <= wPx; x += finePx) gridLayer.add(new Konva.Line({ points:[x,0,x,hPx], stroke:"rgba(0,0,0,0.05)", strokeWidth:1 }));
  for (let y = 0; y <= hPx; y += finePx) gridLayer.add(new Konva.Line({ points:[0,y,wPx,y], stroke:"rgba(0,0,0,0.05)", strokeWidth:1 }));

  for (let x = 0; x <= wPx; x += stepPx) gridLayer.add(new Konva.Line({ points:[x,0,x,hPx], stroke:"rgba(0,0,0,0.10)", strokeWidth:1 }));
  for (let y = 0; y <= hPx; y += stepPx) gridLayer.add(new Konva.Line({ points:[0,y,wPx,y], stroke:"rgba(0,0,0,0.10)", strokeWidth:1 }));

  gridLayer.draw();
}

function renderObjects() {
  objLayer.destroyChildren();
  if (!state.xmlDoc) { objLayer.draw(); return; }

  const visible = state.fields.filter(f => f.printed || state.showHiddenOnCanvas);
  visible.forEach(f => {
    const g = makeFieldGroup(f);
    f._konva = g;
    objLayer.add(g);
  });

  objLayer.draw();
}

function makeFieldGroup(field) {
  const { x, y, w, h } = field.geom;
  const xPx = mmToPx(internalToMm(x));
  const yPx = mmToPx(internalToMm(y));
  const wPx = mmToPx(internalToMm(w));
  const hPx = mmToPx(internalToMm(h));

  const isDM = field.fldType === "Barcode" && field.barcode?.dataMatrix;
  const isHidden = !field.printed;

  const group = new Konva.Group({ x: xPx, y: yPx, draggable: true, name: field.name });
  const content = new Konva.Group();

  const rect = new Konva.Rect({
    width: wPx,
    height: hPx,
    fill: isDM ? "rgba(30,30,30,0.92)" : (isHidden ? "rgba(106,168,255,0.10)" : "rgba(0,0,0,0.001)"),
    stroke: isHidden ? "rgba(106,168,255,0.5)" : "rgba(0,0,0,0)",
    strokeWidth: isHidden ? 1 : 0
  });

  const label = new Konva.Text({
    x: 6, y: 4,
    width: Math.max(0, wPx - 12),
    height: Math.max(0, hPx - 8),
    text: makePreviewText(field),
    fontSize: 12,
    fill: isDM ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.72)",
    ellipsis: true
  });

  content.add(rect);
  content.add(label);
  applyFieldOrientation(content, wPx, hPx, field.orientation);

  group.add(content);

  group.on("click", (e) => { e.cancelBubble = true; selectField(field.name); renderUI(); });

  group.on("dragmove", () => {
    if (!elToggleSnap.checked) return;
    const snapped = snapPoint(group.x(), group.y());
    group.position(snapped);
  });

  group.on("dragend", () => {
    pushHistory();
    const geomNew = pxGeomToInternal(group.x(), group.y(), rect.width(), rect.height());
    field.geom.x = geomNew.x;
    field.geom.y = geomNew.y;
    renderFieldLists();
    renderSelectionPanels();
  });

  return group;
}

function makePreviewText(field) {
  const t = field.fldType;
  if (t === "Barcode" && field.barcode?.dataMatrix) {
    return `DataMatrix ${field.barcode.dataMatrix.symbolSize || "DM"}`;
  }
  if (t === "TimeText") return field.calcData || field.data.defaultValue || "";
  if (t === "DateText" || t === "OffsetDateText") return field.calcData || field.data.defaultValue || "";
  if (t === "CounterText") return field.calcData || field.data.defaultValue || "";
  return field.calcData || field.data.userEnterData || field.data.defaultValue || "";
}

function renderUI() {
  transformer.nodes([]);
  if (state.selectedName) {
    const f = state.fieldByName.get(state.selectedName);
    if (f?._konva) transformer.nodes([f._konva]);
  }
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
  const div = document.createElement("div");
  div.className = "listItem" + (state.selectedName === field.name ? " listItem--active" : "");
  div.innerHTML = `
    <div>
      <div style="font-weight:700">${escapeHtml(field.name)}</div>
      <div class="muted">${escapeHtml(field.fldType)}</div>
    </div>
    <div class="badge">${field.printed ? "Printed" : "Hidden"}</div>
  `;
  div.addEventListener("click", () => {
    selectField(field.name);
    centerOnField(field);
    renderAll();
  });
  return div;
}

function centerOnField(field) {
  if (!field?._konva) return;
  const g = field._konva;
  const r = g.getClientRect({ relativeTo: objLayer });
  const host = $("canvasHost").getBoundingClientRect();
  const cx = (host.width / 2) - (r.x + r.width / 2) - stage.x();
  const cy = (host.height / 2) - (r.y + r.height / 2) - stage.y();
  stage.position({ x: stage.x() + cx, y: stage.y() + cy });
  stage.batchDraw();
}

function renderSelectionPanels() {
  const f = state.selectedName ? state.fieldByName.get(state.selectedName) : null;

  if (!f) {
    elPropsEmpty.classList.remove("hidden");
    elPropsPanel.classList.add("hidden");
    elBtnDelete.disabled = true;

    elDmEmpty.classList.remove("hidden");
    elDmPanel.classList.add("hidden");
    return;
  }

  elBtnDelete.disabled = false;

  elPropsEmpty.classList.add("hidden");
  elPropsPanel.classList.remove("hidden");
  elPropsPanel.innerHTML = "";

  elPropsPanel.appendChild(buildCommonProps(f));
  elPropsPanel.appendChild(document.createElement("div")).className = "hr";

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
    `Selected: ${f.name} • ${f.fldType} • X=${internalToMm(f.geom.x).toFixed(2)} ` +
    `Y=${internalToMm(f.geom.y).toFixed(2)} W=${internalToMm(f.geom.w).toFixed(2)} ` +
    `H=${internalToMm(f.geom.h).toFixed(2)} (mm)`;
}

// ---------- Properties builders ----------
function buildCommonProps(f) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  wrap.appendChild(fieldRow("Name", inputText(f.name, () => {}, { disabled: true })));
  wrap.appendChild(fieldRow("Type", inputText(f.fldType, () => {}, { disabled: true })));
  wrap.appendChild(fieldRow("Printed", inputCheckbox(f.printed, (v) => { pushHistory(); f.printed = v; renderAll(); })));

  wrap.appendChild(fieldRow("X (mm)", inputNumber(internalToMm(f.geom.x), (v) => { pushHistory(); f.geom.x = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("Y (mm)", inputNumber(internalToMm(f.geom.y), (v) => { pushHistory(); f.geom.y = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("W (mm)", inputNumber(internalToMm(f.geom.w), (v) => { pushHistory(); f.geom.w = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("H (mm)", inputNumber(internalToMm(f.geom.h), (v) => { pushHistory(); f.geom.h = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("Orientation", selectOrientation(f.orientation, (v) => {
    pushHistory();
    f.orientation = v;
    renderObjects();
    renderUI();
  })));

  return wrap;
}

function buildTextLikeProps(f) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  // IMPORTANT: We do NOT auto-create VarText/FixedLen/etc in lossless save.
  // UI can still edit stored values; they will patch only if node exists in that field block.

  const isVar = (f.data.staticAttr === "0") && (f.data.userEnterData !== "" || f.data.mask !== "");
  const displayValue = (f.data.userEnterData || f.data.defaultValue || f.calcData || "");

  wrap.appendChild(fieldRow("Value", inputText(displayValue, (v) => {
    pushHistory();
    // store in both places for preview; patcher will apply safely (only if tags exist)
    f.data.userEnterData = v;
    f.data.defaultValue = f.data.defaultValue || v;
    f.calcData = v;
    renderObjects(); renderUI(); renderSelectionPanels();
  })));

  if (f.fldType === "DateText" || f.fldType === "TimeText" || f.fldType === "OffsetDateText") {
    wrap.appendChild(fieldRow("Format (Default)", inputText(f.data.defaultValue || "", (v) => {
      pushHistory();
      f.data.defaultValue = v;
    })));
    if (f.fldType === "OffsetDateText") {
      wrap.appendChild(fieldRow("SrcOffset", selectOffsetName(f.data.offsetRef, (v) => {
        pushHistory();
        f.data.offsetRef = v || null;
      })));
    }
  }

  if (f.fldType === "CounterText") {
    wrap.appendChild(fieldRow("NoOfChars", inputNumber(f.data.counter.noOfChars ?? 4, (v) => {
      pushHistory();
      f.data.counter.noOfChars = Math.max(1, Math.round(v));
    })));
  }

  wrap.appendChild(fieldRow("Font Pitch", inputNumber(f.text.pitch ?? 10, (v) => {
    pushHistory();
    f.text.pitch = Math.max(1, Math.round(v));
  })));

  wrap.appendChild(fieldRow("XMag (%)", inputNumber(f.text.xMag ?? 100, (v) => {
    pushHistory();
    f.text.xMag = Math.max(1, Math.round(v));
  })));

  return wrap;
}

function buildBarcodeProps(f) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  wrap.appendChild(fieldRow("QuietMargin", inputNumber(f.barcode.quietMargin ?? 0, (v) => {
    pushHistory();
    f.barcode.quietMargin = Math.max(0, Math.round(v));
  })));

  wrap.appendChild(fieldRow("SymbolSize", selectSymbolSize(f.barcode.dataMatrix.symbolSize, (v) => {
    pushHistory();
    f.barcode.dataMatrix.symbolSize = v;
    renderObjects(); renderUI(); renderSelectionPanels();
  })));

  wrap.appendChild(fieldRow("ModuleSize", inputNumber(f.barcode.dataMatrix.moduleSize ?? 50, (v) => {
    pushHistory();
    f.barcode.dataMatrix.moduleSize = Math.max(1, Math.round(v));
  })));

  return wrap;
}

function buildDataMatrixPanel(f) {
  const dm = f.barcode.dataMatrix;
  const wrap = document.createElement("div");
  wrap.className = "form";

  const profileRow = document.createElement("div");
  profileRow.className = "fieldRow";
  profileRow.innerHTML = `<label>Profile</label>`;
  const profileSelect = document.createElement("select");
  profileSelect.innerHTML = `
    <option value="">(none)</option>
    <option value="22X22">22X22</option>
    <option value="36X36">36X36</option>
  `;
  profileRow.appendChild(profileSelect);
  wrap.appendChild(profileRow);

  const applyBtn = document.createElement("button");
  applyBtn.className = "btn btn--small";
  applyBtn.textContent = "Применить профиль";
  applyBtn.addEventListener("click", () => {
    const p = profileSelect.value;
    if (!p) return;
    pushHistory();
    applyDmProfile(f, p);
    renderAll();
  });
  wrap.appendChild(applyBtn);

  const val = validateDmProfile(f, dm.symbolSize);
  const vcard = document.createElement("div");
  vcard.className = "card";
  vcard.innerHTML = `<div class="card__head"><div class="card__title">Validation</div><div class="pill">${val.length ? "⚠" : "OK"}</div></div>`;
  const vbody = document.createElement("div");
  vbody.className = "muted";
  vbody.style.whiteSpace = "pre-wrap";
  vbody.textContent = val.length ? val.map(x => "• " + x).join("\n") : "Профиль удовлетворён (по текущему SymbolSize).";
  vcard.appendChild(vbody);
  wrap.appendChild(vcard);

  // segments
  const segCard = document.createElement("div");
  segCard.className = "card";
  segCard.innerHTML = `<div class="card__head">
    <div class="card__title">Segments</div>
    <div class="smallRow"><button class="btn btn--ghost btn--small" id="segAdd">+ segment</button></div>
  </div>`;
  const segWrap = document.createElement("div");
  segWrap.style.display = "flex";
  segWrap.style.flexDirection = "column";
  segWrap.style.gap = "8px";

  dm.segments.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "card";
    row.style.padding = "8px";
    row.innerHTML = `
      <div class="card__head" style="margin-bottom:6px">
        <div class="card__title">#${idx}</div>
        <div class="smallRow">
          <button class="btn btn--ghost btn--small" data-act="up">↑</button>
          <button class="btn btn--ghost btn--small" data-act="down">↓</button>
          <button class="btn btn--danger btn--small" data-act="del">Удалить</button>
        </div>
      </div>
    `;

    const grid = document.createElement("div");
    grid.className = "card__grid";

    const srcSel = document.createElement("select");
    srcSel.innerHTML = `<option value="">(none)</option>` + state.fields.map(ff =>
      `<option value="${escapeHtmlAttr(ff.name)}"${ff.name === s.srcField ? " selected" : ""}>${escapeHtml(ff.name)}</option>`
    ).join("");
    srcSel.addEventListener("change", () => { pushHistory(); s.srcField = srcSel.value || null; });

    const defInp = document.createElement("input");
    defInp.className = "input";
    defInp.value = s.defaultValue || "";
    defInp.addEventListener("change", () => { pushHistory(); s.defaultValue = defInp.value; });

    grid.appendChild(labeledMini("SrcFieldName", srcSel));
    grid.appendChild(labeledMini("Default", defInp));
    row.appendChild(grid);

    row.querySelectorAll("button[data-act]").forEach(b => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        pushHistory();
        if (act === "del") dm.segments.splice(idx, 1);
        if (act === "up" && idx > 0) [dm.segments[idx-1], dm.segments[idx]] = [dm.segments[idx], dm.segments[idx-1]];
        if (act === "down" && idx < dm.segments.length - 1) [dm.segments[idx+1], dm.segments[idx]] = [dm.segments[idx], dm.segments[idx+1]];
        normalizeDmSegments(dm);
        renderSelectionPanels();
      });
    });

    segWrap.appendChild(row);
  });

  segCard.appendChild(segWrap);
  wrap.appendChild(segCard);

  segCard.querySelector("#segAdd").addEventListener("click", () => {
    pushHistory();
    dm.segments.push({ index: dm.segments.length, srcField: null, defaultValue: "", dataType: 5 });
    normalizeDmSegments(dm);
    renderSelectionPanels();
  });

  return wrap;
}

function renderHiddenEditor() {
  if (!state.xmlDoc) { elHiddenEditor.innerHTML = ""; return; }

  const hidden = state.fields.filter(f => !f.printed);
  elHiddenEditor.innerHTML = "";

  hidden.forEach(f => {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card__head";
    head.innerHTML = `<div>
        <div class="card__title">${escapeHtml(f.name)}</div>
        <div class="card__meta">${escapeHtml(f.fldType)} • Displayed=0</div>
      </div>
      <div class="smallRow">
        <button class="btn btn--ghost btn--small">Select</button>
      </div>`;
    head.querySelector("button").addEventListener("click", () => { selectField(f.name); renderAll(); });

    const grid = document.createElement("div");
    grid.className = "card__grid";

    const inpVal = document.createElement("input");
    inpVal.className = "input";
    inpVal.value = f.data.userEnterData || f.data.defaultValue || f.calcData || "";
    inpVal.addEventListener("change", () => {
      pushHistory();
      f.data.userEnterData = inpVal.value;
      f.calcData = inpVal.value;
    });

    const inpMask = document.createElement("input");
    inpMask.className = "input";
    inpMask.value = f.data.mask || "";
    inpMask.addEventListener("change", () => { pushHistory(); f.data.mask = inpMask.value; });

    grid.appendChild(labeledMini("Value", inpVal));
    grid.appendChild(labeledMini("Mask", inpMask));

    card.appendChild(head);
    card.appendChild(grid);
    elHiddenEditor.appendChild(card);
  });
}

function renderOffsetsEditor() {
  if (!state.xmlDoc) { elOffsetsEditor.innerHTML = ""; return; }
  elOffsetsEditor.innerHTML = "";

  if (!state.dateOffsetsLoaded && state.dateOffsets.length === 0) {
    const note = document.createElement("div");
    note.className = "muted";
    note.textContent = "В файле нет DateOffset (или не распарсились).";
    elOffsetsEditor.appendChild(note);
    return;
  }

  state.dateOffsets.forEach((o, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="card__head">
        <div>
          <div class="card__title">${escapeHtml(o.name)}</div>
          <div class="card__meta">DefaultOffset (Y/M/D)</div>
        </div>
        <div class="smallRow">
          <button class="btn btn--danger btn--small">Удалить</button>
        </div>
      </div>
    `;

    const delBtn = card.querySelector("button");
    delBtn.addEventListener("click", () => {
      pushHistory();
      state.dateOffsets.splice(idx, 1);
      state.dateOffsetsDirty = true;
      renderOffsetsEditor();
      renderSelectionPanels();
    });

    const grid = document.createElement("div");
    grid.className = "card__grid";

    const inY = mkNum(o.default.y ?? 0, (v) => { pushHistory(); o.default.y = Math.round(v); state.dateOffsetsDirty = true; });
    const inM = mkNum(o.default.m ?? 0, (v) => { pushHistory(); o.default.m = Math.round(v); state.dateOffsetsDirty = true; });
    const inD = mkNum(o.default.d ?? 0, (v) => { pushHistory(); o.default.d = Math.round(v); state.dateOffsetsDirty = true; });

    grid.appendChild(labeledMini("Year", inY));
    grid.appendChild(labeledMini("Month", inM));
    grid.appendChild(labeledMini("Day", inD));

    card.appendChild(grid);

    if (o.current) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = `CurrentOffset: ${pad2(o.current.d)}.${pad2(o.current.m)}.${String(o.current.y)}`;
      card.appendChild(note);
    }

    elOffsetsEditor.appendChild(card);
  });
}

// ---------- Selection / ops ----------
function selectField(name) {
  state.selectedName = name;
  renderSelectionPanels();
}

function deleteSelected() {
  const name = state.selectedName;
  if (!name) return;
  const f = state.fieldByName.get(name);
  if (!f) return;

  pushHistory();

  state.fields = state.fields.filter(x => x.name !== name);
  state.fieldByName.delete(name);

  // clear references in DM segments
  state.fields.forEach(ff => {
    const dm = ff.barcode?.dataMatrix;
    if (!dm) return;
    dm.segments.forEach(s => { if (s.srcField === name) s.srcField = null; });
  });

  state.selectedName = null;
  renderAll();
}

function addField(fldType) {
  if (!state.xmlDoc) { alert("Сначала открой CIFF файл."); return; }

  pushHistory();

  const existingNames = state.fields.map(f => f.name);
  const base = fldType === "Barcode" ? "FieldDM" : "Field";
  const name = uniqueName(base, existingNames);

  const geom = { x: mmToInternal(2), y: mmToInternal(2), w: mmToInternal(12), h: mmToInternal(4) };
  if (fldType === "Barcode") { geom.w = mmToInternal(12); geom.h = mmToInternal(12); }

  const field = {
    name,
    fldType,
    printed: true,
    geom,
    ln: 1,
    orientation: 0,
    calcData: "",
    data: {
      dataType: guessDataType(fldType),
      defaultValue: "",
      maxChars: null,
      fixedLen: false,
      staticAttr: "0",
      parseAttr: (fldType === "DateText" || fldType === "TimeText" || fldType === "OffsetDateText") ? "1" : null,
      userEnterData: "",
      mask: "",
      offsetRef: (fldType === "OffsetDateText" ? (state.dateOffsets[0]?.name ?? null) : null),
      counter: { noOfChars: (fldType === "CounterText" ? 4 : null), significance: 0 }
    },
    text: { pitch: 10, xMag: 100 },
    barcode: null,
    _konva: null
  };

  if (fldType === "FixedText") { field.calcData = "TEXT"; field.data.defaultValue = "TEXT"; }
  if (fldType === "DateText") { field.data.defaultValue = "dd'.'MM'.'yy"; }
  if (fldType === "OffsetDateText") { field.data.defaultValue = "dd'.'MM'.'yy"; }
  if (fldType === "TimeText") { field.data.defaultValue = "HH':'mm"; }
  if (fldType === "CounterText") { field.data.defaultValue = "0000"; field.calcData = "0000"; }

  if (fldType === "Barcode") {
    field.barcode = {
      clsid: "{7A4AA4CF-F5CD-11D4-8DAE-0050DAFE8A9F}",
      quietMargin: 0,
      bcH: field.geom.h,
      dataMatrix: { moduleSize: 50, symbolSize: "22X22", segments: [] }
    };
    applyDmProfile(field, "22X22");
  }

  state.fields.push(field);
  state.fieldByName.set(field.name, field);

  selectField(field.name);
  renderAll();
}

// ---------- DM profile apply/validate ----------
function applyDmProfile(dmField, profileName) {
  const profile = DM_PROFILES[profileName];
  if (!profile) return;
  const dm = dmField.barcode?.dataMatrix;
  if (!dm) return;

  dm.symbolSize = profile.symbolSize;

  if (profile.disallowedFields?.length) dm.segments = dm.segments.filter(s => !profile.disallowedFields.includes(s.srcField));

  profile.requiredSegments.forEach((fname) => ensureFieldExists(fname, profile.fixedFields?.[fname] ?? null));

  const newSegs = [];
  profile.requiredSegments.forEach((fname, idx) => {
    const existing = dm.segments.find(s => s.srcField === fname);
    newSegs.push(existing ? { ...existing } : {
      index: idx,
      srcField: fname,
      defaultValue: state.fieldByName.get(fname)?.data.defaultValue ?? "",
      dataType: 5
    });
  });

  dm.segments = newSegs;
  normalizeDmSegments(dm);

  if (profile.fixedFields) {
    Object.entries(profile.fixedFields).forEach(([fname, value]) => {
      const f = state.fieldByName.get(fname);
      if (!f) return;
      f.printed = false;
      f.fldType = "FixedText";
      f.data.dataType = 0;
      f.data.defaultValue = value;
      f.data.userEnterData = "";
      f.calcData = value;
    });
  }
}

function validateDmProfile(dmField, symbolSize) {
  const p = DM_PROFILES[symbolSize];
  if (!p) return [];
  const dm = dmField.barcode?.dataMatrix;
  if (!dm) return ["No DataMatrix node."];

  const errors = [];
  for (const s of p.requiredSegments) if (!dm.segments.find(x => x.srcField === s)) errors.push(`Missing segment SrcFieldName="${s}"`);
  if (p.disallowedFields) for (const s of p.disallowedFields) if (dm.segments.find(x => x.srcField === s)) errors.push(`Disallowed segment "${s}" for ${p.symbolSize}`);
  if (p.fixedFields) {
    for (const [fname, value] of Object.entries(p.fixedFields)) {
      const f = state.fieldByName.get(fname);
      if (!f) { errors.push(`Missing fixed field "${fname}"`); continue; }
      if ((f.data.defaultValue ?? "") !== value) errors.push(`Field "${fname}" must be "${value}", got "${f.data.defaultValue ?? ""}"`);
    }
  }
  return errors;
}

function ensureFieldExists(name, fixedValueOrNull) {
  if (state.fieldByName.has(name)) return;

  const geom = { x: mmToInternal(70), y: mmToInternal(70), w: mmToInternal(10), h: mmToInternal(3) };
  const f = {
    name,
    fldType: "FixedText",
    printed: false,
    geom,
    ln: 1,
    orientation: 0,
    calcData: fixedValueOrNull ?? "",
    data: {
      dataType: 0,
      defaultValue: fixedValueOrNull ?? "",
      maxChars: fixedValueOrNull ? fixedValueOrNull.length : null,
      fixedLen: false,
      staticAttr: fixedValueOrNull ? null : "0",
      parseAttr: null,
      userEnterData: "",
      mask: "",
      offsetRef: null,
      counter: { noOfChars: null, significance: 0 }
    },
    text: { pitch: 8, xMag: 100 },
    barcode: null,
    _konva: null
  };

  state.fields.push(f);
  state.fieldByName.set(name, f);
}

function normalizeDmSegments(dm) {
  dm.segments = dm.segments.filter(Boolean);
  dm.segments.forEach((s, i) => s.index = i);
}

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

// ---------- Inputs ----------
function fieldRow(label, inputEl) {
  const row = document.createElement("div");
  row.className = "fieldRow";
  const lab = document.createElement("label");
  lab.textContent = label;
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
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    if (!el.classList.contains("input") && el.tagName !== "SELECT") el.classList.add("input");
    if (el.tagName === "SELECT") el.classList.add("input");
  }
  wrap.appendChild(el);
  return wrap;
}
function inputText(value, onChange, opts = {}) {
  const inp = document.createElement("input");
  inp.className = "input";
  inp.value = value ?? "";
  if (opts.disabled) inp.disabled = true;
  inp.addEventListener("change", () => onChange(inp.value));
  return inp;
}
function inputNumber(value, onChange) {
  const inp = document.createElement("input");
  inp.className = "input";
  inp.type = "number";
  inp.step = "0.01";
  inp.value = (value ?? 0);
  inp.addEventListener("change", () => onChange(Number(inp.value)));
  return inp;
}
function mkNum(value, onChange) {
  const inp = document.createElement("input");
  inp.className = "input";
  inp.type = "number";
  inp.step = "1";
  inp.value = String(value ?? 0);
  inp.addEventListener("change", () => onChange(Number(inp.value)));
  return inp;
}
function inputCheckbox(value, onChange) {
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.checked = !!value;
  inp.addEventListener("change", () => onChange(inp.checked));
  return inp;
}
function selectSymbolSize(value, onChange) {
  const sel = document.createElement("select");
  const sizes = ["22X22", "36X36", "Auto"];
  sel.innerHTML = sizes.map(s => `<option value="${s}"${s === value ? " selected" : ""}>${s}</option>`).join("");
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}
function selectOffsetName(value, onChange) {
  const sel = document.createElement("select");
  const opts = state.dateOffsets.map(o => o.name);
  sel.innerHTML = `<option value="">(none)</option>` + opts.map(n => `<option value="${escapeHtmlAttr(n)}"${n === value ? " selected" : ""}>${escapeHtml(n)}</option>`).join("");
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

// ---------- Undo/Redo ----------
function pushHistory(initial = false) {
  const snap = snapshotState();
  if (!initial) history.undo.push(snap);
  else { history.undo = [snap]; history.redo = []; }
  history.redo = [];
  updateUndoRedoButtons();
}

function snapshotState() {
  return JSON.stringify({
    docMeta: state.docMeta,
    subImage: state.subImage,
    dateOffsets: state.dateOffsets,
    dateOffsetsLoaded: state.dateOffsetsLoaded,
    dateOffsetsDirty: state.dateOffsetsDirty,
    fields: state.fields.map(f => ({
      name: f.name,
      fldType: f.fldType,
      printed: f.printed,
      geom: f.geom,
      ln: f.ln,
      calcData: f.calcData,
      data: f.data,
      text: f.text,
      barcode: f.barcode
    })),
    selectedName: state.selectedName,
    showHiddenOnCanvas: state.showHiddenOnCanvas
  });
}

function restoreFromSnapshot(json) {
  const obj = JSON.parse(json);
  state.docMeta = obj.docMeta;
  state.subImage = obj.subImage;
  state.dateOffsets = obj.dateOffsets || [];
  state.dateOffsetsLoaded = !!obj.dateOffsetsLoaded;
  state.dateOffsetsDirty = !!obj.dateOffsetsDirty;
  state.selectedName = obj.selectedName;
  state.showHiddenOnCanvas = obj.showHiddenOnCanvas;

  state.fields = (obj.fields || []).map(f => ({ ...f, _konva: null }));
  state.fieldByName = new Map(state.fields.map(f => [f.name, f]));

  renderAll();
  updateUndoRedoButtons();
}

function undo() {
  if (history.undo.length <= 1) return;
  const cur = history.undo.pop();
  history.redo.push(cur);
  const prev = history.undo[history.undo.length - 1];
  restoreFromSnapshot(prev);
}
function redo() {
  if (!history.redo.length) return;
  const next = history.redo.pop();
  history.undo.push(next);
  restoreFromSnapshot(next);
}
function updateUndoRedoButtons() {
  $("btnUndo").disabled = history.undo.length <= 1;
  $("btnRedo").disabled = history.redo.length === 0;
}

// ---------- LOSSLESS SAVE (CRLF, 2 lines) ----------
function downloadCiff() {
  if (!state.line2 || !state.line1) return;

  // Validate OffsetDate refs (critical)
  const patchedPreview = patchXmlLosslessV2Preview(); // preview strings
  const missingOffsets = validateOffsetsInText(patchedPreview.line2);

  if (missingOffsets.length) {
    alert(
      "Нельзя сохранить: есть ссылки OffsetDate на отсутствующие DateOffset:\n" +
      missingOffsets.map(x => `• ${x}`).join("\n")
    );
    return;
  }

  // Produce final patched 2-line CIFF with CRLF + final CRLF
  const out = patchXmlLosslessV2();

  const u16 = encodeUtf16leWithBom(out);
  const blob = new Blob([u16], { type: "application/xml;charset=UTF-16" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "edited.ciff";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 250);
}

// preview: returns {line1,line2}
function patchXmlLosslessV2Preview() {
  const line1 = state.line1;
  let line2 = state.line2;

  // patch SubHeader sizes
  line2 = patchSubHeaderLossless(line2);

  // patch DateOffsets only if loaded+dirty
  if (state.dateOffsetsLoaded && state.dateOffsetsDirty) {
    line2 = patchDateOffsetsLosslessV2(line2);
  }

  // patch fields (delete + upsert + insert)
  line2 = patchFieldsLosslessV2(line2);

  return { line1, line2 };
}

function patchXmlLosslessV2() {
  const { line1, line2 } = patchXmlLosslessV2Preview();
  // CRLF + final CRLF
  return line1 + "\r\n" + line2 + "\r\n";
}

/* ---- split to 2 lines ---- */
function splitTwoLines(xmlText) {
  const s = xmlText.replace(/\r\n/g, "\n");
  const parts = s.split("\n").filter(p => p.length > 0);
  if (parts.length === 1) {
    const m = parts[0].match(/^(<\?xml[\s\S]*?\?>)([\s\S]*)$/);
    if (!m) throw new Error("Невозможно разделить на 2 строки: нет XML declaration.");
    return { line1: m[1], line2: m[2] };
  }
  return { line1: parts[0], line2: parts.slice(1).join("") };
}

/* ---- SubHeader patch (values only) ---- */
function patchSubHeaderLossless(line2) {
  const sh = extractBlock(line2, "<SubHeader", "</SubHeader>");
  if (!sh) throw new Error("SubHeader не найден");
  let block = sh.block;
  block = replaceTagTextIfExists(block, "ImageWidth", String(state.subImage.width));
  block = replaceTagTextIfExists(block, "ImageHeight", String(state.subImage.height));
  block = replaceTagTextIfExists(block, "MaxImageWidth", String(state.subImage.maxWidth));
  block = replaceTagTextIfExists(block, "MaxImageHeight", String(state.subImage.maxHeight));
  return line2.slice(0, sh.start) + block + line2.slice(sh.end);
}

/* ---- DateOffsets patch (only when dirty) ---- */
function patchDateOffsetsLosslessV2(line2) {
  const header = extractBlock(line2, "<Header", "</Header>");
  if (!header) throw new Error("Header не найден");

  let h = header.block;

  // Remove all existing DateOffset
  h = h.replace(/<DateOffset\b[\s\S]*?<\/DateOffset>/g, "");

  // Insert new DateOffset list before </Header>
  const insertPos = h.lastIndexOf("</Header>");
  if (insertPos < 0) throw new Error("Header close tag не найден");

  const offsetsStr = state.dateOffsets.map(o => buildDateOffsetXml(o)).join("");
  h = h.slice(0, insertPos) + offsetsStr + h.slice(insertPos);

  return line2.slice(0, header.start) + h + line2.slice(header.end);
}

function buildDateOffsetXml(o) {
  const def =
    `<DefaultOffset>` +
      (o.default?.d ? `<Day>${o.default.d}</Day>` : ``) +
      (o.default?.m ? `<Month>${o.default.m}</Month>` : ``) +
      (o.default?.y ? `<Year>${o.default.y}</Year>` : ``) +
    `</DefaultOffset>`;

  const cur = o.current
    ? `<CurrentOffset><Day>${o.current.d ?? 0}</Day><Month>${o.current.m ?? 0}</Month><Year>${o.current.y ?? 0}</Year></CurrentOffset>`
    : ``;

  return `<DateOffset Name="${escapeAttr(o.name)}">${def}${cur}</DateOffset>`;
}

/* ---- Fields patch (delete + upsert + insert) ---- */
function patchFieldsLosslessV2(line2) {
  const sub = extractBlock(line2, "<SubImage", "</SubImage>");
  if (!sub) throw new Error("SubImage не найден");

  let s = sub.block;
  const existingNames = listFieldNamesInBlock(s);
  const targetNames = new Set(state.fields.map(f => f.name));

  // delete
  for (const name of existingNames) {
    if (!targetNames.has(name)) s = removeFieldBlock(s, name);
  }

  // upsert
  for (const f of state.fields) {
    if (hasFieldBlock(s, f.name)) s = updateExistingFieldBlockNonInvasive(s, f);
    else s = insertBeforeClosingTag(s, "</SubImage>", buildFieldXmlOneLine(f));
  }

  return line2.slice(0, sub.start) + s + line2.slice(sub.end);
}

function updateExistingFieldBlockNonInvasive(subImageBlock, f) {
  const found = extractFieldBlockInSubImage(subImageBlock, f.name);
  if (!found) return subImageBlock;

  let block = found.block;

  // Always patch geometry + Ln + FldType (if exists)
  block = replaceTagTextIfExists(block, "FldType", f.fldType);
  block = replaceTagTextIfExists(block, "X", String(f.geom.x));
  block = replaceTagTextIfExists(block, "Y", String(f.geom.y));
  block = replaceTagTextIfExists(block, "W", String(f.geom.w));
  block = replaceTagTextIfExists(block, "H", String(f.geom.h));
  block = replaceTagTextIfExists(block, "Ln", String(f.ln ?? 1));
  block = setOrRemoveOrientation(block, normalizeOrientation(f.orientation));

  // Displayed: we allow structural add/remove (Clarisoft expects this)
  block = setOrRemoveDisplayed(block, !f.printed);

  // CalcData: patch or insert CDATA if CalcData exists, else insert CalcData after Ln (safe)
  block = setOrInsertCdataTag(block, "CalcData", f.calcData ?? "", "</Ln>");

  const isDM = f.fldType === "Barcode" && f.barcode?.dataMatrix;

  if (isDM) {
    // QuietMargin: patch only if exists
    if (/<QuietMargin>/.test(block)) block = replaceTagTextIfExists(block, "QuietMargin", String(f.barcode.quietMargin ?? 0));

    // ModuleSize/SymbolSize inside DataMatrix: patch only if exist
    block = replaceTagTextWithinIfExists(block, "DataMatrix", "ModuleSize", String(f.barcode.dataMatrix.moduleSize ?? 50));
    block = replaceTagTextWithinIfExists(block, "DataMatrix", "SymbolSize", String(f.barcode.dataMatrix.symbolSize ?? "22X22"));

    // Data objects: we rebuild the <Data>...</Data> region (structure-only inside Data)
    // This is OK and required when segments count/order changes.
    block = rebuildDataObjectsForDataMatrix(block, f.barcode.dataMatrix.segments);

    // We DO NOT touch ClStVersionInfo anywhere.

  } else {
    // Default: patch only if Default exists
    block = replaceFirstCdataIfExists(block, "Default", f.data.defaultValue ?? "");

    // UserEnterData/Mask: patch ONLY if VarText exists in that field (no insertion)
    block = patchVarTextOnlyIfExists(block, f);

    // MaxNoOfChars: patch only if exists
    if (/<MaxNoOfChars>/.test(block) && f.data.maxChars != null) {
      block = replaceTagTextIfExists(block, "MaxNoOfChars", String(f.data.maxChars));
    }

    // FixedLen: do NOT insert/remove; patch-only (keeps original structure)
    // CounterText: patch NoOfChars only if exists
    if (/<NoOfChars>/.test(block) && f.fldType === "CounterText") {
      block = replaceTagTextIfExists(block, "NoOfChars", String(f.data.counter?.noOfChars ?? 4));
    }

    // OffsetDate SrcOffset: patch only if OffsetDate exists (no insertion)
    if (/<OffsetDate\b/.test(block) && f.fldType === "OffsetDateText") {
      block = replaceAttrIfExists(block, "OffsetDate", "SrcOffset", f.data.offsetRef ?? "");
    }

    // Font Pitch/XMag patch-only
    if (/<Pitch>/.test(block)) block = replaceTagTextIfExists(block, "Pitch", String(f.text.pitch ?? 10));
    if (/<XMag>/.test(block) && f.text.xMag != null) block = replaceTagTextIfExists(block, "XMag", String(f.text.xMag));
  }

  return subImageBlock.slice(0, found.start) + block + subImageBlock.slice(found.end);
}

/* ---- Build NEW field XML (one line, Clarisoft-compatible) ---- */
function buildFieldXmlOneLine(f) {
  const name = escapeAttr(f.name);

  const base =
    `<Field Name="${name}">` +
      `<FldType>${f.fldType}</FldType>` +
      (f.printed ? `` : `<Displayed>0</Displayed>`) +
      `<X>${f.geom.x}</X><Y>${f.geom.y}</Y><W>${f.geom.w}</W><H>${f.geom.h}</H><Ln>${f.ln ?? 1}</Ln>` +
      (normalizeOrientation(f.orientation) ? `<Orientation>${normalizeOrientation(f.orientation)}</Orientation>` : ``) +
      `<CalcData><![CDATA[${f.calcData ?? ""}]]></CalcData>`;

  // mimic your examples: often LoggedField exists (empty)
  const logged = `<LoggedField></LoggedField>`;

  if (f.fldType === "Barcode" && f.barcode?.dataMatrix) {
    const dataObjects = f.barcode.dataMatrix.segments.map((s, i) => {
      const idx = (i === 0) ? `` : ` Index="${i}"`;
      const src = s.srcField ? `<SrcField SrcFieldName="${escapeAttr(s.srcField)}"/>` : ``;
      return `<Object${idx} Reference=""><DataType>${s.dataType ?? 5}</DataType><Default><![CDATA[${s.defaultValue ?? ""}]]></Default>${src}</Object>`;
    }).join("");

    const barcode =
      `<CLSID>${f.barcode.clsid ?? "{7A4AA4CF-F5CD-11D4-8DAE-0050DAFE8A9F}"}</CLSID>` +
      logged +
      `<Data>${dataObjects}</Data>` +
      `<Barcode><BcH>${f.barcode.bcH ?? f.geom.h}</BcH><HR><HRFont/></HR><QuietMargin>${f.barcode.quietMargin ?? 0}</QuietMargin>` +
      `<DataMatrix><ModuleSize>${f.barcode.dataMatrix.moduleSize ?? 50}</ModuleSize><SymbolSize>${f.barcode.dataMatrix.symbolSize ?? "22X22"}</SymbolSize></DataMatrix>` +
      `</Barcode>`;

    return base + barcode + `</Field>`;
  }

  // text-like: build full object (new fields can include VarText; Clarisoft accepts)
  const attrs =
    (f.data.staticAttr != null ? ` Static="${escapeAttr(String(f.data.staticAttr))}"` : ``) +
    (f.data.parseAttr != null ? ` Parse="${escapeAttr(String(f.data.parseAttr))}"` : ``);

  const max = (f.data.maxChars != null) ? `<MaxNoOfChars>${f.data.maxChars}</MaxNoOfChars>` : ``;
  const fixedLen = f.data.fixedLen ? `<FixedLen/>` : ``;

  const wantVarText = ((f.data.userEnterData ?? "") !== "") || ((f.data.mask ?? "") !== "");
  const mask = (f.data.mask ?? "") !== "" ? `<Mask><![CDATA[${f.data.mask}]]></Mask>` : ``;
  const varText = wantVarText ? `<VarText>${mask}<UserEnterData><![CDATA[${f.data.userEnterData ?? ""}]]></UserEnterData></VarText>` : ``;

  const offsetDate = (f.fldType === "OffsetDateText" && f.data.offsetRef)
    ? `<OffsetDate SrcOffset="${escapeAttr(f.data.offsetRef)}"/>`
    : ``;

  const counter = (f.fldType === "CounterText")
    ? `<CounterText><SubCnt Significance="${escapeAttr(String(f.data.counter?.significance ?? 0))}"><NoOfChars>${escapeAttr(String(f.data.counter?.noOfChars ?? 4))}</NoOfChars><ClrStCntType></ClrStCntType></SubCnt></CounterText>`
    : ``;

  const data =
    logged +
    `<Data><Object${attrs} Reference=""><DataType>${f.data.dataType ?? guessDataType(f.fldType)}</DataType>` +
      `${max}<Default><![CDATA[${f.data.defaultValue ?? ""}]]></Default>${fixedLen}${varText}${offsetDate}${counter}` +
    `</Object></Data>`;

  const text =
    `<Text><Font><Pitch>${f.text.pitch ?? 10}</Pitch>` +
      (f.text.xMag != null ? `<XMag>${f.text.xMag}</XMag>` : ``) +
    `</Font></Text>`;

  return base + data + text + `</Field>`;
}

/* ---- Validate offsets: OffsetDate SrcOffset must exist as DateOffset Name ---- */
function validateOffsetsInText(line2) {
  const offsetNames = new Set();
  const reOff = /<DateOffset\b[^>]*\bName="([^"]+)"/g;
  let m;
  while ((m = reOff.exec(line2)) !== null) offsetNames.add(m[1]);

  const refs = new Set();
  const reRef = /<OffsetDate\b[^>]*\bSrcOffset="([^"]+)"/g;
  while ((m = reRef.exec(line2)) !== null) refs.add(m[1]);

  const missing = [];
  for (const r of refs) if (!offsetNames.has(r)) missing.push(r);
  return missing;
}

/* ----------------- Low-level string ops ----------------- */

function extractBlock(s, openStartsWith, closeTag) {
  const openIdx = s.indexOf(openStartsWith);
  if (openIdx < 0) return null;
  const closeIdx = s.indexOf(closeTag, openIdx);
  if (closeIdx < 0) return null;
  const end = closeIdx + closeTag.length;
  return { start: openIdx, end, block: s.slice(openIdx, end) };
}

function insertBeforeClosingTag(block, closingTag, insertStr) {
  const pos = block.lastIndexOf(closingTag);
  if (pos < 0) throw new Error(`closingTag not found: ${closingTag}`);
  return block.slice(0, pos) + insertStr + block.slice(pos);
}

function listFieldNamesInBlock(subImageBlock) {
  const set = new Set();
  const re = /<Field\b[^>]*\bName="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(subImageBlock)) !== null) set.add(m[1]);
  return set;
}

function hasFieldBlock(subImageBlock, name) {
  const re = new RegExp(`<Field\\b[^>]*\\bName="${escapeReg(name)}"[^>]*>[\\s\\S]*?<\\/Field>`);
  return re.test(subImageBlock);
}

function removeFieldBlock(subImageBlock, name) {
  const re = new RegExp(`<Field\\b[^>]*\\bName="${escapeReg(name)}"[^>]*>[\\s\\S]*?<\\/Field>`);
  return subImageBlock.replace(re, "");
}

function extractFieldBlockInSubImage(subImageBlock, fieldName) {
  const re = new RegExp(`<Field\\b[^>]*\\bName="${escapeReg(fieldName)}"[^>]*>[\\s\\S]*?<\\/Field>`);
  const m = re.exec(subImageBlock);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length, block: m[0] };
}

function replaceTagTextIfExists(block, tag, newText) {
  const re = new RegExp(`(<${tag}>)([\\s\\S]*?)(</${tag}>)`);
  if (!re.test(block)) return block;
  return block.replace(re, `$1${newText}$3`);
}

function replaceTagTextWithinIfExists(block, parentTag, tag, newText) {
  const parent = extractBlock(block, `<${parentTag}`, `</${parentTag}>`);
  if (!parent) return block;
  const inner = parent.block;
  const patchedInner = replaceTagTextIfExists(inner, tag, newText);
  return block.slice(0, parent.start) + patchedInner + block.slice(parent.end);
}

function replaceFirstCdataIfExists(block, tag, newCdataText) {
  const re = new RegExp(`(<${tag}>)([\\s\\S]*?)(</${tag}>)`);
  if (!re.test(block)) return block;

  let done = false;
  return block.replace(re, (m, p1, inner, p3) => {
    if (done) return m;
    done = true;
    if (/<!\[CDATA\[/.test(inner)) {
      const inner2 = inner.replace(/<!\[CDATA\[[\s\S]*?\]\]>/, `<![CDATA[${newCdataText}]]>`);
      return p1 + inner2 + p3;
    }
    return `${p1}<![CDATA[${newCdataText}]]>${p3}`;
  });
}

function setOrInsertCdataTag(block, tag, cdataText, afterAnchor) {
  // if tag exists: patch CDATA
  if (new RegExp(`<${tag}>`).test(block)) {
    return block.replace(new RegExp(`(<${tag}>)([\\s\\S]*?)(</${tag}>)`), (m,p1,inner,p3)=>{
      if (/<!\[CDATA\[/.test(inner)) {
        return p1 + inner.replace(/<!\[CDATA\[[\s\S]*?\]\]>/, `<![CDATA[${cdataText}]]>`) + p3;
      }
      return `${p1}<![CDATA[${cdataText}]]>${p3}`;
    });
  }
  // insert tag after anchor if anchor exists
  const pos = block.indexOf(afterAnchor);
  if (pos < 0) return block;
  return block.slice(0, pos + afterAnchor.length) + `<${tag}><![CDATA[${cdataText}]]></${tag}>` + block.slice(pos + afterAnchor.length);
}

function patchVarTextOnlyIfExists(block, f) {
  if (!/<VarText\b/.test(block)) return block;

  if (/<UserEnterData>/.test(block)) {
    block = block.replace(
      /(<UserEnterData>)([\s\S]*?)(<\/UserEnterData>)/,
      `$1<![CDATA[${f.data.userEnterData ?? ""}]]>$3`
    );
  }
  if (/<Mask>/.test(block)) {
    block = block.replace(
      /(<Mask>)([\s\S]*?)(<\/Mask>)/,
      `$1<![CDATA[${f.data.mask ?? ""}]]>$3`
    );
  }
  return block;
}

function replaceAttrIfExists(block, tag, attr, newVal) {
  const re = new RegExp(`(<${tag}\\b[^>]*\\b${attr}=")([^"]*)(")`);
  if (!re.test(block)) return block;
  return block.replace(re, `$1${escapeAttr(newVal)}$3`);
}

function setOrRemoveDisplayed(block, wantDisplayed0) {
  const has = /<Displayed>\s*\d+\s*<\/Displayed>/.test(block);
  if (wantDisplayed0) {
    if (has) return replaceTagTextIfExists(block, "Displayed", "0");
    const pos = block.indexOf("</FldType>");
    if (pos < 0) return block;
    return block.slice(0, pos + "</FldType>".length) + `<Displayed>0</Displayed>` + block.slice(pos + "</FldType>".length);
  } else {
    return block.replace(/<Displayed>\s*0\s*<\/Displayed>/, "");
  }
}

function setOrRemoveOrientation(block, orientation) {
  const has = /<Orientation>\s*\d+\s*<\/Orientation>/.test(block);
  if (orientation === 0) {
    return has ? block.replace(/<Orientation>\s*\d+\s*<\/Orientation>/, "") : block;
  }
  if (has) return replaceTagTextIfExists(block, "Orientation", String(orientation));

  const pos = block.indexOf("</Ln>");
  if (pos < 0) return block;
  return block.slice(0, pos + "</Ln>".length) + `<Orientation>${orientation}</Orientation>` + block.slice(pos + "</Ln>".length);
}

function rebuildDataObjectsForDataMatrix(fieldBlock, segments) {
  const data = extractBlock(fieldBlock, "<Data>", "</Data>");
  if (!data) return fieldBlock;

  const objects = segments.map((s, i) => {
    const idx = (i === 0) ? `` : ` Index="${i}"`;
    const src = s.srcField ? `<SrcField SrcFieldName="${escapeAttr(s.srcField)}"/>` : ``;
    return `<Object${idx} Reference=""><DataType>${s.dataType ?? 5}</DataType><Default><![CDATA[${s.defaultValue ?? ""}]]></Default>${src}</Object>`;
  }).join("");

  const newData = `<Data>${objects}</Data>`;
  return fieldBlock.slice(0, data.start) + newData + fieldBlock.slice(data.end);
}

/* ---------- Encoding ---------- */
function encodeUtf16leWithBom(str) {
  const buf = new ArrayBuffer(2 + str.length * 2);
  const view = new DataView(buf);
  view.setUint16(0, 0xFEFF, true); // BOM
  for (let i = 0; i < str.length; i++) view.setUint16(2 + i * 2, str.charCodeAt(i), true);
  return buf;
}

/* ---------- Utils ---------- */
function toInt(v, fallback = 0) {
  if (v == null) return fallback;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}
function toFloat(v, fallback = 0) {
  if (v == null) return fallback;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
}
function normalizeOrientation(v) {
  const n = toInt(v, 0);
  return ALLOWED_ORIENTATIONS.includes(n) ? n : 0;
}

function applyFieldOrientation(group, width, height, orientationValue) {
  const orientation = normalizeOrientation(orientationValue);
  group.rotation(orientation);

  // Keep rotated content inside the same local field box.
  // Konva/canvas positive rotation is clockwise, so translation differs for 90/270.
  if (orientation === 90) {
    group.x(height);
    group.y(0);
    return;
  }
  if (orientation === 180) {
    group.x(width);
    group.y(height);
    return;
  }
  if (orientation === 270) {
    group.x(0);
    group.y(width);
    return;
  }

  group.x(0);
  group.y(0);
}

function clamp(min, max, v) { return Math.max(min, Math.min(max, v)); }
function uniqueName(base, existing) {
  let i = 0;
  while (true) {
    const name = `${base}${String(i).padStart(2, "0")}`;
    if (!existing.includes(name)) return name;
    i++;
  }
}
function guessDataType(fldType) {
  switch (fldType) {
    case "TimeText": return 1;
    case "DateText": return 2;
    case "OffsetDateText": return 3;
    case "CounterText": return 4;
    case "Barcode": return 5;
    default: return 0;
  }
}

function selectOrientation(value, onChange) {
  const select = document.createElement("select");
  select.className = "input";
  const normalizedValue = normalizeOrientation(value);
  ALLOWED_ORIENTATIONS.forEach((deg) => {
    const opt = document.createElement("option");
    opt.value = String(deg);
    opt.textContent = `${deg}°`;
    if (deg === normalizedValue) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => onChange(normalizeOrientation(select.value)));
  return select;
}
function pad2(x){ return String(x ?? 0).padStart(2,"0"); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/* ---------- Initial blank render ---------- */
renderGrid();
renderObjects();
renderFieldLists();
renderSelectionPanels();
renderHiddenEditor();
renderOffsetsEditor();
renderUI();
