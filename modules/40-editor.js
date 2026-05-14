// ---------- Properties builders ----------
function formatMaxCharacters(value) {
  return Number.isSafeInteger(value) ? String(value) : "Not specified";
}

function getFieldVisualSizeInternal(field, orientationValue = field?.orientation) {
  const orientation = normalizeOrientation(orientationValue);
  const w = Number(field?.geom?.w ?? 0);
  const h = Number(field?.geom?.h ?? 0);
  return (orientation === 90 || orientation === 270)
    ? { w: h, h: w }
    : { w, h };
}

function getFieldVisualBoundsInternal(field, orientationValue = field?.orientation) {
  const size = getFieldVisualSizeInternal(field, orientationValue);
  const x = Number(field?.geom?.x ?? 0);
  const y = Number(field?.geom?.y ?? 0);
  return {
    x,
    y,
    w: size.w,
    h: size.h,
    cx: x + size.w / 2,
    cy: y + size.h / 2
  };
}

function getFieldsVisualBoundsInternal(fields) {
  const bounds = fields.map((field) => getFieldVisualBoundsInternal(field));
  const minX = Math.min(...bounds.map((box) => box.x));
  const minY = Math.min(...bounds.map((box) => box.y));
  const maxX = Math.max(...bounds.map((box) => box.x + box.w));
  const maxY = Math.max(...bounds.map((box) => box.y + box.h));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
}

function rotatePointAroundPivotInternal(point, pivot, deltaRotation) {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const angle = normalizeOrientation(deltaRotation);

  if (angle === 90) return { x: pivot.x - dy, y: pivot.y + dx };
  if (angle === 180) return { x: pivot.x - dx, y: pivot.y - dy };
  if (angle === 270) return { x: pivot.x + dy, y: pivot.y - dx };
  return { x: point.x, y: point.y };
}

function getMultiRotationDelta(fields, targetRotation, hasMixedRotation, firstRotation) {
  if (hasMixedRotation) return targetRotation;
  const delta = ((targetRotation - firstRotation) % 360 + 360) % 360;
  return ALLOWED_ORIENTATIONS.includes(delta) ? delta : 0;
}

function applyMultiFieldRotation(fields, targetRotation, hasMixedRotation, firstRotation) {
  if (!fields.length) return false;

  const normalizedTarget = normalizeOrientation(targetRotation);
  const deltaRotation = getMultiRotationDelta(fields, normalizedTarget, hasMixedRotation, firstRotation);
  const shouldUpdateOrientation = fields.some((field) => normalizeOrientation(field.orientation) !== normalizedTarget);
  if (deltaRotation === 0 && !shouldUpdateOrientation) return false;

  const groupBounds = getFieldsVisualBoundsInternal(fields);
  const pivot = { x: groupBounds.cx, y: groupBounds.cy };

  fields.forEach((field) => {
    const currentBounds = getFieldVisualBoundsInternal(field);
    const rotatedCenter = rotatePointAroundPivotInternal(
      { x: currentBounds.cx, y: currentBounds.cy },
      pivot,
      deltaRotation
    );
    const nextSize = getFieldVisualSizeInternal(field, normalizedTarget);

    field.geom.x = Math.round(rotatedCenter.x - nextSize.w / 2);
    field.geom.y = Math.round(rotatedCenter.y - nextSize.h / 2);
    field.orientation = normalizedTarget;
  });

  return true;
}

function supportsFontSizeEditing(field) {
  return !!field?.text && field.fldType !== "Barcode";
}

function normalizeFontSizeValue(value) {
  const next = Math.round(Number(value));
  return Number.isFinite(next) ? Math.max(1, next) : null;
}

function getMultiFontSizeValue(fields) {
  const sizes = fields
    .map((field) => normalizeFontSizeValue(getEffectiveTextPitch(field, 10)))
    .filter((value) => value != null);
  const firstSize = sizes[0] ?? null;
  return {
    value: firstSize,
    mixed: sizes.some((size) => size !== firstSize)
  };
}

function createMultiFontSizeInput(fields) {
  const current = getMultiFontSizeValue(fields);
  const inp = document.createElement("input");
  inp.className = "input";
  inp.type = "number";
  inp.step = "1";
  inp.min = "1";
  inp.value = current.mixed || current.value == null ? "" : String(current.value);
  if (current.mixed) inp.placeholder = "Mixed";

  let lastEmitted = current.mixed ? null : current.value;
  const emit = () => {
    const nextSize = normalizeFontSizeValue(inp.value);
    if (nextSize == null) return;
    if (lastEmitted === nextSize && fields.every((field) => normalizeFontSizeValue(getEffectiveTextPitch(field, 10)) === nextSize)) return;

    lastEmitted = nextSize;
    inp.value = String(nextSize);
    pushHistory();
    fields.forEach((field) => {
      field.text.pitch = nextSize;
    });
    renderObjects();
    renderUI();
  };

  inp.addEventListener("input", emit);
  inp.addEventListener("change", emit);
  return inp;
}

