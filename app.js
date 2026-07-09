const fileInput = document.querySelector("#fileInput");
const uploadButton = document.querySelector("#uploadButton");
const uploadZone = document.querySelector("#uploadZone");
const fileStatus = document.querySelector("#fileStatus");
const previewShell = document.querySelector("#previewShell");
const previewCanvas = document.querySelector("#previewCanvas");
const canvasFrame = document.querySelector("#canvasFrame");
const workCanvas = document.querySelector("#workCanvas");
const selectionBox = document.querySelector("#selectionBox");
const clearSelectionButton = document.querySelector("#clearSelectionButton");
const convertButton = document.querySelector("#convertButton");
const convertText = document.querySelector("#convertText");
const spinner = document.querySelector("#spinner");
const outputCode = document.querySelector("#outputCode");
const copyButton = document.querySelector("#copyButton");
const processNote = document.querySelector("#processNote");
const canvasHint = document.querySelector("#canvasHint");
const lineBreaks = document.querySelector("#lineBreaks");

const state = {
  file: null,
  imageBitmap: null,
  displayScale: 1,
  selection: null,
  dragStart: null,
  tesseractReady: null,
  pdfReady: null,
  outputRaw: "<!-- Converted HTML will appear here -->",
};

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });

const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const highlightHtml = (value) => {
  const escaped = escapeHtml(value);
  return escaped.replace(
    /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-z0-9]+)([^&]*?)(&gt;)/gi,
    (match, comment, open, tag, attrs, close) => {
      if (comment) return `<span class="tok-comment">${comment}</span>`;
      const highlightedAttrs = attrs.replace(
        /([a-z:-]+)(=)(&quot;.*?&quot;|&#39;.*?&#39;|[^\s&]+)/gi,
        '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>',
      );
      return `<span class="tok-tag">${open}${tag}</span>${highlightedAttrs}<span class="tok-tag">${close}</span>`;
    },
  );
};

const setOutput = (value) => {
  state.outputRaw = value;
  outputCode.innerHTML = highlightHtml(value);
};

const setProcessing = (isProcessing) => {
  spinner.hidden = !isProcessing;
  convertButton.disabled = isProcessing || !state.imageBitmap;
  convertText.textContent = isProcessing ? "Processing..." : "Convert to Clean HTML";
};

const setNote = (message) => {
  processNote.textContent = message;
};

const getAllowedTags = () =>
  [...document.querySelectorAll('input[name="tag"]:checked')].map((input) => input.value);

const tagClasses = {
  h2: ' class="subheading-large font-indigo"',
  h3: ' class="subheading-medium"',
  h4: ' class="subheading-small"',
};

const headingStyles = `<style>
.subheading-large {
  margin: 0 0 14px;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.15;
}

.subheading-medium {
  margin: 0 0 10px;
  color: #243447;
  font-size: 1.35rem;
  font-weight: 750;
  line-height: 1.22;
}

.subheading-small {
  margin: 0 0 8px;
  color: #3b4b5f;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.28;
}

.font-indigo {
  color: #3730a3;
}
</style>`;

const wrapElement = (tag, content) => `<${tag}${tagClasses[tag] || ""}>${content}</${tag}>`;

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      if (existing.dataset.loaded === "true") resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.append(script);
  });

const ensureTesseract = async () => {
  if (!state.tesseractReady) {
    state.tesseractReady = loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  }
  await state.tesseractReady;
  return window.Tesseract;
};

const ensurePdfJs = async () => {
  if (!state.pdfReady) {
    state.pdfReady = loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  }
  await state.pdfReady;
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
};

const drawPreview = () => {
  if (!state.imageBitmap) return;

  const frameWidth = Math.max(320, canvasFrame.clientWidth - 2);
  const maxWidth = Math.min(frameWidth, state.imageBitmap.width);
  state.displayScale = maxWidth / state.imageBitmap.width;
  previewCanvas.width = Math.round(state.imageBitmap.width * state.displayScale);
  previewCanvas.height = Math.round(state.imageBitmap.height * state.displayScale);

  const ctx = previewCanvas.getContext("2d");
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(state.imageBitmap, 0, 0, previewCanvas.width, previewCanvas.height);
  renderSelection();
};

