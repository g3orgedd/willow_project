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

function normalizeEmptyTemplateDimensionMm(value, maxInternal, fallbackInternal) {
  const fallbackMm = internalToMm(fallbackInternal);
  const maxMm = internalToMm(maxInternal);
  let next = Number(value);

  if (!Number.isFinite(next)) next = fallbackMm;
  if (next <= 0) next = fallbackMm;

  return Number(Math.max(0.01, Math.min(maxMm, next)).toFixed(2));
}

function getDirectChildText(parent, tagName) {
  if (!parent) return "";
  const child = [...parent.children].find((el) => el.tagName === tagName);
  return child?.textContent ?? "";
}

function findDirectChildTagContentRange(xml, tagName) {
  const re = /<[^>]+>/g;
  let depth = 0;
  let targetStart = null;
  let match;

  while ((match = re.exec(xml))) {
    const token = match[0];
    if (/^<\?/.test(token) || /^<!/.test(token)) continue;

    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token);
    const nameMatch = token.match(/^<\/?\s*([^\s/>]+)/);
    if (!nameMatch) continue;

    const name = nameMatch[1];

    if (isClosing) {
      if (name === tagName && targetStart != null && depth === 1) {
        return { start: targetStart, end: match.index };
      }
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0 && name === tagName) {
      if (isSelfClosing) return null;
      targetStart = re.lastIndex;
    }

    if (!isSelfClosing) depth += 1;
  }

  return null;
}

function getEmptyTemplateDimensionsFromDialog() {
  return {
    widthMm: normalizeEmptyTemplateDimensionMm(elNewTemplateWidth?.value, EMPTY_TEMPLATE_SUBIMAGE.maxImageWidth, EMPTY_TEMPLATE_SUBIMAGE.maxImageWidth),
    heightMm: normalizeEmptyTemplateDimensionMm(elNewTemplateHeight?.value, EMPTY_TEMPLATE_SUBIMAGE.maxImageHeight, EMPTY_TEMPLATE_SUBIMAGE.maxImageHeight)
  };
}

function populateMaterialSelect(el, items, currentValue) {
  if (!el) return;
  el.innerHTML = "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.value);
    opt.textContent = String(item.label);
    if (String(item.value) === String(currentValue)) opt.selected = true;
    el.appendChild(opt);
  });
  el.value = String(currentValue);
}

function populateNewTemplateOptions() {
  if (!elNewTemplatePrinterModel || !elNewTemplatePrintMode) return;

  const currentModel = EMPTY_TEMPLATE_PRINTER_MODELS.includes(elNewTemplatePrinterModel.value)
    ? elNewTemplatePrinterModel.value
    : EMPTY_TEMPLATE_PRINTER_MODELS[0];
  const currentMode = EMPTY_TEMPLATE_PRINT_MODES.includes(elNewTemplatePrintMode.value)
    ? elNewTemplatePrintMode.value
    : EMPTY_TEMPLATE_PRINT_MODES[0];
  const { widthMm, heightMm } = getEmptyTemplateDimensionsFromDialog();

  populateMaterialSelect(
    elNewTemplatePrinterModel,
    EMPTY_TEMPLATE_PRINTER_MODELS.map((model) => ({ value: model, label: model })),
    currentModel
  );
  populateMaterialSelect(
    elNewTemplatePrintMode,
    EMPTY_TEMPLATE_PRINT_MODES.map((mode) => ({ value: mode, label: mode })),
    currentMode
  );
  if (elNewTemplateWidth) elNewTemplateWidth.value = widthMm.toFixed(2);
  if (elNewTemplateHeight) elNewTemplateHeight.value = heightMm.toFixed(2);
}

