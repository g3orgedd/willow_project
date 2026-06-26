/* UI i18n dictionary and helpers.
   This module is intentionally standalone: adding it does not translate the app
   until it is loaded and existing UI strings are replaced with t("key").

   Keep technical CIFF/XML values untranslated: Field types, tag names,
   SymbolSize values, printer modes, and date/time format tokens.
*/

const UI_DEFAULT_LANGUAGE = "en";
const UI_LANGUAGE_STORAGE_KEY = "willowXml.uiLanguage";
const UI_LANGUAGES = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ru", label: "Русский", shortLabel: "RU" }
];

const UI_TRANSLATIONS = {
  en: {
    "app.title": "Willow XML CIFF Editor",

    "topbar.create": "Create",
    "topbar.open": "Open",
    "topbar.save": "Save",
    "topbar.undo": "Undo",
    "topbar.redo": "Redo",
    "topbar.pan": "Pan",
    "topbar.grid": "Grid",
    "topbar.snap": "Snap",
    "topbar.align": "Align elements",
    "topbar.alignShort": "Align",
    "topbar.zoom": "Zoom",

    "panel.tools.title": "Tools",
    "panel.printed.title": "Printed",
    "panel.printed.subtitle": "Fields",
    "panel.hidden.title": "Hidden",
    "panel.hidden.subtitle": "Fields",
    "panel.search.placeholder": "Search fields",
    "panel.showHidden": "Show hidden fields",
    "panel.hideHidden": "Hide hidden fields",

    "tool.datamatrix": "DataMatrix",
    "tool.text": "Text",
    "tool.date": "Date",
    "tool.time": "Time",
    "tool.offset": "Offset",
    "tool.counter": "Counter",

    "tab.object": "Object",
    "tab.template": "Template",
    "tab.datamatrix": "DataMatrix",
    "tab.offsets": "Offsets",
    "tab.validation": "Validation",
    "tab.advanced": "Advanced",

    "object.title": "Selected object",
    "object.empty": "No object selected",
    "object.emptyHint": "Select an object on the canvas or in the field list.",
    "object.delete": "Delete selected",

    "field.name": "Name",
    "field.printed": "Printed",
    "field.type": "Type",
    "field.x": "X (mm)",
    "field.y": "Y (mm)",
    "field.width": "Width (mm)",
    "field.height": "Height (mm)",
    "field.orientation": "Orientation",
    "field.rotation": "Rotation",
    "field.value": "Value",
    "field.fontSize": "Font size",
    "field.xMag": "XMag (%)",
    "field.maxCharacters": "Max characters",
    "field.printOutput": "Print output",
    "field.fixedText": "Fixed Text",
    "field.userEnteredText": "User Entered Text",
    "field.dateType": "Date type",
    "field.currentDate": "Current Date",
    "field.calculatedDate": "Calculated Date",
    "field.dateFormat": "Date format",
    "field.timeFormat": "Time format",
    "field.separator": "Separator",
    "field.offset": "Offset",

    "counter.digits": "Digits",
    "counter.start": "Start",
    "counter.end": "End",
    "counter.step": "Step",
    "counter.maxValue": "Maximum value for {digits} digits: {value}",

    "datamatrix.title": "DataMatrix",
    "datamatrix.empty": "No DataMatrix object found.",
    "datamatrix.emptyHint": "Create a new DataMatrix or select an existing one.",
    "datamatrix.quietMargin": "QuietMargin",
    "datamatrix.moduleSize": "Module size",
    "datamatrix.symbolSize": "Symbol size",
    "datamatrix.profile": "Profile",
    "datamatrix.applyProfile": "Apply profile",
    "datamatrix.segments": "Segments",
    "datamatrix.addSegment": "Add segment",
    "datamatrix.validationOk": "Profile matches the current SymbolSize.",

    "template.size.title": "Template size",
    "template.printer.title": "Printer settings",
    "template.width": "Width (mm)",
    "template.height": "Height (mm)",
    "template.printerModel": "Printer model",
    "template.printMode": "Print mode",
    "template.sizeLimit": "Limit: {maxWidth} x {maxHeight} mm | Used: {usedWidth} x {usedHeight} mm",
    "template.designedFor": "Header DesignedFor: {value}",

    "offsets.title": "Date offsets",
    "offsets.subtitle": "Manage reusable calculated dates.",
    "offsets.add": "Add offset",
    "offsets.empty": "No DateOffset entries in file.",
    "offsets.current": "Current offset: {date}",
    "offsets.year": "Year",
    "offsets.month": "Month",
    "offsets.day": "Day",

    "validation.title": "Validation",
    "validation.empty": "Validation checks will appear here.",

    "advanced.title": "XML / Advanced",
    "advanced.empty": "Advanced XML parameters will appear here.",
    "advanced.hiddenEditor": "Hidden field editor",
    "advanced.hiddenEditorHint": "Edit values for non-printed fields.",
    "language.label": "Language",
    "language.en": "English",
    "language.ru": "Russian",
    "grid.size": "Grid size",

    "dialog.createTemplate.title": "Create template",
    "dialog.createTemplate.subtitle": "Choose printer model, print mode, and substrate size.",
    "dialog.createTemplate.sizeHint": "For 53 mm print heads the supported range is 53.33 by 75.00 mm.",
    "dialog.cancel": "Cancel",
    "dialog.close": "Close",
    "dialog.create": "Create",

    "mobile.panels": "Panels",
    "mobile.panelsHint": "Tools and settings",

    "status.openFile": "Open a CIFF file (.ciff/.xml).",
    "status.noTemplate": "Open or create a template.",
    "status.nothingSelected": "Nothing selected.",
    "status.selected": "Selected",
    "status.selectedMultiple": "Selected multiple: {count} items",

    "common.mixed": "Mixed",
    "common.none": "(none)",
    "common.select": "Select",
    "common.delete": "Delete",

    "separator.none": "No separator",
    "separator.space": "Space ( )",
    "separator.colon": "Colon (:)",
    "separator.dot": "Dot (.)",
    "separator.comma": "Comma (,)",
    "separator.dash": "Dash (-)",
    "separator.backslash": "Backslash (\\)"
  },

  ru: {
    "app.title": "Willow XML CIFF Editor",

    "topbar.create": "Создать",
    "topbar.open": "Открыть",
    "topbar.save": "Сохранить",
    "topbar.undo": "Отменить",
    "topbar.redo": "Повторить",
    "topbar.pan": "Перемещение",
    "topbar.grid": "Сетка",
    "topbar.snap": "Привязка",
    "topbar.align": "Выравнивать",
    "topbar.alignShort": "Выравн.",
    "topbar.zoom": "Масштаб",

    "panel.tools.title": "Инструменты",
    "panel.printed.title": "Printed",
    "panel.printed.subtitle": "Поля",
    "panel.hidden.title": "Hidden",
    "panel.hidden.subtitle": "Поля",
    "panel.search.placeholder": "Поиск полей",
    "panel.showHidden": "Показать скрытые поля",
    "panel.hideHidden": "Скрыть скрытые поля",

    "tool.datamatrix": "DataMatrix",
    "tool.text": "Текст",
    "tool.date": "Дата",
    "tool.time": "Время",
    "tool.offset": "Смещение",
    "tool.counter": "Счётчик",

    "tab.object": "Объект",
    "tab.template": "Шаблон",
    "tab.datamatrix": "DataMatrix",
    "tab.offsets": "Смещения",
    "tab.validation": "Проверка",
    "tab.advanced": "Дополнительно",

    "object.title": "Выбранный объект",
    "object.empty": "Объект не выбран",
    "object.emptyHint": "Выберите объект на холсте или в списке полей.",
    "object.delete": "Удалить выбранное",

    "field.name": "Имя",
    "field.printed": "Печатается",
    "field.type": "Тип",
    "field.x": "X (мм)",
    "field.y": "Y (мм)",
    "field.width": "Ширина (мм)",
    "field.height": "Высота (мм)",
    "field.orientation": "Ориентация",
    "field.rotation": "Поворот",
    "field.value": "Значение",
    "field.fontSize": "Размер шрифта",
    "field.xMag": "XMag (%)",
    "field.maxCharacters": "Макс. символов",
    "field.printOutput": "Печать объекта",
    "field.fixedText": "Фиксированный текст",
    "field.userEnteredText": "Вводимый текст",
    "field.dateType": "Тип даты",
    "field.currentDate": "Текущая дата",
    "field.calculatedDate": "Расчётная дата",
    "field.dateFormat": "Формат даты",
    "field.timeFormat": "Формат времени",
    "field.separator": "Сепаратор",
    "field.offset": "Смещение",

    "counter.digits": "Разрядов",
    "counter.start": "Начало",
    "counter.end": "Конец",
    "counter.step": "Шаг",
    "counter.maxValue": "Максимальное значение для {digits} разрядов: {value}",

    "datamatrix.title": "DataMatrix",
    "datamatrix.empty": "Объект DataMatrix не найден.",
    "datamatrix.emptyHint": "Создайте новый DataMatrix или выберите существующий.",
    "datamatrix.quietMargin": "QuietMargin",
    "datamatrix.moduleSize": "Размер модуля",
    "datamatrix.symbolSize": "Размер символа",
    "datamatrix.profile": "Профиль",
    "datamatrix.applyProfile": "Применить профиль",
    "datamatrix.segments": "Сегменты",
    "datamatrix.addSegment": "Добавить сегмент",
    "datamatrix.validationOk": "Профиль соответствует текущему SymbolSize.",

    "template.size.title": "Размер шаблона",
    "template.printer.title": "Настройки принтера",
    "template.width": "Ширина (мм)",
    "template.height": "Высота (мм)",
    "template.printerModel": "Модель принтера",
    "template.printMode": "Режим печати",
    "template.sizeLimit": "Лимит: {maxWidth} x {maxHeight} мм | Используется: {usedWidth} x {usedHeight} мм",
    "template.designedFor": "Header DesignedFor: {value}",

    "offsets.title": "Смещения дат",
    "offsets.subtitle": "Управление расчётными датами.",
    "offsets.add": "Добавить смещение",
    "offsets.empty": "В файле нет DateOffset.",
    "offsets.current": "Текущее смещение: {date}",
    "offsets.year": "Год",
    "offsets.month": "Месяц",
    "offsets.day": "День",

    "validation.title": "Проверка",
    "validation.empty": "Здесь появятся результаты проверки.",

    "advanced.title": "XML / Дополнительно",
    "advanced.empty": "Здесь появятся дополнительные XML-параметры.",
    "advanced.hiddenEditor": "Редактор скрытых полей",
    "advanced.hiddenEditorHint": "Редактирование значений непечатаемых полей.",
    "language.label": "Язык",
    "language.en": "Английский",
    "language.ru": "Русский",
    "grid.size": "Размер сетки",

    "dialog.createTemplate.title": "Создать шаблон",
    "dialog.createTemplate.subtitle": "Выберите модель принтера, режим печати и размер области.",
    "dialog.createTemplate.sizeHint": "Для голов 53 мм доступен диапазон 53.33 на 75.00 мм.",
    "dialog.cancel": "Отмена",
    "dialog.close": "Закрыть",
    "dialog.create": "Создать",

    "mobile.panels": "Панели",
    "mobile.panelsHint": "Инструменты и настройки",

    "status.openFile": "Откройте CIFF-файл (.ciff/.xml).",
    "status.noTemplate": "Откройте или создайте шаблон.",
    "status.nothingSelected": "Ничего не выбрано.",
    "status.selected": "Выбрано",
    "status.selectedMultiple": "Выбрано несколько: {count}",

    "common.mixed": "Разные значения",
    "common.none": "(нет)",
    "common.select": "Выбрать",
    "common.delete": "Удалить",

    "separator.none": "Без сепаратора",
    "separator.space": "Пробел ( )",
    "separator.colon": "Двоеточие (:)",
    "separator.dot": "Точка (.)",
    "separator.comma": "Запятая (,)",
    "separator.dash": "Тире (-)",
    "separator.backslash": "Обратный слэш (\\)"
  }
};

