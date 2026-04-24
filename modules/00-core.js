/* app.js - CIFF Editor (Videojet / Clarisoft) with LOSSLESS save (2-line, CRLF)
   Key changes for this save model:
   - Lossless save keeps original formatting and only patches specific parts.
   - Existing fields are patched non-invasively: no auto insert/remove of VarText, FixedLen, MaxNoOfChars, etc.
     (we only change them if they already exist in that field block)
   - DateOffsets do not trigger Header rebuild unless they were loaded and marked dirty.
   - Save output stays UTF-16LE + BOM + CRLF + 2 lines (+ final CRLF).
   - OffsetDate references are validated before saving; missing DateOffset blocks save.

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
    requiredSegments: ["\u04211","GTIN","\u04212","SN","\u04213","KRIPTO"],
    fixedFields: { "\u04211":"~101", "\u04212":"21", "\u04213":"~d02993" },
    disallowedFields: ["C4","KRIPTO2"]
  },
  "36X36": {
    symbolSize: "36X36",
    requiredSegments: ["\u04211","GTIN","\u04212","SN","\u04213","KRIPTO","C4","KRIPTO2"],
    fixedFields: { "\u04211":"~101", "\u04212":"21", "\u04213":"~d02991", "C4":"~d02992" }
  }
};
const DM_HELPER_FIELD_NAMES = [...new Set(Object.values(DM_PROFILES).flatMap((profile) => [
  ...(profile.requiredSegments || []),
  ...(profile.disallowedFields || [])
]))];

const DATA_MATRIX_SYMBOLS = [
  {
    name: "22X22",
    symbolRows: 22,
    symbolCols: 22,
    dataRegionRows: 20,
    dataRegionCols: 20,
    regionRows: 1,
    regionCols: 1,
    dataCodewords: 30,
    errorCodewords: 20
  },
  {
    name: "36X36",
    symbolRows: 36,
    symbolCols: 36,
    dataRegionRows: 16,
    dataRegionCols: 16,
    regionRows: 2,
    regionCols: 2,
    dataCodewords: 86,
    errorCodewords: 42
  }
];
const DATA_MATRIX_SYMBOLS_BY_NAME = new Map(DATA_MATRIX_SYMBOLS.map((info) => [info.name, {
  ...info,
  dataRows: info.dataRegionRows * info.regionRows,
  dataCols: info.dataRegionCols * info.regionCols
}]));
const DATA_MATRIX_MODULE_SIZES = Array.from({ length: 60 }, (_, index) => Number((((index + 1) / 12)).toFixed(2)));
const ALLOWED_ORIENTATIONS = [0, 90, 180, 270];
const TIME_TEXT_FORMATS = ["HH:mm", "hh:mm", "h:mm", "HH:mm:ss", "h:m:s", "hh:mm:ss"];
const TIME_SEPARATOR_OPTIONS = [
  { value: ":", label: ":" },
  { value: " ", label: "\u041f\u0440\u043e\u0431\u0435\u043b" },
  { value: ",", label: "," },
  { value: "-", label: "-" },
  { value: "\\", label: "\\" },
  { value: "", label: "\u0411\u0435\u0437 \u0441\u0435\u043f\u0430\u0440\u0430\u0442\u043e\u0440\u0430" }
];
const DATE_TEXT_FORMAT_OPTIONS = [
  { value: "dd/MMM::en", format: "dd/MMM", locale: "en", label: "dd/MMM (EN)" },
  { value: "dd/MM/yy::en", format: "dd/MM/yy", locale: "en", label: "dd/MM/yy" },
  { value: "dd/MM/yyyy::en", format: "dd/MM/yyyy", locale: "en", label: "dd/MM/yyyy" },
  { value: "dd/MMM/yyyy::en", format: "dd/MMM/yyyy", locale: "en", label: "dd/MMM/yyyy (EN)" },
  { value: "dd/MMM/yyyy::ru", format: "dd/MMM/yyyy", locale: "ru", label: "dd/MMM/yyyy (RU)" },
  { value: "MM/dd/yy::en", format: "MM/dd/yy", locale: "en", label: "MM/dd/yy" },
  { value: "MMM/yy::en", format: "MMM/yy", locale: "en", label: "MMM/yy (EN)" },
  { value: "MMM/yy::ru", format: "MMM/yy", locale: "ru", label: "MMM/yy (RU)" }
];
const DATE_SEPARATOR_OPTIONS = [
  { value: "/", label: "/" },
  { value: " ", label: "\u041f\u0440\u043e\u0431\u0435\u043b" },
  { value: ":", label: ":" },
  { value: ",", label: "," },
  { value: "-", label: "-" },
  { value: "\\", label: "\\" },
  { value: ".", label: "." },
  { value: "", label: "\u0411\u0435\u0437 \u0441\u0435\u043f\u0430\u0440\u0430\u0442\u043e\u0440\u0430" }
];
const MONTH_NAMES = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["\u044f\u043d\u0432", "\u0444\u0435\u0432", "\u043c\u0430\u0440", "\u0430\u043f\u0440", "\u043c\u0430\u0439", "\u0438\u044e\u043d", "\u0438\u044e\u043b", "\u0430\u0432\u0433", "\u0441\u0435\u043d", "\u043e\u043a\u0442", "\u043d\u043e\u044f", "\u0434\u0435\u043a"]
};
const DATE_MONTH_NAMES = MONTH_NAMES;

const EMPTY_TEMPLATE_PRINTER_MODELS = ["6530", "6420", "6330", "6320"];
const EMPTY_TEMPLATE_PRINT_MODES = ["Intermittent", "Continuous"];
const TEMPLATE_TARGET_PRINTER_MODELS = EMPTY_TEMPLATE_PRINTER_MODELS.map((model) => `DataFlex ${model}(53mm)`);
const DEFAULT_TEMPLATE_TARGET_PRINTER_MODEL = TEMPLATE_TARGET_PRINTER_MODELS[0];
const EMPTY_TEMPLATE_CLST_VERSION_INFO = "PyOA!LMe37jF5gGD_OEeQJPAIR3Et2HVCOk4RKDB93Hl9AjBVgIOzL2x64vRUW8LPDPLLM!BMqKMGOFnVSVSNLLLnTAS2NyCJtJUD3VGHDbN6K76iHU!QGk8UrNGi8Uz9Tc9QVCIr2TyL6eAUTMUCVHm8EcI0yABuRMv7N4LVz1";
const EMPTY_TEMPLATE_SUBIMAGE = {
  imageWidth: 5333,
  imageHeight: 7500,
  maxImageWidth: 5333,
  maxImageHeight: 7500,
  xRes: "0.120000",
  currentOrientation: 0
};

// ---------- State ----------
let state = {
  xmlDoc: null,
  xmlText: "",              // original text (as loaded)
  line1: "",                // xml declaration line (kept)
  line2: "",                // ImageDesign single line (kept)
  lineEnding: "\r\n",        // we'll always output CRLF

  docMeta: {
    version: null,
    designedFor: "",
    clStVersionInfo: "",
    printerModel: DEFAULT_TEMPLATE_TARGET_PRINTER_MODEL,
    printMode: EMPTY_TEMPLATE_PRINT_MODES[0]
  },
  subImage: { imageReference: "1", width: 0, height: 0, maxWidth: 0, maxHeight: 0, xRes: 0.12, orientation: 0 },

  dateOffsets: [],          // parsed from Header DateOffset
  dateOffsetsLoaded: false,
  dateOffsetsDirty: false,

  fields: [],               // parsed from SubImage Field
  fieldByName: new Map(),

  selectedName: null,
  selectedNames: [],
  showHiddenOnCanvas: false,

  validation: {
    invalidPrintableFieldNames: []
  }
};

function getTextEntryMode(field) {
  if (!field?.data) return "fixed";
  if (field.data.textEntryMode === "user" || field.data.textEntryMode === "fixed") return field.data.textEntryMode;
  if (field.data.hasVarText === true) return "user";
  if (field.data.hasVarText === false) return "fixed";
  if (
    field.fldType === "FixedText" &&
    field.data.staticAttr === "0" &&
    (((field.data.userEnterData ?? "") !== "") || ((field.data.mask ?? "") !== ""))
  ) {
    return "user";
  }
  return "fixed";
}

function isUserEnteredTextField(field) {
  return field?.fldType === "FixedText" && getTextEntryMode(field) === "user";
}

function wantsVarTextStructure(field) {
  if (!field?.data) return false;
  if (field.fldType === "FixedText") return isUserEnteredTextField(field);
  return ((field.data.userEnterData ?? "") !== "") || ((field.data.mask ?? "") !== "");
}

function getStoredTextFieldValue(field) {
  if (!field) return "";
  if (isUserEnteredTextField(field)) {
    return field.data.userEnterData || field.data.defaultValue || field.calcData || "";
  }
  return field.calcData || field.data?.defaultValue || field.data?.userEnterData || "";
}

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
const elTemplateSizePanel = $("templateSizePanel");
const elTemplateTargetPanel = $("templateTargetPanel");
const elBtnSave = $("btnSave");

const elDmEmpty = $("dmEmpty");
const elDmPanel = $("dmPanel");

const elHiddenEditor = $("hiddenEditor");
const elOffsetsEditor = $("offsetsEditor");

const elStatusLeft = $("statusLeft");
const elStatusRight = $("statusRight");
const elCanvasHost = $("canvasHost");
const elRulerTop = $("rulerTop");
const elRulerLeft = $("rulerLeft");

const elToggleGrid = $("toggleGrid");
const elToggleSnap = $("toggleSnap");
const elZoomRange = $("zoomRange");
const elZoomLabel = $("zoomLabel");
const elNewTemplateModal = $("newTemplateModal");
const elNewTemplatePrinterModel = $("newTemplatePrinterModel");
const elNewTemplatePrintMode = $("newTemplatePrintMode");
const elNewTemplateWidth = $("newTemplateWidth");
const elNewTemplateHeight = $("newTemplateHeight");
// ---------- Konva ----------
let stage, gridLayer, objLayer, uiLayer, transformer, selectionRect;
let zoomPct = 100;
let isSpaceDown = false;
let isPanning = false;
let panStart = null;
let isSelectionBoxActive = false;
let selectionStart = null;
let selectionBoxAdditive = false;

function normalizePrintMode(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return EMPTY_TEMPLATE_PRINT_MODES.find((mode) => mode.toLowerCase() === raw) || EMPTY_TEMPLATE_PRINT_MODES[0];
}

function normalizePrinterModel(value) {
  return String(value ?? "").trim() || DEFAULT_TEMPLATE_TARGET_PRINTER_MODEL;
}

function buildDesignedForLabel(printerModel, printMode) {
  return `${normalizePrinterModel(printerModel)} - ${normalizePrintMode(printMode)}`;
}

function parseDesignedForMeta(designedFor) {
  const raw = String(designedFor ?? "").trim();
  const match = raw.match(/^(.*?)(?:\s*-\s*(Intermittent|Continuous))?$/i);
  const printerModel = normalizePrinterModel(match?.[1] || raw);
  const printMode = normalizePrintMode(match?.[2]);

  return {
    printerModel,
    printMode,
    designedFor: buildDesignedForLabel(printerModel, printMode)
  };
}

globalThis.CIFF_EDITOR_CORE_READY = true;