const renderSelection = () => {
  if (!state.selection) {
    selectionBox.hidden = true;
    clearSelectionButton.disabled = true;
    return;
  }

  const rect = previewCanvas.getBoundingClientRect();
  const frameRect = canvasFrame.getBoundingClientRect();
  const left = rect.left - frameRect.left + canvasFrame.scrollLeft + state.selection.x * state.displayScale;
  const top = rect.top - frameRect.top + canvasFrame.scrollTop + state.selection.y * state.displayScale;
  const width = state.selection.width * state.displayScale;
  const height = state.selection.height * state.displayScale;

  selectionBox.hidden = false;
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
  clearSelectionButton.disabled = false;
};

const canvasPointFromEvent = (event) => {
  const rect = previewCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(previewCanvas.width, event.clientX - rect.left));
  const y = Math.max(0, Math.min(previewCanvas.height, event.clientY - rect.top));
  return {
    x: x / state.displayScale,
    y: y / state.displayScale,
  };
};

const selectionFromPoints = (start, end) => {
  const x = Math.max(0, Math.min(start.x, end.x));
  const y = Math.max(0, Math.min(start.y, end.y));
  const width = Math.min(state.imageBitmap.width - x, Math.abs(start.x - end.x));
  const height = Math.min(state.imageBitmap.height - y, Math.abs(start.y - end.y));
  return { x, y, width, height };
};

const getCropCanvas = () => {
  const crop = state.selection?.width > 8 && state.selection?.height > 8
    ? state.selection
    : { x: 0, y: 0, width: state.imageBitmap.width, height: state.imageBitmap.height };

  workCanvas.width = Math.round(crop.width);
  workCanvas.height = Math.round(crop.height);
  const ctx = workCanvas.getContext("2d");
  ctx.clearRect(0, 0, workCanvas.width, workCanvas.height);
  ctx.drawImage(
    state.imageBitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    workCanvas.width,
    workCanvas.height,
  );
  return workCanvas;
};

const imageBitmapFromFile = async (file) => {
  if (file.type === "application/pdf") {
    const pdfjsLib = await ensurePdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    workCanvas.width = viewport.width;
    workCanvas.height = viewport.height;
    await page.render({ canvasContext: workCanvas.getContext("2d"), viewport }).promise;
    return createImageBitmap(workCanvas);
  }

  return createImageBitmap(file);
};

const handleFile = async (file) => {
  if (!file) return;
  state.file = file;
  state.selection = null;
  setOutput("<!-- Converted HTML will appear here -->");
  copyButton.disabled = true;
  fileStatus.textContent = file.name;
  canvasHint.textContent = "Loading preview...";
  setNote("Preparing the preview canvas.");

  try {
    state.imageBitmap = await imageBitmapFromFile(file);
    previewShell.classList.remove("is-empty");
    convertButton.disabled = false;
    canvasHint.textContent = "Drag over the screenshot to convert only that bounding box.";
    setNote("Ready. Convert the full screenshot, or drag a region first.");
    drawPreview();
  } catch (error) {
    state.imageBitmap = null;
    convertButton.disabled = true;
    canvasHint.textContent = "Preview failed";
    setNote(error.message.includes("pdf")
      ? "PDF support needs the PDF renderer to load. Try again online or upload a PNG/JPG export."
      : "This file could not be previewed. Try PNG, JPG, or PDF.");
  }
};

const scoreAsHeading = (line, index, lines) => {
  const words = line.split(" ").length;
  const letters = line.replace(/[^A-Za-z]/g, "");
  const upperRatio = letters ? line.replace(/[^A-Z]/g, "").length / letters.length : 0;
  if (index === 0 && words <= 8) return "h2";
  if (words <= 7 && (upperRatio > 0.46 || line.length <= 54) && lines[index + 1]) return "h3";
  if (words <= 7 && line.length <= 64) return "h4";
  return "p";
};