function buildMultiSelectionProps(fields) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const note = document.createElement("div");
  note.className = "note";
  const fontFields = fields.filter(supportsFontSizeEditing);
  note.innerHTML = `<strong>Selected</strong><br>${fields.length} items.`;
  wrap.appendChild(note);

  const rotations = fields.map((field) => normalizeOrientation(field.orientation));
  const firstRotation = rotations[0] ?? 0;
  const hasMixedRotation = rotations.some((rotation) => rotation !== firstRotation);
  const rotationOptions = hasMixedRotation
    ? [{ value: "", label: "Mixed" }, ...ALLOWED_ORIENTATIONS.map((deg) => ({ value: String(deg), label: `${deg}\u00B0` }))]
    : ALLOWED_ORIENTATIONS.map((deg) => ({ value: String(deg), label: `${deg}\u00B0` }));

  wrap.appendChild(fieldRow("Rotation", createMaterialSelect(
    rotationOptions,
    hasMixedRotation ? "" : String(firstRotation),
    (nextValue) => {
      if (nextValue === "") return;
      const nextRotation = normalizeOrientation(nextValue);
      const shouldChange = hasMixedRotation || rotations.some((rotation) => rotation !== nextRotation);
      if (!shouldChange) return;

      pushHistory();
      if (!applyMultiFieldRotation(fields, nextRotation, hasMixedRotation, firstRotation)) return;
      renderObjects();
      renderUI();
      renderSelectionPanels();
    }
  )));

  if (fontFields.length) {
    wrap.appendChild(fieldRow("Font size", createMultiFontSizeInput(fontFields)));
  }

  return wrap;
}

