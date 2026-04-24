/* bootstrap.js - initialize CIFF editor after all modules are loaded */
(() => {
  const required = ["initCanvas", "initUI", "startDynamicFieldValueTicker", "renderAll"];
  const missing = required.filter((name) => typeof globalThis[name] !== "function");
  if (missing.length) {
    throw new Error(`Missing required CIFF modules: ${missing.join(", ")}`);
  }

  initCanvas();
  initUI();
  startDynamicFieldValueTicker();
  renderAll();
})();
