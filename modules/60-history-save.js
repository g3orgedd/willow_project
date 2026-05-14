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
      sourceName: f.sourceName ?? null,
      name: f.name,
      fldType: f.fldType,
      printed: f.printed,
      geom: f.geom,
      orientation: normalizeOrientation(f.orientation),
      ln: f.ln,
      calcData: f.calcData,
      data: f.data,
      text: f.text,
      barcode: f.barcode
    })),
    selectedName: state.selectedName,
    selectedNames: getSelectedNames(),
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
  state.selectedNames = Array.isArray(obj.selectedNames)
    ? obj.selectedNames.slice()
    : (obj.selectedName ? [obj.selectedName] : []);
  state.showHiddenOnCanvas = obj.showHiddenOnCanvas;

  state.fields = (obj.fields || []).map(f => ({
    ...f,
    orientation: normalizeOrientation(f.orientation),
    sourceName: f.sourceName !== undefined ? f.sourceName : f.name,
    _konva: null
  }));
  state.fields.forEach((field) => {
    if (field.fldType === "CounterText") normalizeCounterField(field, { preserveCurrent: true });
  });
  state.fieldByName = new Map(state.fields.map(f => [f.name, f]));
  setSelectedNames(state.selectedNames, state.selectedName);

  renderAll();
  updateUndoRedoButtons();
}

function undo() {
  if (history.undo.length <= 1) return;
  const current = snapshotState();
  const prev = history.undo.pop();
  history.redo.push(current);
  restoreFromSnapshot(prev);
}
function redo() {
  if (!history.redo.length) return;
  const next = history.redo.pop();
  history.undo.push(snapshotState());
  restoreFromSnapshot(next);
}
function updateUndoRedoButtons() {
  $("btnUndo").disabled = history.undo.length <= 1;
  $("btnRedo").disabled = history.redo.length === 0;
}

// ---------- LOSSLESS SAVE (CRLF, 2 lines) ----------
function downloadCiff() {
  if (!state.line2 || !state.line1) return;

  const printableValidation = updatePrintableValidation();
  const invalidPrintableNames = printableValidation.invalidPrintableFieldNames ?? [];
  if (invalidPrintableNames.length) {
    alert(
      "Cannot save: one or more printable fields are outside the printable area.\n\n" +
      "Move these fields fully inside the printable area before saving:\n" +
      invalidPrintableNames.map((name) => `- ${name}`).join("\n")
    );
    return;
  }

  // Validate OffsetDate refs (critical)
  const patchedPreview = patchXmlLosslessV2Preview(); // preview strings
  const missingOffsets = validateOffsetsInText(patchedPreview.line2);

  if (missingOffsets.length) {
    alert(
      "Cannot save: missing DateOffset targets referenced by OffsetDate:\n" +
      missingOffsets.map(x => `- ${x}`).join("\n")
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

  // patch Header metadata
  line2 = patchHeaderMetadataLossless(line2);

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
    if (!m) throw new Error("Cannot split XML into 2 lines: missing XML declaration.");
    return { line1: m[1], line2: m[2] };
  }
  return { line1: parts[0], line2: parts.slice(1).join("") };
}

/* ---- SubHeader patch (values only) ---- */
function patchHeaderMetadataLossless(line2) {
  const header = extractBlock(line2, "<Header", "</Header>");
  if (!header) throw new Error("Header not found");

  let block = header.block;
  const designedFor = buildDesignedForLabel(state.docMeta.printerModel, state.docMeta.printMode);
  state.docMeta.designedFor = designedFor;

  if (/\bDesignedFor="[^"]*"/.test(block)) {
    block = block.replace(/\bDesignedFor="[^"]*"/, `DesignedFor="${escapeAttr(designedFor)}"`);
  } else {
    block = block.replace(/^<Header\b/, `<Header DesignedFor="${escapeAttr(designedFor)}"`);
  }

  return line2.slice(0, header.start) + block + line2.slice(header.end);
}