function openNewTemplateModal() {
  if (!elNewTemplateModal) return;
  populateNewTemplateOptions();
  elNewTemplateModal.classList.remove("hidden");
  elNewTemplateModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeNewTemplateModal() {
  if (!elNewTemplateModal) return;
  elNewTemplateModal.classList.add("hidden");
  elNewTemplateModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function createNewTemplateFromDialog() {
  const printerModel = EMPTY_TEMPLATE_PRINTER_MODELS.includes(elNewTemplatePrinterModel?.value)
    ? elNewTemplatePrinterModel.value
    : EMPTY_TEMPLATE_PRINTER_MODELS[0];
  const printMode = EMPTY_TEMPLATE_PRINT_MODES.includes(elNewTemplatePrintMode?.value)
    ? elNewTemplatePrintMode.value
    : EMPTY_TEMPLATE_PRINT_MODES[0];
  const { widthMm, heightMm } = getEmptyTemplateDimensionsFromDialog();

  if (elNewTemplateWidth) elNewTemplateWidth.value = widthMm.toFixed(2);
  if (elNewTemplateHeight) elNewTemplateHeight.value = heightMm.toFixed(2);

  if (state.xmlDoc && !confirm("Current template will be replaced. Continue?")) return;

  closeNewTemplateModal();
  loadXml(buildEmptyTemplateXml(printerModel, printMode, widthMm, heightMm));
}

function buildEmptyTemplateXml(printerModel, printMode, imageWidthMm, imageHeightMm) {
  const model = EMPTY_TEMPLATE_PRINTER_MODELS.includes(String(printerModel))
    ? String(printerModel)
    : EMPTY_TEMPLATE_PRINTER_MODELS[0];
  const mode = EMPTY_TEMPLATE_PRINT_MODES.includes(String(printMode))
    ? String(printMode)
    : EMPTY_TEMPLATE_PRINT_MODES[0];
  const designedFor = `DataFlex ${model}(53mm) - ${mode}`;
  const widthMm = normalizeEmptyTemplateDimensionMm(imageWidthMm, EMPTY_TEMPLATE_SUBIMAGE.maxImageWidth, EMPTY_TEMPLATE_SUBIMAGE.imageWidth);
  const heightMm = normalizeEmptyTemplateDimensionMm(imageHeightMm, EMPTY_TEMPLATE_SUBIMAGE.maxImageHeight, EMPTY_TEMPLATE_SUBIMAGE.imageHeight);
  const overallWidth = Math.min(EMPTY_TEMPLATE_SUBIMAGE.maxImageWidth, mmToInternal(widthMm));
  const overallHeight = Math.min(EMPTY_TEMPLATE_SUBIMAGE.maxImageHeight, mmToInternal(heightMm));

  return (
    `<?xml version="1.0" encoding="UTF-16"?>\r\n` +
    `<ImageDesign Version="23" xml:space="default"><Header DesignedFor="${escapeAttr(designedFor)}"><ClStVersionInfo>${EMPTY_TEMPLATE_CLST_VERSION_INFO}</ClStVersionInfo></Header><SubImage ImageReference="1"><SubHeader FormatName="Default" PrinterFormatName="Default"><ImageWidth>${overallWidth}</ImageWidth><ImageHeight>${overallHeight}</ImageHeight><MaxImageWidth>${overallWidth}</MaxImageWidth><MaxImageHeight>${overallHeight}</MaxImageHeight><XRes>${EMPTY_TEMPLATE_SUBIMAGE.xRes}</XRes><CurrentOrientation>${EMPTY_TEMPLATE_SUBIMAGE.currentOrientation}</CurrentOrientation></SubHeader></SubImage><GenericSettings><ImageMapping><Map SubIMageRef="1">1</Map></ImageMapping></GenericSettings></ImageDesign>`
  );
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
    alert("XML parse error: " + parseError.textContent.slice(0, 200));
    return;
  }

  state.xmlDoc = doc;

  parseHeader(doc);
  parseSubHeader(doc);
  parseFields(doc);
  setSelectedNames([]);

  pushHistory(true);

  stage.position({ x: 20, y: 20 });
  setZoom(100);

  renderAll();

  elStatusLeft.textContent =
    `Loaded: ${state.docMeta.designedFor} 
    | Overall size: ${internalToMm(getCanvasInternalWidth()).toFixed(2)} x ${internalToMm(getCanvasInternalHeight()).toFixed(2)} mm 
    | Used area: ${internalToMm(getUsedImageInternalWidth()).toFixed(2)} x ${internalToMm(getUsedImageInternalHeight()).toFixed(2)} mm` +
    ` | InputEOL=${hasCRLF ? 'CRLF' : 'LF'}`;
}

function parseHeader(doc) {
  const root = doc.querySelector("ImageDesign");
  state.docMeta.version = root?.getAttribute("Version") ?? null;

  const header = doc.querySelector("ImageDesign > Header");
  const designedFor = header?.getAttribute("DesignedFor") ?? "";
  const parsedTarget = parseDesignedForMeta(designedFor);
  state.docMeta.designedFor = designedFor || parsedTarget.designedFor;
  state.docMeta.clStVersionInfo = header?.querySelector("ClStVersionInfo")?.textContent ?? "";
  state.docMeta.printerModel = parsedTarget.printerModel;
  state.docMeta.printMode = parsedTarget.printMode;

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
  state.subImage.width = toInt(getDirectChildText(sh, "ImageWidth"), 0);
  state.subImage.height = toInt(getDirectChildText(sh, "ImageHeight"), 0);
  state.subImage.maxWidth = toInt(getDirectChildText(sh, "MaxImageWidth"), 0);
  state.subImage.maxHeight = toInt(getDirectChildText(sh, "MaxImageHeight"), 0);
  state.subImage.xRes = toFloat(getDirectChildText(sh, "XRes"), 0.12);
  state.subImage.orientation = toInt(getDirectChildText(sh, "CurrentOrientation"), 0);

  if (!state.subImage.maxWidth) state.subImage.maxWidth = state.subImage.width;
  if (!state.subImage.maxHeight) state.subImage.maxHeight = state.subImage.height;
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
    if (f.fldType === "CounterText") normalizeCounterField(f, { preserveCurrent: true });
    state.fields.push(f);
    state.fieldByName.set(f.name, f);
  });
}