function buildCommonProps(f) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  wrap.appendChild(fieldRow("Name", inputText(f.name, (v) => renameField(f, v))));
  if (f.fldType === "FixedText") {
    wrap.appendChild(fieldRow("Type", buildFixedTextEntryModeSelect(f)));
  } else {
    wrap.appendChild(fieldRow("Type", inputText(f.fldType, () => {}, { disabled: true })));
  }
  wrap.appendChild(fieldRow("Max characters", inputText(formatMaxCharacters(f.data?.maxChars), () => {}, { readOnly: true })));
  wrap.appendChild(fieldRow("Print", inputCheckbox(f.printed, (v) => { pushHistory(); f.printed = v; renderAll(); }, { ariaLabel: "Print" })));

  wrap.appendChild(fieldRow("X (mm)", inputNumber(internalToMm(f.geom.x), (v) => { pushHistory(); f.geom.x = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("Y (mm)", inputNumber(internalToMm(f.geom.y), (v) => { pushHistory(); f.geom.y = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("Width (mm)", inputNumber(internalToMm(f.geom.w), (v) => { pushHistory(); f.geom.w = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("Height (mm)", inputNumber(internalToMm(f.geom.h), (v) => { pushHistory(); f.geom.h = mmToInternal(v); renderAll(); })));
  wrap.appendChild(fieldRow("Rotation", selectOrientation(f.orientation, (v) => {
    pushHistory();
    f.orientation = v;
    renderObjects();
    renderUI();
  })));

  return wrap;
}

function buildFixedTextEntryModeSelect(field) {
  const currentMode = getTextEntryMode(field);
  return createMaterialSelect([
    { value: "fixed", label: "Fixed Text" },
    { value: "user", label: "User Entered Text" }
  ], currentMode, (nextValue) => {
    pushHistory();
    applyFixedTextEntryMode(field, nextValue);
    renderAll();
  });
}

function applyFixedTextEntryMode(field, nextModeRaw) {
  if (!field || field.fldType !== "FixedText") return;
  const nextMode = nextModeRaw === "user" ? "user" : "fixed";
  const currentValue = getStoredTextFieldValue(field);

  field.data.textEntryMode = nextMode;
  field.data.hasVarText = nextMode === "user";
  field.data.defaultValue = currentValue;
  field.calcData = currentValue;

  if (nextMode === "user") {
    field.data.staticAttr = "0";
    field.data.userEnterData = currentValue;
    return;
  }

  field.data.staticAttr = null;
  field.data.userEnterData = "";
  field.data.mask = "";
}

function setEditableTextFieldValue(field, nextValueRaw) {
  if (!field) return;
  const nextValue = String(nextValueRaw ?? "");

  if (field.fldType !== "FixedText") {
    field.data.userEnterData = nextValue;
    field.data.defaultValue = field.data.defaultValue || nextValue;
    field.calcData = nextValue;
    return;
  }

  field.data.defaultValue = nextValue;
  field.calcData = nextValue;

  if (isUserEnteredTextField(field)) {
    field.data.textEntryMode = "user";
    field.data.hasVarText = true;
    field.data.staticAttr = "0";
    field.data.userEnterData = nextValue;
    return;
  }

  field.data.textEntryMode = "fixed";
  field.data.hasVarText = false;
  field.data.staticAttr = null;
  field.data.userEnterData = "";
}

function createPanelActionButton(tagName, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--small";
  if (tagName === "md-filled-tonal-button") btn.classList.add("btn--tonal");
  else if (tagName === "md-text-button") btn.classList.add("btn--text");
  else if (tagName === "md-outlined-button") btn.classList.add("btn--ghost");
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildTextLikeProps(f) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  const displayValue = getFieldDisplayValue(f);
  const isDynamicPreviewField = f.fldType === "TimeText" || f.fldType === "DateText" || f.fldType === "OffsetDateText" || f.fldType === "CounterText";
  const valueInput = isDynamicPreviewField
    ? inputText(displayValue, () => {}, { readOnly: true })
    : inputText(displayValue, (v) => {
        pushHistory();
        setEditableTextFieldValue(f, v);
        renderObjects();
        renderUI();
        renderSelectionPanels();
      });

  if (isDynamicPreviewField) valueInput.dataset.dynamicPreviewValue = "1";
  wrap.appendChild(fieldRow("Value", valueInput));

  if (f.fldType === "CounterText") {
    const counter = f.data.counter ?? {};
    const noOfChars = Math.max(1, Math.round(parseCounterNumber(counter.noOfChars, 4) ?? 4));
    const maxValue = getCounterMaxValue(noOfChars);

    wrap.appendChild(fieldRow("Digits", inputNumber(noOfChars, (v) => {
      applyCounterFieldChange(f, (next) => {
        next.noOfChars = Math.max(1, Math.round(v));
      });
    }, { step: 1, integer: true, min: 1 })));

    wrap.appendChild(fieldRow("Start", inputNumber(parseCounterNumber(counter.startVal, 1) ?? 1, (v) => {
      applyCounterFieldChange(f, (next) => {
        next.startVal = String(Math.max(0, Math.round(v)));
      });
    }, { step: 1, integer: true, min: 0, max: maxValue })));

    wrap.appendChild(fieldRow("End", inputNumber(parseCounterNumber(counter.endVal, maxValue) ?? maxValue, (v) => {
      applyCounterFieldChange(f, (next) => {
        next.endVal = String(Math.max(0, Math.round(v)));
      });
    }, { step: 1, integer: true, min: 0, max: maxValue })));

    wrap.appendChild(fieldRow("Step", inputNumber(parseCounterNumber(counter.stepSize, 1) ?? 1, (v) => {
      applyCounterFieldChange(f, (next) => {
        next.stepSize = Math.max(1, Math.round(v));
      });
    }, { step: 1, integer: true, min: 1 })));

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = `Maximum value for ${noOfChars} digits: ${formatCounterValue(maxValue, noOfChars)}`;
    wrap.appendChild(note);

    const hr = document.createElement("div");
    hr.className = "hr";
    wrap.appendChild(hr);

    wrap.appendChild(fieldRow("Font size", inputNumber(getEffectiveTextPitch(f, 10), (v) => {
      pushHistory();
      f.text.pitch = Math.max(1, Math.round(v));
      refreshFieldCanvasPreview(f);
    }, { step: 1, integer: true, min: 1, live: true })));

    wrap.appendChild(fieldRow("XMag (%)", inputNumber(f.text.xMag ?? 100, (v) => {
      pushHistory();
      f.text.xMag = clamp(1, 100, Math.round(v));
      refreshFieldCanvasPreview(f);
    }, { step: 1, integer: true, min: 1, max: 100, live: true })));

    return wrap;
  }

  if (f.fldType === "DateText" || f.fldType === "TimeText" || f.fldType === "OffsetDateText") {
    let formatInput;

    if (f.fldType === "DateText" || f.fldType === "OffsetDateText") {
      const dateTypeValue = f.fldType === "OffsetDateText" ? "calculated" : "current";
      const dateTypeSelect = createMaterialSelect([
        { value: "current", label: "Current Date" },
        { value: "calculated", label: "Calculated Date" }
      ], dateTypeValue, (nextValue) => {
        const nextType = nextValue === "calculated" ? "OffsetDateText" : "DateText";
        if (nextType === f.fldType) return;
        pushHistory();
        f.fldType = nextType;
        f.data.dataType = guessDataType(nextType);
        if (nextType === "OffsetDateText") ensureCalculatedDateOffset(f);
        renderAll();
      });
      wrap.appendChild(fieldRow("Date type", dateTypeSelect));
    }

    if (f.fldType === "TimeText") {
      formatInput = selectStringOptions(getTimeFormatPreset(f.data.defaultValue || ""), TIME_TEXT_FORMATS, (v) => {
        pushHistory();
        f.data.defaultValue = buildTimeTemplateFormat(v, getTimeSeparator(f.data.defaultValue || ""));
        refreshSelectedDynamicFieldPreview();
      });
    } else {
      formatInput = selectDateFormat(
        getDateFormatPreset(f.data.defaultValue || ""),
        f.data.dateLocale || inferDateLocale(f.fldType, f.data.defaultValue, f.calcData),
        (formatValue, locale) => {
          pushHistory();
          f.data.defaultValue = buildDateTemplateFormat(formatValue, getDateSeparator(f.data.defaultValue || ""));
          f.data.dateLocale = locale;
          refreshSelectedDynamicFieldPreview();
        }
      );
    }

    wrap.appendChild(fieldRow(f.fldType === "TimeText" ? "Time format" : "Date format", formatInput));

    if (f.fldType === "TimeText") {
      wrap.appendChild(fieldRow("Separator", selectTimeSeparator(getTimeSeparator(f.data.defaultValue || ""), (v) => {
        pushHistory();
        f.data.defaultValue = buildTimeTemplateFormat(getTimeFormatPreset(f.data.defaultValue || ""), v);
        refreshSelectedDynamicFieldPreview();
      })));
    }

    if (f.fldType === "DateText" || f.fldType === "OffsetDateText") {
      wrap.appendChild(fieldRow("Separator", selectDateSeparator(getDateSeparator(f.data.defaultValue || ""), (v) => {
        pushHistory();
        f.data.defaultValue = buildDateTemplateFormat(getDateFormatPreset(f.data.defaultValue || ""), v);
        refreshSelectedDynamicFieldPreview();
      })));
    }

    if (f.fldType === "OffsetDateText") {
      wrap.appendChild(fieldRow("Offset", selectOffsetName(f.data.offsetRef, (v) => {
        pushHistory();
        f.data.offsetRef = v || null;
        refreshSelectedDynamicFieldPreview();
      })));
    }
  }

  wrap.appendChild(fieldRow("Font size", inputNumber(getEffectiveTextPitch(f, 10), (v) => {
    pushHistory();
    f.text.pitch = Math.max(1, Math.round(v));
    refreshFieldCanvasPreview(f);
  }, { step: 1, integer: true, min: 1, live: true })));

  wrap.appendChild(fieldRow("XMag (%)", inputNumber(f.text.xMag ?? 100, (v) => {
    pushHistory();
    f.text.xMag = clamp(1, 100, Math.round(v));
    refreshFieldCanvasPreview(f);
  }, { step: 1, integer: true, min: 1, max: 100, live: true })));

  return wrap;
}

function buildBarcodeProps(f) {
  const wrap = document.createElement("div");
  wrap.className = "form";

  wrap.appendChild(fieldRow("QuietMargin", inputNumber(f.barcode.quietMargin ?? 0, (v) => {
    pushHistory();
    f.barcode.quietMargin = Math.max(0, Math.round(v));
  })));

  wrap.appendChild(fieldRow("Symbol size", selectSymbolSize(f.barcode.dataMatrix.symbolSize, (v) => {
    pushHistory();
    const nextSymbolSize = normalizeDataMatrixSymbolSizeValue(v, "22X22");
    if (DM_PROFILES[nextSymbolSize]) applyDmProfile(f, nextSymbolSize);
    else f.barcode.dataMatrix.symbolSize = nextSymbolSize;
    syncDataMatrixGeomToModuleSize(f);
    renderAll();
  })));

  wrap.appendChild(fieldRow("Module size (mm)", selectDataMatrixModuleSize(f.barcode.dataMatrix.moduleSize, (v) => {
    pushHistory();
    f.barcode.dataMatrix.moduleSize = normalizeDataMatrixModuleSizeValue(v);
    syncDataMatrixGeomToModuleSize(f);
    renderAll();
  })));

  return wrap;
}

function buildDataMatrixPanel(f) {
  const dm = f.barcode.dataMatrix;
  const wrap = document.createElement("div");
  wrap.className = "form";

  const profileSelect = createMaterialSelect([
    { value: "", label: "(none)" },
    { value: "22X22", label: "22X22" },
    { value: "36X36", label: "36X36" }
  ], "", () => {});
  wrap.appendChild(fieldRow("Profile", profileSelect));

  const applyBtn = createPanelActionButton("md-filled-tonal-button", "Apply profile", () => {
    const p = profileSelect.value;
    if (!p) return;
    pushHistory();
    applyDmProfile(f, p);
    syncDataMatrixGeomToModuleSize(f);
    renderAll();
  });
  wrap.appendChild(applyBtn);

  const val = validateDmProfile(f, dm.symbolSize);
  const vcard = document.createElement("div");
  vcard.className = "card";
  vcard.innerHTML = `<div class="card__head"><div class="card__title">Validation</div><div class="pill">${val.length ? "!" : "OK"}</div></div>`;
  const vbody = document.createElement("div");
  vbody.className = "muted";
  vbody.style.whiteSpace = "pre-wrap";
  vbody.textContent = val.length ? val.map((x) => "- " + x).join("\n") : "Profile matches the current SymbolSize.";
  vcard.appendChild(vbody);
  wrap.appendChild(vcard);

  const segCard = document.createElement("div");
  segCard.className = "card";

  const segHead = document.createElement("div");
  segHead.className = "card__head";
  const segTitle = document.createElement("div");
  segTitle.className = "card__title";
  segTitle.textContent = "Segments";
  const segActions = document.createElement("div");
  segActions.className = "smallRow";
  const segAddBtn = createPanelActionButton("md-filled-tonal-button", "Add segment", () => {
    pushHistory();
    dm.segments.push({ index: dm.segments.length, srcField: null, defaultValue: "", dataType: 5 });
    normalizeDmSegments(dm);
    renderAll();
  });
  segActions.appendChild(segAddBtn);
  segHead.appendChild(segTitle);
  segHead.appendChild(segActions);
  segCard.appendChild(segHead);

  const segWrap = document.createElement("div");
  segWrap.style.display = "flex";
  segWrap.style.flexDirection = "column";
  segWrap.style.gap = "8px";

  dm.segments.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "card";
    row.style.padding = "15px";
    row.innerHTML = `
      <div class="card__head" style="margin-bottom:6px">
        <div class="card__title">#${idx}</div>
        <div class="smallRow">
          <button class="btn btn--ghost btn--small" type="button" aria-label="Move segment up" data-act="up">
            <img class="topbarAction__icon" src="./resourses/arrow_upward_24dp.svg" alt="" aria-hidden="true"/>
          </button>
          <button class="btn btn--ghost btn--small" type="button" aria-label="Move segment down" data-act="down">
            <img class="topbarAction__icon" src="./resourses/arrow_downward_24dp.svg" alt="" aria-hidden="true"/>
          </button>
          <button class="btn btn--danger btn--small" type="button" aria-label="Delete segment" data-act="del">
            <img class="topbarAction__icon" src="./resourses/delete_24dp.svg" alt="" aria-hidden="true"/>
          </button>
        </div>
      </div>
    `;

    const grid = document.createElement("div");
    grid.className = "card__grid";

    const srcSel = createMaterialSelect(
      [{ value: "", label: "(none)" }, ...state.fields.map((ff) => ({ value: ff.name, label: ff.name }))],
      s.srcField ?? "",
      (nextValue) => { pushHistory(); s.srcField = nextValue || null; renderAll(); }
    );

    const defInp = inputText(s.defaultValue || "", (nextValue) => {
      pushHistory();
      s.defaultValue = nextValue;
      refreshCanvasPreviews();
    });

    grid.appendChild(labeledMini("SrcFieldName", srcSel));
    grid.appendChild(labeledMini("Default", defInp));
    row.appendChild(grid);

    row.querySelectorAll("button[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        pushHistory();
        if (act === "del") dm.segments.splice(idx, 1);
        if (act === "up" && idx > 0) [dm.segments[idx - 1], dm.segments[idx]] = [dm.segments[idx], dm.segments[idx - 1]];
        if (act === "down" && idx < dm.segments.length - 1) [dm.segments[idx + 1], dm.segments[idx]] = [dm.segments[idx], dm.segments[idx + 1]];
        normalizeDmSegments(dm);
        renderAll();
      });
    });

    segWrap.appendChild(row);
  });

  segCard.appendChild(segWrap);
  wrap.appendChild(segCard);

  return wrap;
}

function renderHiddenEditor() {
  if (!state.xmlDoc) { elHiddenEditor.innerHTML = ""; return; }

  const hidden = state.fields.filter((f) => !f.printed);
  elHiddenEditor.innerHTML = "";

  hidden.forEach((f) => {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card__head";
    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "card__title";
    title.textContent = f.name;
    const meta = document.createElement("div");
    meta.className = "card__meta";
    meta.textContent = `${getFieldSubtypeLabel(f)} - Displayed=0`;
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "smallRow";
    const selectBtn = createPanelActionButton("md-text-button", "Select", () => {
      selectField(f.name);
      renderAll();
    });
    actions.appendChild(selectBtn);

    head.appendChild(info);
    head.appendChild(actions);

    const grid = document.createElement("div");
    grid.className = "card__grid";

    const inpVal = inputText(getStoredTextFieldValue(f), (nextValue) => {
      pushHistory();
      setEditableTextFieldValue(f, nextValue);
      refreshCanvasPreviews();
    });

    grid.appendChild(labeledMini("Value", inpVal));

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
    note.textContent = "No DateOffset entries in file.";
    elOffsetsEditor.appendChild(note);
    return;
  }

  state.dateOffsets.forEach((o, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card__head";
    const titleWrap = document.createElement("div");
    titleWrap.appendChild(inputText(o.name, (value) => {
      if (value === o.name) return;
      pushHistory();
      if (!renameDateOffset(o, value)) {
        renderOffsetsEditor();
        renderSelectionPanels();
        return;
      }
      renderAll();
    }));

    const actions = document.createElement("div");
    actions.className = "smallRow";
    const delBtn = createPanelActionButton("md-outlined-button", "Delete", () => {
      pushHistory();
      state.dateOffsets.splice(idx, 1);
      state.dateOffsetsDirty = true;
      renderOffsetsEditor();
      renderSelectionPanels();
      refreshCanvasPreviews();
    });
    actions.appendChild(delBtn);

    head.appendChild(titleWrap);
    head.appendChild(actions);
    card.appendChild(head);
    card.appendChild(document.createElement("div")).className = "hr";

    const grid = document.createElement("div");
    grid.className = "card__grid";

    const inY = mkNum(o.default.y ?? 0, (v) => {
      pushHistory();
      o.default.y = Math.round(v);
      o.current = getComputedDateOffsetCurrent(o);
      state.dateOffsetsDirty = true;
      renderOffsetsEditor();
      renderSelectionPanels();
      refreshCanvasPreviews();
    });
    const inM = mkNum(o.default.m ?? 0, (v) => {
      pushHistory();
      o.default.m = Math.round(v);
      o.current = getComputedDateOffsetCurrent(o);
      state.dateOffsetsDirty = true;
      renderOffsetsEditor();
      renderSelectionPanels();
      refreshCanvasPreviews();
    });
    const inD = mkNum(o.default.d ?? 0, (v) => {
      pushHistory();
      o.default.d = Math.round(v);
      o.current = getComputedDateOffsetCurrent(o);
      state.dateOffsetsDirty = true;
      renderOffsetsEditor();
      renderSelectionPanels();
      refreshCanvasPreviews();
    });

    grid.appendChild(labeledMini("Year", inY));
    grid.appendChild(labeledMini("Month", inM));
    grid.appendChild(labeledMini("Day", inD));

    card.appendChild(grid);

    const current = getComputedDateOffsetCurrent(o);
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = `Current offset: ${pad2(current.d)}.${pad2(current.m)}.${String(current.y)}`;
    card.appendChild(note);

    elOffsetsEditor.appendChild(card);
  });
}

// ---------- Selection / ops ----------
function selectField(name, opts = {}) {
  const additive = !!opts.additive;
  const toggle = !!opts.toggle;

  if (!name) {
    if (!additive) setSelectedNames([]);
    renderSelectionPanels();
    renderFieldLists();
    return;
  }

  if (!additive) {
    setSelectedNames([name], name);
    renderSelectionPanels();
    renderFieldLists();
    return;
  }

  let names = getSelectedNames();
  if (toggle && names.includes(name)) names = names.filter((item) => item !== name);
  else if (!names.includes(name)) names.push(name);

  setSelectedNames(names, name);
  renderSelectionPanels();
  renderFieldLists();
}

function renameField(field, nextNameRaw) {
  if (!field) return;

  const prevName = field.name;
  const nextName = (nextNameRaw ?? "").trim();

  if (!nextName) {
    alert("Field name cannot be empty.");
    renderSelectionPanels();
    return;
  }
  if (nextName === prevName) return;

  const hasConflict = state.fields.some(f => f !== field && f.name === nextName);
  if (hasConflict) {
    alert(`Field "${nextName}" already exists.`);
    renderSelectionPanels();
    return;
  }

  pushHistory();

  field.name = nextName;

  state.fieldByName.delete(prevName);
  state.fieldByName.set(nextName, field);

  if (state.selectedName === prevName) state.selectedName = nextName;
  if (Array.isArray(state.selectedNames)) {
    state.selectedNames = state.selectedNames.map((name) => name === prevName ? nextName : name);
  }

  state.fields.forEach(f => {
    const dm = f.barcode?.dataMatrix;
    if (!dm) return;
    dm.segments.forEach(s => {
      if (s.srcField === prevName) s.srcField = nextName;
    });
  });

  renderAll();
}

function createDateOffset(name = null, defaultOffset = null) {
  const nextName = name || uniqueName("offset", state.dateOffsets.map(o => o.name));
  const offset = {
    name: nextName,
    default: {
      y: toInt(defaultOffset?.y, 0),
      m: toInt(defaultOffset?.m, 0),
      d: toInt(defaultOffset?.d, 0)
    },
    current: getComputedDateOffsetCurrent({ default: defaultOffset || { y: 0, m: 0, d: 0 } })
  };

  state.dateOffsets.push(offset);
  state.dateOffsetsLoaded = true;
  state.dateOffsetsDirty = true;
  return offset;
}

function renameDateOffset(offset, nextNameRaw) {
  if (!offset) return false;

  const prevName = offset.name;
  const nextName = String(nextNameRaw ?? "").trim();

  if (!nextName) {
    alert("Offset name cannot be empty.");
    return false;
  }
  if (nextName === prevName) return true;

  const hasConflict = state.dateOffsets.some((item) => item !== offset && item.name === nextName);
  if (hasConflict) {
    alert(`Offset "${nextName}" already exists.`);
    return false;
  }

  offset.name = nextName;
  state.dateOffsetsDirty = true;

  state.fields.forEach((field) => {
    if (field.fldType !== "OffsetDateText") return;
    if (field.data.offsetRef === prevName) field.data.offsetRef = nextName;
  });

  return true;
}

function ensureCalculatedDateOffset(field) {
  if (!field) return null;

  const existing = state.dateOffsets.find((offset) => offset.name === field.data.offsetRef);
  if (existing) return existing;
  if (state.dateOffsets.length) {
    field.data.offsetRef = state.dateOffsets[0].name;
    return state.dateOffsets[0];
  }

  const created = createDateOffset();
  field.data.offsetRef = created.name;
  return created;
}

function deleteSelected() {
  const names = getSelectedNames();
  if (!names.length) return;

  pushHistory();

  const removed = new Set(names);
  state.fields = state.fields.filter((field) => !removed.has(field.name));
  names.forEach((name) => state.fieldByName.delete(name));

  // clear references in DM segments
  state.fields.forEach((field) => {
    const dm = field.barcode?.dataMatrix;
    if (!dm) return;
    dm.segments.forEach((segment) => {
      if (removed.has(segment.srcField)) segment.srcField = null;
    });
  });

  setSelectedNames([]);
  renderAll();
}

function addField(fldType) {
  if (!state.xmlDoc) { alert("Open a CIFF file first."); return; }

  pushHistory();

  const existingNames = state.fields.map(f => f.name);
  const base = fldType === "Barcode" ? "FieldDM" : "Field";
  const name = uniqueName(base, existingNames);

  const geom = { x: mmToInternal(2), y: mmToInternal(2), w: mmToInternal(12), h: mmToInternal(4) };
  if (fldType === "Barcode") { geom.w = mmToInternal(12); geom.h = mmToInternal(12); }

  const field = {
    sourceName: null,
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
      staticAttr: (fldType === "FixedText" ? null : "0"),
      parseAttr: (fldType === "DateText" || fldType === "TimeText" || fldType === "OffsetDateText") ? "1" : null,
      hasVarText: false,
      textEntryMode: (fldType === "FixedText" ? "fixed" : null),
      userEnterData: "",
      mask: "",
      offsetRef: (fldType === "OffsetDateText" ? (state.dateOffsets[0]?.name ?? null) : null),
      dateLocale: ((fldType === "DateText" || fldType === "OffsetDateText") ? "en" : null),
      counter: {
        noOfChars: (fldType === "CounterText" ? 4 : null),
        significance: 0,
        startVal: (fldType === "CounterText" ? "1" : null),
        endVal: (fldType === "CounterText" ? "9999" : null),
        stepSize: (fldType === "CounterText" ? 1 : null),
        clrStCntType: ""
      }
    },
    text: { pitch: 10, xMag: 100 },
    barcode: null,
    _konva: null
  };

  if (fldType === "FixedText") { field.calcData = "TEXT"; field.data.defaultValue = "TEXT"; }
  if (fldType === "DateText") { field.data.defaultValue = buildDateTemplateFormat("dd/MM/yy", "/"); }
  if (fldType === "OffsetDateText") {
    field.data.defaultValue = buildDateTemplateFormat("dd/MM/yy", "/");
    ensureCalculatedDateOffset(field);
  }
  if (fldType === "TimeText") { field.data.defaultValue = buildTimeTemplateFormat("HH:mm", ":"); }
  if (fldType === "CounterText") normalizeCounterField(field, { preserveCurrent: false });

  if (fldType === "Barcode") {
    field.barcode = {
      clsid: "{7A4AA4CF-F5CD-11D4-8DAE-0050DAFE8A9F}",
      quietMargin: 0,
      bcH: field.geom.h,
      dataMatrix: { moduleSize: 0.50, symbolSize: "22X22", segments: [] }
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
  const profile = DM_PROFILES[normalizeDataMatrixSymbolSizeValue(profileName, "22X22")];
  if (!profile) return;
  const dm = dmField.barcode?.dataMatrix;
  if (!dm) return;

  dm.symbolSize = profile.symbolSize;

  if (profile.disallowedFields?.length) {
    dm.segments = dm.segments.filter(s => !profile.disallowedFields.includes(s.srcField));
    purgeFieldsFromTemplate(profile.disallowedFields);
  }

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
      f.data.hasVarText = false;
      f.data.textEntryMode = "fixed";
      f.data.staticAttr = null;
      f.data.userEnterData = "";
      f.data.mask = "";
      f.calcData = value;
    });
  }
}

function validateDmProfile(dmField, symbolSize) {
  const p = DM_PROFILES[normalizeDataMatrixSymbolSizeValue(symbolSize, "22X22")];
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

function purgeFieldsFromTemplate(names) {
  const namesToRemove = [...new Set((names || []).filter(Boolean))];
  if (!namesToRemove.length) return;

  const removed = new Set(namesToRemove);
  state.fields = state.fields.filter(f => !removed.has(f.name));
  namesToRemove.forEach(name => state.fieldByName.delete(name));

  state.fields.forEach(f => {
    const dm = f.barcode?.dataMatrix;
    if (!dm) return;
    dm.segments = dm.segments.filter(s => !removed.has(s.srcField));
    normalizeDmSegments(dm);
  });

  if (state.selectedName && removed.has(state.selectedName)) state.selectedName = null;
  if (Array.isArray(state.selectedNames)) {
    state.selectedNames = state.selectedNames.filter((name) => !removed.has(name));
  }
  setSelectedNames(state.selectedNames, state.selectedName);
}

function getAutoHiddenFieldGeom() {
  const columnXmm = internalToMm(getCanvasInternalWidth() || mmToInternal(32.67)) + 1.5;
  const baseYmm = 1.0;
  const gapYmm = 1.0;
  const widthMm = 10;
  const heightMm = 3;
  let nextYmm = baseYmm;

  state.fields
    .filter((field) => !field.printed && Math.abs(internalToMm(field.geom.x) - columnXmm) <= 2)
    .forEach((field) => {
      const fieldBottomMm = internalToMm(field.geom.y) + internalToMm(field.geom.h) + gapYmm;
      if (fieldBottomMm > nextYmm) nextYmm = fieldBottomMm;
    });

  return {
    x: mmToInternal(columnXmm),
    y: mmToInternal(nextYmm),
    w: mmToInternal(widthMm),
    h: mmToInternal(heightMm)
  };
}

function ensureFieldExists(name, fixedValueOrNull) {
  if (state.fieldByName.has(name)) return;

  const geom = getAutoHiddenFieldGeom();
  const autoValue = fixedValueOrNull ?? (name === "GTIN" ? "00000000000000" : "");
  const f = {
    sourceName: null,
    name,
    fldType: "FixedText",
    printed: false,
    geom,
    ln: 1,
    orientation: 0,
    calcData: autoValue,
    data: {
      dataType: 0,
      defaultValue: autoValue,
      maxChars: autoValue ? autoValue.length : null,
      fixedLen: false,
      staticAttr: null,
      parseAttr: null,
      hasVarText: false,
      textEntryMode: "fixed",
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