function patchSubHeaderLossless(line2) {
  const sh = extractBlock(line2, "<SubHeader", "</SubHeader>");
  if (!sh) throw new Error("SubHeader not found");
  let block = sh.block;
  block = replaceDirectChildTagTextIfExists(block, "ImageWidth", String(state.subImage.width));
  block = replaceDirectChildTagTextIfExists(block, "ImageHeight", String(state.subImage.height));
  block = replaceDirectChildTagTextIfExists(block, "MaxImageWidth", String(state.subImage.maxWidth));
  block = replaceDirectChildTagTextIfExists(block, "MaxImageHeight", String(state.subImage.maxHeight));
  return line2.slice(0, sh.start) + block + line2.slice(sh.end);
}

/* ---- DateOffsets patch (only when dirty) ---- */
function patchDateOffsetsLosslessV2(line2) {
  const header = extractBlock(line2, "<Header", "</Header>");
  if (!header) throw new Error("Header not found");

  let h = header.block;

  // Remove all existing DateOffset
  h = h.replace(/<DateOffset\b[\s\S]*?<\/DateOffset>/g, "");

  // Insert new DateOffset list before </Header>
  const insertPos = h.lastIndexOf("</Header>");
  if (insertPos < 0) throw new Error("Header close tag not found");

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

  const current = getComputedDateOffsetCurrent(o);
  const cur = `<CurrentOffset><Day>${current.d ?? 0}</Day><Month>${current.m ?? 0}</Month><Year>${current.y ?? 0}</Year></CurrentOffset>`;

  return `<DateOffset Name="${escapeAttr(o.name)}">${def}${cur}</DateOffset>`;
}

/* ---- Fields patch (delete + upsert + insert) ---- */
function patchFieldsLosslessV2(line2) {
  const sub = extractBlock(line2, "<SubImage", "</SubImage>");
  if (!sub) throw new Error("SubImage not found");

  let s = sub.block;
  const existingNames = listFieldNamesInBlock(s);
  const retainedNames = new Set(state.fields.filter(f => f.sourceName != null).map(f => f.sourceName));

  // delete
  for (const name of existingNames) {
    if (!retainedNames.has(name)) s = removeFieldBlock(s, name);
  }

  // upsert existing fields from bottom to top so chained renames do not shadow later source blocks
  const fieldsForUpsert = [...state.fields].sort((a, b) => {
    const aPos = extractFieldBlockInSubImage(s, a.sourceName || a.name)?.start ?? -1;
    const bPos = extractFieldBlockInSubImage(s, b.sourceName || b.name)?.start ?? -1;
    return bPos - aPos;
  });

  for (const f of fieldsForUpsert) {
    const existingName = [f.sourceName, f.name].filter(Boolean).find(name => hasFieldBlock(s, name));
    if (existingName) s = updateExistingFieldBlockNonInvasive(s, f, existingName);
    else s = insertBeforeClosingTag(s, "</SubImage>", buildFieldXmlOneLine(f));
  }

  return line2.slice(0, sub.start) + s + line2.slice(sub.end);
}