function parseMaxNoOfChars(node) {
  const text = node?.textContent?.trim() ?? "";
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
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
  const maxChars = parseMaxNoOfChars(objNode?.querySelector("MaxNoOfChars"));
  const fixedLen = !!objNode?.querySelector("FixedLen");
  const staticAttr = objNode?.getAttribute("Static") ?? null;
  const parseAttr = objNode?.getAttribute("Parse") ?? null;
  const hasVarText = !!objNode?.querySelector("VarText");
  const userEnter = objNode?.querySelector("VarText > UserEnterData")?.textContent ?? "";
  const mask = objNode?.querySelector("VarText > Mask")?.textContent ?? "";

  const pitch = node.querySelector("Text > Font > Pitch") ? toInt(node.querySelector("Text > Font > Pitch")?.textContent, null) : null;
  const xMag = node.querySelector("Text > Font > XMag") ? toInt(node.querySelector("Text > Font > XMag")?.textContent, null) : null;

  const clsid = node.querySelector("CLSID")?.textContent ?? "";
  const quietMargin = node.querySelector("Barcode > QuietMargin") ? toInt(node.querySelector("Barcode > QuietMargin")?.textContent, 0) : null;
  const bcH = node.querySelector("Barcode > BcH") ? toInt(node.querySelector("Barcode > BcH")?.textContent, null) : null;

  const dmNode = node.querySelector("Barcode > DataMatrix");
  const dm = dmNode ? {
    moduleSize: dmNode.querySelector("ModuleSize") ? normalizeDataMatrixModuleSizeValue(toFloat(dmNode.querySelector("ModuleSize")?.textContent, 0.5)) : null,
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
  const cntStartVal = objNode?.querySelector("CounterText > SubCnt > StartVal")?.textContent ?? null;
  const cntEndVal = objNode?.querySelector("CounterText > SubCnt > EndVal")?.textContent ?? null;
  const cntStepSize = objNode?.querySelector("CounterText > SubCnt > StepSize")
    ? toInt(objNode.querySelector("CounterText > SubCnt > StepSize")?.textContent, null)
    : null;
  const cntClrStCntType = objNode?.querySelector("CounterText > SubCnt > ClrStCntType")?.textContent ?? "";

  return {
    sourceName: name,
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
      hasVarText,
      textEntryMode: (fldType === "FixedText" ? (hasVarText ? "user" : "fixed") : null),
      userEnterData: userEnter,
      mask,
      offsetRef,
      dateLocale: inferDateLocale(fldType, defVal, calcData),
      counter: {
        noOfChars: cntNoChars,
        significance: cntSignificance,
        startVal: cntStartVal,
        endVal: cntEndVal,
        stepSize: cntStepSize,
        clrStCntType: cntClrStCntType
      }
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

