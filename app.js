/* app.js - module loader for the browser version of the CIFF editor */
if (typeof window !== "undefined" && typeof document !== "undefined") {
(function () {
  const moduleList = [
    { key: "core", src: "./modules/00-core.js", checks: ["CIFF_EDITOR_CORE_READY"] },
    { key: "canvasUi", src: "./modules/10-canvas-ui.js", checks: ["initCanvas", "initUI"] },
    { key: "xmlLoad", src: "./modules/20-xml-load.js", checks: ["loadXml", "parseFields"] },
    { key: "rendering", src: "./modules/30-rendering.js", checks: ["renderAll", "startDynamicFieldValueTicker"] },
    { key: "editor", src: "./modules/40-editor.js", checks: ["renderSelectionPanels", "addField"] },
    { key: "inputs", src: "./modules/50-inputs.js", checks: ["inputText", "snapPoint"] },
    { key: "historySave", src: "./modules/60-history-save.js", checks: ["pushHistory", "patchXmlLosslessV2"] },
    { key: "bootstrap", src: "./modules/90-bootstrap.js", checks: [] }
  ];

  const existingFlags = globalThis.CIFF_EDITOR_MODULE_FLAGS || {};
  const flags = {};
  moduleList.forEach((entry) => {
    flags[entry.key] = existingFlags[entry.key] !== false;
  });

  globalThis.CIFF_EDITOR_MODULE_LIST = moduleList.slice();
  globalThis.CIFF_EDITOR_MODULE_FLAGS = flags;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load module: ${src}`));
      document.head.appendChild(script);
    });
  }

  function ensureModuleReady(entry) {
    const checks = Array.isArray(entry.checks) ? entry.checks : [];
    const missing = checks.filter((name) => typeof globalThis[name] === "undefined");
    if (missing.length) {
      throw new Error(`Module "${entry.key}" loaded without required symbols: ${missing.join(", ")}`);
    }
  }

  (async () => {
    for (const entry of moduleList) {
      if (flags[entry.key] === false) continue;
      await loadScript(entry.src);
      ensureModuleReady(entry);
    }
  })().catch((error) => {
    console.error("CIFF editor module loader error:", error);
    alert(`Не удалось загрузить модуль редактора: ${error.message}`);
  });
})();
}

if (
  typeof require === "function" &&
  typeof process !== "undefined" &&
  process.versions?.electron &&
  typeof window === "undefined"
) {
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'resourses', 'icon.ico'),
    webPreferences: {
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
});
}