const UI_TRANSLATION_TARGETS = [
  { selector: "title", key: "app.title" },

  { selector: "#btnNewTemplate span", key: "topbar.create" },
  { selector: "#btnNewTemplate", key: "dialog.createTemplate.title", attr: "aria-label" },
  { selector: "#btnNewTemplate", key: "dialog.createTemplate.title", attr: "title" },
  { selector: "#btnOpenFile span", key: "topbar.open" },
  { selector: "#btnOpenFile", key: "topbar.open", attr: "aria-label" },
  { selector: "#btnOpenFile", key: "topbar.open", attr: "title" },
  { selector: "#btnSave span", key: "topbar.save" },
  { selector: "#btnSave", key: "topbar.save", attr: "aria-label" },
  { selector: "#btnSave", key: "topbar.save", attr: "title" },
  { selector: "#btnUndo", key: "topbar.undo", attr: "aria-label" },
  { selector: "#btnUndo", key: "topbar.undo", attr: "title" },
  { selector: "#btnRedo", key: "topbar.redo", attr: "aria-label" },
  { selector: "#btnRedo", key: "topbar.redo", attr: "title" },
  { selector: "#btnPanMode span", key: "topbar.pan" },
  { selector: "#btnPanMode", key: "topbar.pan", attr: "aria-label" },
  { selector: "#btnPanMode", key: "topbar.pan", attr: "title" },
  { selector: "label[for='toggleGrid'] span", key: "topbar.grid" },
  { selector: "label[for='toggleSnap'] span", key: "topbar.snap" },
  { selector: "#toggleAlign + .utilityToggle__label .utilityToggle__full", key: "topbar.align" },
  { selector: "#toggleAlign + .utilityToggle__label .utilityToggle__short", key: "topbar.alignShort" },
  { selector: "label[for='zoomRange']", key: "topbar.zoom" },

  { selector: ".panel--left .panel__section:nth-of-type(1) .panel__title", key: "panel.tools.title" },
  { selector: ".panel--left .panel__section:nth-of-type(2) .panel__title", key: "panel.printed.title" },
  { selector: ".panel--left .panel__section:nth-of-type(2) .muted", key: "panel.printed.subtitle" },
  { selector: ".panel--left .panel__section:nth-of-type(3) .panel__title", key: "panel.hidden.title" },
  { selector: ".panel--left .panel__section:nth-of-type(3) .muted", key: "panel.hidden.subtitle" },

  { selector: "#addDataMatrix span", key: "tool.datamatrix" },
  { selector: "#addFixedText span", key: "tool.text" },
  { selector: "#addDateText span", key: "tool.date" },
  { selector: "#addTimeText span", key: "tool.time" },
  { selector: "#addOffsetDateText span", key: "tool.offset" },
  { selector: "#addCounterText span", key: "tool.counter" },

  { selector: "#fieldSearch", key: "panel.search.placeholder", attr: "placeholder" },
  { selector: "#searchField", key: "panel.search.placeholder" },
  { selector: "#btnShowHiddenOnCanvas", key: "panel.showHidden", attr: "aria-label" },
  { selector: "#btnShowHiddenOnCanvas", key: "panel.showHidden", attr: "title" },

  { selector: "#object_tab", key: "tab.object" },
  { selector: "#template_tab", key: "tab.template" },
  { selector: "#datamatrix_tab", key: "tab.datamatrix" },
  { selector: "#offsets_tab", key: "tab.offsets" },
  { selector: "#validation_tab", key: "tab.validation" },
  { selector: "#xml_advanced_tab", key: "tab.advanced" },

  { selector: "#tab-object > .panel__title", key: "object.title" },
  { selector: "#btnDelete", key: "object.delete" },
  { selector: "#tab-template .sectionBlock:nth-of-type(1) .panel__title", key: "template.size.title" },
  { selector: "#tab-template .sectionBlock:nth-of-type(2) .panel__title", key: "template.printer.title" },
  { selector: "#tab-datamatrix > .panel__title", key: "datamatrix.title" },
  { selector: "#tab-offsets .panel__title", key: "offsets.title" },
  { selector: "#tab-offsets .muted", key: "offsets.subtitle" },
  { selector: "#addOffset", key: "offsets.add", attr: "aria-label" },
  { selector: "#addOffset", key: "offsets.add", attr: "title" },
  { selector: "#tab-validation > .panel__title", key: "validation.title" },
  { selector: "#tab-validation > .muted", key: "validation.empty" },
  { selector: "#tab-xml-advanced > .panel__title", key: "advanced.title" },
  { selector: "#tab-xml-advanced > .muted", key: "advanced.empty" },
  { selector: "label[for='uiLanguageSelect']", key: "language.label" },
  { selector: "label[for='gridSizeSelect']", key: "grid.size" },
  { selector: "#tab-xml-advanced .sectionBlock .panel__title", key: "advanced.hiddenEditor" },
  { selector: "#tab-xml-advanced .sectionBlock .muted", key: "advanced.hiddenEditorHint" },

  { selector: "#mobilePanelMenuToggle", key: "mobile.panels", attr: "aria-label" },
  { selector: "#mobilePanelMenuToggle", key: "mobile.panels", attr: "title" },
  { selector: "#mobilePanelMenu", key: "mobile.panels", attr: "aria-label" },
  { selector: "#mobilePanelMenu .panel__title", key: "mobile.panels" },
  { selector: "#mobilePanelMenu .muted", key: "mobile.panelsHint" },
  { selector: "#mobilePanelMenuClose", key: "dialog.close", attr: "aria-label" },
  { selector: "#mobilePanelMenuClose", key: "dialog.close", attr: "title" },

  { selector: "#newTemplateTitle", key: "dialog.createTemplate.title" },
  { selector: ".modal__subtitle", key: "dialog.createTemplate.subtitle" },
  { selector: "label[for='newTemplatePrinterModel']", key: "template.printerModel" },
  { selector: "label[for='newTemplatePrintMode']", key: "template.printMode" },
  { selector: "label[for='newTemplateWidth']", key: "template.width" },
  { selector: "label[for='newTemplateHeight']", key: "template.height" },
  { selector: "#newTemplateModal .note", key: "dialog.createTemplate.sizeHint" },
  { selector: "#btnCancelNewTemplate", key: "dialog.cancel" },
  { selector: "#btnCreateNewTemplate", key: "dialog.create" }
];

