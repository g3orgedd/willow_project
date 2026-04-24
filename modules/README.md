# CIFF Editor Modules

- `00-core.js`
  Constants, shared state, DOM references, Konva runtime variables.

- `10-canvas-ui.js`
  Canvas initialization, stage interaction, top-level UI event wiring.

- `20-xml-load.js`
  File reading, XML loading, header/subheader parsing, field parsing.

- `30-rendering.js`
  Rulers, grid, object rendering, preview generation, date/time/counter/DataMatrix preview helpers.

- `40-editor.js`
  Property panels, hidden fields editor, date offsets editor, selection and object operations.

- `50-inputs.js`
  DM profile helpers, snapping helpers, reusable input/select builders.

- `60-history-save.js`
  Undo/redo, lossless save, XML patching, low-level string operations, encoding helpers, shared utility functions.

- `90-bootstrap.js`
  Final startup step. Calls `initCanvas()`, `initUI()`, `startDynamicFieldValueTicker()` and `renderAll()`.

## Disabling modules

Module flags are declared in [index.html](C:/Users/GigaGeorge/Desktop/willow_project-1/index.html).

Example:

```html
window.CIFF_EDITOR_MODULE_FLAGS.editor = false;
window.CIFF_EDITOR_MODULE_FLAGS.bootstrap = false;
```

If you disable a dependency module, also disable `bootstrap`, otherwise startup will fail with a clear missing-module error.