const textToHtml = (rawText, allowedTags, shouldAddBreaks) => {
  const cleanedLines = rawText
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line.replace(/[|_]{2,}/g, " ")))
    .filter(Boolean);

  if (!cleanedLines.length) {
    return "<!-- No readable text was detected in the selected area. -->";
  }

  const output = [];
  let pendingList = [];

  const flushList = () => {
    if (!pendingList.length) return;
    if (allowedTags.includes("ul")) {
      if (allowedTags.includes("li")) {
        output.push(`<ul>${pendingList.map((item) => wrapElement("li", escapeHtml(item))).join("")}</ul>`);
      } else {
        output.push(wrapElement("ul", escapeHtml(pendingList.join(" "))));
      }
    } else if (allowedTags.includes("p")) {
      pendingList.forEach((item) => output.push(wrapElement("p", escapeHtml(item))));
    }
    pendingList = [];
  };

  cleanedLines.forEach((line, index) => {
    const listMatch = line.match(/^[-*•]\s+(.+)/) || line.match(/^\d+[.)]\s+(.+)/);
    if (listMatch) {
      pendingList.push(listMatch[1]);
      return;
    }

    flushList();
    const preferredTag = scoreAsHeading(line, index, cleanedLines);
    const fallback = ["p", "h4", "h3", "h2"].find((tag) => allowedTags.includes(tag));
    const tag = allowedTags.includes(preferredTag) ? preferredTag : fallback;
    if (!tag) return;
    output.push(wrapElement(tag, escapeHtml(line)));
  });

  flushList();

  if (!output.length) {
    return "<!-- All detected text was filtered out by the tag whitelist. -->";
  }

  const html = output.map((line) => (shouldAddBreaks ? `${line}<br/>` : line)).join("\n");
  const usesStyledHeading = output.some((line) =>
    ["subheading-large", "subheading-medium", "subheading-small"].some((className) =>
      line.includes(className),
    ),
  );

  return usesStyledHeading ? `${headingStyles}\n${html}` : html;
};

const convertScreenshot = async () => {
  if (!state.imageBitmap) return;
  const allowedTags = getAllowedTags();
  if (!allowedTags.length) {
    setOutput("<!-- Select at least one allowed HTML tag before converting. -->");
    return;
  }

  setProcessing(true);
  setNote("Running OCR on the selected screenshot area.");

  try {
    const Tesseract = await ensureTesseract();
    const cropCanvas = getCropCanvas();
    const result = await Tesseract.recognize(cropCanvas, "eng", {
      logger: ({ status, progress }) => {
        if (status) {
          const percent = Number.isFinite(progress) ? ` ${Math.round(progress * 100)}%` : "";
          setNote(`${status}${percent}`);
        }
      },
    });
    const html = textToHtml(result.data.text, allowedTags, lineBreaks.checked);
    setOutput(html);
    copyButton.disabled = false;
    setNote("Conversion finished.");
  } catch (error) {
    setOutput("<!-- OCR could not load or complete. Check your network connection and try again. -->");
    setNote("OCR needs the browser OCR library to load from the CDN before conversion can run.");
  } finally {
    setProcessing(false);
  }
};

uploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("is-dragging");
  });
});

uploadZone.addEventListener("drop", (event) => {
  handleFile(event.dataTransfer.files[0]);
});

previewCanvas.addEventListener("pointerdown", (event) => {
  if (!state.imageBitmap) return;
  previewCanvas.setPointerCapture(event.pointerId);
  state.dragStart = canvasPointFromEvent(event);
  state.selection = { x: state.dragStart.x, y: state.dragStart.y, width: 0, height: 0 };
  renderSelection();
});

previewCanvas.addEventListener("pointermove", (event) => {
  if (!state.dragStart || !state.imageBitmap) return;
  state.selection = selectionFromPoints(state.dragStart, canvasPointFromEvent(event));
  renderSelection();
});

previewCanvas.addEventListener("pointerup", (event) => {
  if (!state.dragStart || !state.imageBitmap) return;
  state.selection = selectionFromPoints(state.dragStart, canvasPointFromEvent(event));
  if (state.selection.width < 8 || state.selection.height < 8) state.selection = null;
  state.dragStart = null;
  renderSelection();
});

clearSelectionButton.addEventListener("click", () => {
  state.selection = null;
  renderSelection();
});

convertButton.addEventListener("click", convertScreenshot);

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.outputRaw);
  copyButton.textContent = "✓ Copied!";
  copyButton.classList.add("is-copied");
  setTimeout(() => {
    copyButton.textContent = "Copy Code";
    copyButton.classList.remove("is-copied");
  }, 1300);
});

window.addEventListener("resize", drawPreview);
window.converterInternals = { textToHtml, highlightHtml };
setOutput(state.outputRaw);
document.documentElement.dataset.appReady = "true";