let currentUiLanguage = getSavedUiLanguage();
const uiLanguageChangeListeners = new Set();

function normalizeUiLanguage(language) {
  const code = String(language ?? "").toLowerCase();
  return UI_LANGUAGES.some((item) => item.code === code) ? code : UI_DEFAULT_LANGUAGE;
}

function getSavedUiLanguage() {
  try {
    return normalizeUiLanguage(globalThis.localStorage?.getItem(UI_LANGUAGE_STORAGE_KEY));
  } catch {
    return UI_DEFAULT_LANGUAGE;
  }
}

function saveUiLanguage(language) {
  const nextLanguage = normalizeUiLanguage(language);
  try {
    globalThis.localStorage?.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
  } catch {
    // localStorage can be unavailable in restricted contexts.
  }
  return nextLanguage;
}

function getCurrentUiLanguage() {
  return currentUiLanguage;
}

function onUiLanguageChange(listener) {
  if (typeof listener !== "function") return () => {};
  uiLanguageChangeListeners.add(listener);
  return () => uiLanguageChangeListeners.delete(listener);
}

function formatUiTranslation(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

function translateUi(key, params = {}, language = currentUiLanguage) {
  const currentLanguage = normalizeUiLanguage(language);
  const fallbackDictionary = UI_TRANSLATIONS[UI_DEFAULT_LANGUAGE] || {};
  const dictionary = UI_TRANSLATIONS[currentLanguage] || fallbackDictionary;
  const template = dictionary[key] ?? fallbackDictionary[key] ?? key;
  return formatUiTranslation(template, params);
}

function translateUiElement(target, language = currentUiLanguage) {
  const nodes = Array.from(document.querySelectorAll(target.selector));
  nodes.forEach((node) => {
    const value = translateUi(target.key, target.params || {}, language);
    if (target.attr) node.setAttribute(target.attr, value);
    else node.textContent = value;
  });
}

function applyUiTranslations(root = document, language = currentUiLanguage) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  document.documentElement.lang = language;
  document.title = translateUi("app.title", {}, language);
  UI_TRANSLATION_TARGETS.forEach((target) => translateUiElement(target, language));

  const propsEmpty = document.querySelector("#propsEmpty");
  if (propsEmpty) {
    propsEmpty.innerHTML = `${translateUi("object.empty", {}, language)}<br>${translateUi("object.emptyHint", {}, language)}`;
  }
  const dmEmpty = document.querySelector("#dmEmpty");
  if (dmEmpty) {
    dmEmpty.innerHTML = `${translateUi("datamatrix.empty", {}, language)}<br>${translateUi("datamatrix.emptyHint", {}, language)}`;
  }
}