function updateExistingFieldBlockNonInvasive(subImageBlock, f, lookupName = f.sourceName || f.name) {
  const found = extractFieldBlockInSubImage(subImageBlock, lookupName);
  if (!found) return subImageBlock;

  let block = found.block;

  // Always patch geometry + Ln + FldType (if exists)
  block = replaceFieldNameAttr(block, f.name);
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
    block = replaceTagTextWithinIfExists(block, "DataMatrix", "ModuleSize", serializeDataMatrixModuleSize(f.barcode.dataMatrix.moduleSize ?? 0.5));
    block = replaceTagTextWithinIfExists(block, "DataMatrix", "SymbolSize", normalizeDataMatrixSymbolSizeValue(f.barcode.dataMatrix.symbolSize, "22X22"));

    // Data objects: we rebuild the <Data>...</Data> region (structure-only inside Data)
    // This is OK and required when segments count/order changes.
    block = rebuildDataObjectsForDataMatrix(block, f.barcode.dataMatrix.segments);

    // We DO NOT touch ClStVersionInfo anywhere.

  } else {
    if (f.fldType === "CounterText") normalizeCounterField(f, { preserveCurrent: true });

    if (/<DataType>/.test(block)) {
      block = replaceTagTextIfExists(block, "DataType", String(f.data.dataType ?? guessDataType(f.fldType)));
    }

    if (f.fldType === "FixedText") {
      block = syncTextEntryModeStructure(block, f);
    }

    // Default: patch only if Default exists
    block = replaceFirstCdataIfExists(block, "Default", f.data.defaultValue ?? "");

    // UserEnterData/Mask: patch after structure sync.
    block = patchVarTextOnlyIfExists(block, f);

    // MaxNoOfChars is read-only in the editor, so preserve the original tag
    // and value exactly for already-loaded fields.

    // FixedLen: do NOT insert/remove; patch-only (keeps original structure)
    // CounterText: patch NoOfChars only if exists
    if (/<NoOfChars>/.test(block) && f.fldType === "CounterText") {
      block = replaceTagTextIfExists(block, "NoOfChars", String(f.data.counter?.noOfChars ?? 4));
      block = replaceFirstCdataIfExists(block, "StartVal", String(f.data.counter?.startVal ?? "1"));
      block = replaceFirstCdataIfExists(block, "EndVal", String(f.data.counter?.endVal ?? String(getCounterMaxValue(f.data.counter?.noOfChars ?? 4))));
      if (/<StepSize>/.test(block)) block = replaceTagTextIfExists(block, "StepSize", String(f.data.counter?.stepSize ?? 1));
      if (/<ClrStCntType>/.test(block)) block = replaceTagTextIfExists(block, "ClrStCntType", String(f.data.counter?.clrStCntType ?? ""));
      if (/<SubCnt\b/.test(block)) block = replaceAttrIfExists(block, "SubCnt", "Significance", String(f.data.counter?.significance ?? 0));
    }

    // OffsetDate: keep structure in sync when switching Current Date <-> Calculated Date
    if (f.fldType === "OffsetDateText" && f.data.offsetRef) {
      if (/<OffsetDate\b/.test(block)) {
        block = replaceAttrIfExists(block, "OffsetDate", "SrcOffset", f.data.offsetRef ?? "");
      } else {
        block = insertBeforeClosingTag(block, "</Object>", `<OffsetDate SrcOffset="${escapeAttr(f.data.offsetRef)}"/>`);
      }
    } else if (/<OffsetDate\b/.test(block)) {
      block = block.replace(/\s*<OffsetDate\b[^>]*\/>/, "");
    }

    // Font Pitch/XMag patch-only
    if (/<Pitch>/.test(block)) block = replaceTagTextIfExists(block, "Pitch", String(getEffectiveTextPitch(f, 10)));
    if (/<XMag>/.test(block) && f.text.xMag != null) block = replaceTagTextIfExists(block, "XMag", String(f.text.xMag));
  }

  return subImageBlock.slice(0, found.start) + block + subImageBlock.slice(found.end);
}

/* ---- Build NEW field XML (one line, Clarisoft-compatible) ---- */
function buildFieldXmlOneLine(f) {
  if (f.fldType === "CounterText") normalizeCounterField(f, { preserveCurrent: true });
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
      `<DataMatrix><ModuleSize>${serializeDataMatrixModuleSize(f.barcode.dataMatrix.moduleSize ?? 0.5)}</ModuleSize><SymbolSize>${normalizeDataMatrixSymbolSizeValue(f.barcode.dataMatrix.symbolSize, "22X22")}</SymbolSize></DataMatrix>` +
      `</Barcode>`;

    return base + barcode + `</Field>`;
  }

  // text-like: build full object (new fields can include VarText; Clarisoft accepts)
  const staticAttrValue = (f.fldType === "FixedText")
    ? (isUserEnteredTextField(f) ? "0" : null)
    : f.data.staticAttr;
  const attrs =
    (staticAttrValue != null ? ` Static="${escapeAttr(String(staticAttrValue))}"` : ``) +
    (f.data.parseAttr != null ? ` Parse="${escapeAttr(String(f.data.parseAttr))}"` : ``);

  const max = (!wantsVarTextStructure(f) && f.data.maxChars != null) ? `<MaxNoOfChars>${f.data.maxChars}</MaxNoOfChars>` : ``;
  const fixedLen = f.data.fixedLen ? `<FixedLen/>` : ``;

  const wantVarText = wantsVarTextStructure(f);
  const mask = (f.data.mask ?? "") !== "" ? `<Mask><![CDATA[${f.data.mask}]]></Mask>` : ``;
  const userEnterValue = wantVarText ? (f.data.userEnterData ?? f.data.defaultValue ?? "") : "";
  const varText = wantVarText ? `<VarText>${mask}<UserEnterData><![CDATA[${userEnterValue}]]></UserEnterData></VarText>` : ``;

  const offsetDate = (f.fldType === "OffsetDateText" && f.data.offsetRef)
    ? `<OffsetDate SrcOffset="${escapeAttr(f.data.offsetRef)}"/>`
    : ``;

  const counter = (f.fldType === "CounterText")
    ? `<CounterText><SubCnt Significance="${escapeAttr(String(f.data.counter?.significance ?? 0))}"><NoOfChars>${escapeAttr(String(f.data.counter?.noOfChars ?? 4))}</NoOfChars><StartVal><![CDATA[${f.data.counter?.startVal ?? "1"}]]></StartVal><EndVal><![CDATA[${f.data.counter?.endVal ?? String(getCounterMaxValue(f.data.counter?.noOfChars ?? 4))}]]></EndVal><StepSize>${escapeAttr(String(f.data.counter?.stepSize ?? 1))}</StepSize><ClrStCntType>${escapeHtml(String(f.data.counter?.clrStCntType ?? ""))}</ClrStCntType></SubCnt></CounterText>`
    : ``;

  const data =
    logged +
    `<Data><Object${attrs} Reference=""><DataType>${f.data.dataType ?? guessDataType(f.fldType)}</DataType>` +
      `${max}<Default><![CDATA[${f.data.defaultValue ?? ""}]]></Default>${fixedLen}${varText}${offsetDate}${counter}` +
    `</Object></Data>`;

  const text =
    `<Text><Font><Pitch>${getEffectiveTextPitch(f, 10)}</Pitch>` +
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