function updateUiLanguageControls(language = currentUiLanguage) {
  document.querySelectorAll("[data-ui-language-select]").forEach((select) => {
    select.innerHTML = "";
    UI_LANGUAGES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = translateUi(`language.${item.code}`, {}, language);
      select.appendChild(option);
    });
    select.value = language;
  });
}

function setUiLanguage(language, opts = {}) {
  const nextLanguage = saveUiLanguage(language);
  if (nextLanguage === currentUiLanguage && !opts.force) return currentUiLanguage;
  currentUiLanguage = nextLanguage;
  applyUiTranslations(document, currentUiLanguage);
  updateUiLanguageControls(currentUiLanguage);
  if (opts.notify !== false) {
    uiLanguageChangeListeners.forEach((listener) => listener(currentUiLanguage));
  }
  return currentUiLanguage;
}

function initUiLanguageControls() {
  document.querySelectorAll("[data-ui-language-select]").forEach((select) => {
    select.addEventListener("change", () => setUiLanguage(select.value));
  });
  setUiLanguage(currentUiLanguage, { force: true, notify: false });
}

globalThis.UI_DEFAULT_LANGUAGE = UI_DEFAULT_LANGUAGE;
globalThis.UI_LANGUAGE_STORAGE_KEY = UI_LANGUAGE_STORAGE_KEY;
globalThis.UI_LANGUAGES = UI_LANGUAGES;
globalThis.UI_TRANSLATIONS = UI_TRANSLATIONS;
globalThis.UI_TRANSLATION_TARGETS = UI_TRANSLATION_TARGETS;
globalThis.normalizeUiLanguage = normalizeUiLanguage;
globalThis.getSavedUiLanguage = getSavedUiLanguage;
globalThis.saveUiLanguage = saveUiLanguage;
globalThis.getCurrentUiLanguage = getCurrentUiLanguage;
globalThis.onUiLanguageChange = onUiLanguageChange;
globalThis.formatUiTranslation = formatUiTranslation;
globalThis.translateUi = translateUi;
globalThis.applyUiTranslations = applyUiTranslations;
globalThis.setUiLanguage = setUiLanguage;
globalThis.initUiLanguageControls = initUiLanguageControls;
globalThis.t = translateUi;