function replaceDirectChildTagTextIfExists(block, tag, newText) {
  const openEnd = block.indexOf(">");
  const closeStart = block.lastIndexOf("</");
  if (openEnd < 0 || closeStart <= openEnd) return block;

  const inner = block.slice(openEnd + 1, closeStart);
  const range = findDirectChildTagContentRange(inner, tag);
  if (!range) return block;

  const start = openEnd + 1 + range.start;
  const end = openEnd + 1 + range.end;
  return block.slice(0, start) + newText + block.slice(end);
}

function replaceFieldNameAttr(block, newName) {
  return block.replace(/(<Field\b[^>]*\bName=")([^"]*)(")/, `$1${escapeAttr(newName)}$3`);
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

function syncTextEntryModeStructure(block, f) {
  if (f.fldType !== "FixedText") return block;

  const wantVarText = wantsVarTextStructure(f);
  block = setOrRemoveObjectStaticAttr(block, wantVarText ? "0" : null);
  block = block.replace(/\s*<VarText\b[\s\S]*?<\/VarText>/, "");

  if (!wantVarText) return block;

  const mask = (f.data.mask ?? "") !== "" ? `<Mask><![CDATA[${f.data.mask}]]></Mask>` : ``;
  const userEnterValue = f.data.userEnterData ?? f.data.defaultValue ?? "";
  return insertBeforeClosingTag(block, "</Object>", `<VarText>${mask}<UserEnterData><![CDATA[${userEnterValue}]]></UserEnterData></VarText>`);
}

function setOrRemoveObjectStaticAttr(block, valueOrNull) {
  const match = block.match(/<Object\b[^>]*>/);
  if (!match) return block;

  const openTag = match[0];
  let nextOpenTag = openTag;

  if (/\sStatic="[^"]*"/.test(nextOpenTag)) {
    nextOpenTag = valueOrNull == null
      ? nextOpenTag.replace(/\sStatic="[^"]*"/, "")
      : nextOpenTag.replace(/\sStatic="[^"]*"/, ` Static="${escapeAttr(String(valueOrNull))}"`);
  } else if (valueOrNull != null) {
    nextOpenTag = nextOpenTag.replace(/>$/, ` Static="${escapeAttr(String(valueOrNull))}">`);
  }

  if (nextOpenTag === openTag) return block;
  return block.replace(openTag, nextOpenTag);
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
  const normalizedValue = normalizeOrientation(value);
  return createMaterialSelect(
    ALLOWED_ORIENTATIONS.map((deg) => ({ value: String(deg), label: `${deg}\u00B0` })),
    String(normalizedValue),
    (nextValue) => onChange(normalizeOrientation(nextValue))
  );
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

