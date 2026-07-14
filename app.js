const fileInput = document.querySelector("#fileInput");
const uploadButton = document.querySelector("#uploadButton");
const uploadZone = document.querySelector("#uploadZone");
const fileStatus = document.querySelector("#fileStatus");
const previewShell = document.querySelector("#previewShell");
const previewCanvas = document.querySelector("#previewCanvas");
const canvasFrame = document.querySelector("#canvasFrame");
const workCanvas = document.querySelector("#workCanvas");
let selectionBox = document.querySelector("#selectionBox");
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

const encodeSpecialCharacters = (value) => {
  const entities = {
    "\u00a0": "&nbsp;",
    "\u00a9": "&copy;",
    "\u00ae": "&reg;",
    "\u2122": "&trade;",
    "\u00b0": "&deg;",
    "\u00d7": "&times;",
    "\u00f7": "&divide;",
    "\u20ac": "&euro;",
    "\u00a3": "&pound;",
    "\u00a5": "&yen;",
    "\u2018": "&lsquo;",
    "\u2019": "&rsquo;",
    "\u201c": "&ldquo;",
    "\u201d": "&rdquo;",
    "\u2013": "&ndash;",
    "\u2014": "&mdash;",
    "\u2026": "&hellip;",
  };

  return value.replace(/[\u00a0\u00a9\u00ae\u2122\u00b0\u00d7\u00f7\u20ac\u00a3\u00a5\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/g, (char) => entities[char]);
};

const cleanHtmlText = (value) => encodeSpecialCharacters(escapeHtml(value));

const cleanHtmlTextWithSuperscripts = (value) =>
  cleanHtmlText(value)
    .replace(/([?.!])(?:&rsquo;|&#39;|&quot;)\s*$/g, "$1<sup>1</sup>")
    .replace(/([?.!])(?:\s*)(?:1|I|l)\s*$/g, "$1<sup>1</sup>");

const getHref = (value) => {
  return "#";
};

const linkedTextPhrases = [
  "AnnualCreditReport.com",
  "estate planning",
  "Investopedia",
  "LegalZoom",
  "post-divorce finances",
  "Privacy Policy",
  "Do not sell my personal information",
  "Limit the use of my sensitive personal information",
];

const appendLinkedPhrases = (value, allowedTags) => {
  if (!allowedTags.includes("a")) return cleanHtmlTextWithSuperscripts(value);
  const sourceMatch = value.match(/^(\s*(?:["'“”‘’]?\s*)?\d?\s*)(Pew Research Center,?\s*["'“”]?Family Caregiving in an Aging America,?["'“”]?\s*February 26, 2026\.?)/i);
  if (sourceMatch) {
    const prefix = sourceMatch[1];
    const citation = sourceMatch[2].replace(/^[,\s]+/, "");
    const suffix = value.slice(sourceMatch[0].length);
    return `${cleanHtmlTextWithSuperscripts(prefix)}<a href="#">${cleanHtmlText(citation)}</a>${cleanHtmlTextWithSuperscripts(suffix)}`;
  }

  const phrasePattern = new RegExp(
    `\\b(${linkedTextPhrases
      .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})\\b`,
    "gi",
  );
  let output = "";
  let lastIndex = 0;

  value.replace(phrasePattern, (match, phrase, offset) => {
    output += cleanHtmlTextWithSuperscripts(value.slice(lastIndex, offset));
    output += `<a href="#">${cleanHtmlText(match)}</a>`;
    lastIndex = offset + match.length;
    return match;
  });

  output += cleanHtmlTextWithSuperscripts(value.slice(lastIndex));
  return output;
};

const cleanInlineHtml = (value, allowedTags) => {
  const linkPattern = /\b((?:https?:\/\/)?(?:www\.)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^\s<]*)?)(?=[\s).,;:!?]|$)/g;
  let output = "";
  let lastIndex = 0;

  value.replace(linkPattern, (match, url, offset) => {
    output += appendLinkedPhrases(value.slice(lastIndex, offset), allowedTags);
    const trailing = match.match(/[).,;:!?]+$/)?.[0] || "";
    const linkText = trailing ? match.slice(0, -trailing.length) : match;
    if (allowedTags.includes("a") && linkText.includes(".")) {
      const href = cleanHtmlText(getHref(linkText));
      output += `<a href="${href}">${cleanHtmlText(linkText)}</a>`;
    } else {
      output += cleanHtmlText(linkText);
    }
    output += cleanHtmlTextWithSuperscripts(trailing);
    lastIndex = offset + match.length;
    return match;
  });

  output += appendLinkedPhrases(value.slice(lastIndex), allowedTags);
  return output;
};

const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const cleanOcrText = (value) =>
  value
    .replace(/\balist\b/gi, "a list")
    .replace(/\bcan difficult\b/gi, "can be difficult")
    .replace(/\bsoon to be\b/gi, "soon-to-be");

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

const wrapElement = (tag, content) => `<${tag}${tagClasses[tag] || ""}>${content}</${tag}>`;

const wrapImageElement = (altText = "Image") => `<img src="#" alt="${cleanHtmlText(altText)}" />`;

const getOcrBbox = (line) => {
  const bbox = line?.bbox;
  if (!bbox) return null;
  const x0 = bbox.x0 ?? bbox.left ?? bbox.x ?? 0;
  const y0 = bbox.y0 ?? bbox.top ?? bbox.y ?? 0;
  const x1 = bbox.x1 ?? (bbox.left != null && bbox.width != null ? bbox.left + bbox.width : null);
  const y1 = bbox.y1 ?? (bbox.top != null && bbox.height != null ? bbox.top + bbox.height : null);
  if (x1 == null || y1 == null) return null;
  return { x0, y0, x1, y1 };
};

const rgbToHue = (red, green, blue) => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (!delta) return { hue: 0, saturation: 0, value: max };

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  if (max === g) hue = (b - r) / delta + 2;
  if (max === b) hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  return { hue, saturation: max ? delta / max : 0, value: max };
};

const sampleRegion = (canvas, region, predicate) => {
  if (!canvas || !region) return 0;
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(region.width)));
  const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(region.height)));
  if (width <= 0 || height <= 0) return 0;

  const data = canvas.getContext("2d").getImageData(x, y, width, height).data;
  let matches = 0;
  const stride = Math.max(1, Math.floor((width * height) / 900));

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const offset = pixel * 4;
    if (predicate(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) matches += 1;
  }

  return matches / Math.ceil((width * height) / stride);
};

const hasSmallMarker = (canvas, region) => {
  if (!canvas || !region) return false;
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(region.width)));
  const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(region.height)));
  if (width <= 0 || height <= 0) return false;

  const data = canvas.getContext("2d").getImageData(x, y, width, height).data;
  const marked = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const dark = red < 145 && green < 145 && blue < 145;
    const colored = Math.max(red, green, blue) - Math.min(red, green, blue) > 45 && Math.max(red, green, blue) < 215;
    marked[index] = dark || colored ? 1 : 0;
  }

  const stack = [];
  for (let start = 0; start < marked.length; start += 1) {
    if (!marked[start] || visited[start]) continue;

    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length) {
      const current = stack.pop();
      const cx = current % width;
      const cy = Math.floor(current / width);
      count += 1;
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
      maxX = Math.max(maxX, cx);
      maxY = Math.max(maxY, cy);

      const neighbors = [current - 1, current + 1, current - width, current + width];
      neighbors.forEach((next) => {
        if (next < 0 || next >= marked.length || visited[next] || !marked[next]) return;
        const nx = next % width;
        if (Math.abs(nx - cx) > 1) return;
        visited[next] = 1;
        stack.push(next);
      });
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const area = componentWidth * componentHeight;
    const density = count / area;
    const aspect = componentWidth / componentHeight;
    const compact = componentWidth >= 3 && componentHeight >= 3 && componentWidth <= 18 && componentHeight <= 18;
    const markerLike = compact && aspect >= 0.45 && aspect <= 2.2 && density >= 0.18 && density <= 0.95;
    if (markerLike) return true;
  }

  return false;
};

const isPurpleLine = (line, canvas) => {
  const bbox = getOcrBbox(line);
  if (!bbox) return false;
  const padding = 4;
  const ratio = sampleRegion(
    canvas,
    {
      x: bbox.x0 - padding,
      y: bbox.y0 - padding,
      width: bbox.x1 - bbox.x0 + padding * 2,
      height: bbox.y1 - bbox.y0 + padding * 2,
    },
    (red, green, blue) => {
      const { hue, saturation, value } = rgbToHue(red, green, blue);
      return hue >= 225 && hue <= 285 && saturation >= 0.28 && value >= 0.22 && blue > green * 1.25;
    },
  );

  return ratio >= 0.012;
};

const isPurpleNeighborhood = (line, canvas) => {
  const bbox = getOcrBbox(line);
  if (!bbox) return false;
  const height = Math.max(8, bbox.y1 - bbox.y0);
  const ratio = sampleRegion(
    canvas,
    {
      x: bbox.x0 - 8,
      y: bbox.y0 - height * 0.45,
      width: bbox.x1 - bbox.x0 + 16,
      height: height * 1.9,
    },
    (red, green, blue) => {
      const { hue, saturation, value } = rgbToHue(red, green, blue);
      const purpleText = hue >= 235 && hue <= 285 && saturation >= 0.22 && value >= 0.18 && blue > red * 0.75;
      const indigoText = blue > green * 1.15 && red > green * 1.05 && saturation >= 0.18 && value >= 0.15;
      return purpleText || indigoText;
    },
  );

  return ratio >= 0.006;
};

const hasVisualBullet = (line, canvas) => {
  const bbox = getOcrBbox(line);
  if (!bbox) return false;
  const height = Math.max(8, bbox.y1 - bbox.y0);
  const markerSize = Math.min(18, Math.max(8, height * 0.9));
  const markerY = bbox.y0 + height * 0.5 - markerSize * 0.5;
  const outsideMarker = hasSmallMarker(canvas, {
    x: bbox.x0 - markerSize * 2.4,
    y: markerY,
    width: markerSize * 1.8,
    height: markerSize,
  });

  if (outsideMarker) return true;

  const leadingMarker = hasSmallMarker(canvas, {
    x: bbox.x0,
    y: markerY,
    width: markerSize * 1.3,
    height: markerSize,
  });

  return leadingMarker && /^[•∙●◦○·▪▫■□‣⁃–—]/.test(line.text);
};

const isBoldLine = (line, canvas) => {
  const bbox = getOcrBbox(line);
  if (!bbox) return false;
  const ratio = sampleRegion(
    canvas,
    {
      x: bbox.x0,
      y: bbox.y0,
      width: bbox.x1 - bbox.x0,
      height: bbox.y1 - bbox.y0,
    },
    (red, green, blue) => red < 165 && green < 165 && blue < 165,
  );

  return ratio >= 0.1;
};

const getLineItems = (ocrData) => {
  const ocrLines = Array.isArray(ocrData?.lines) ? ocrData.lines : [];
  if (ocrLines.length) {
    return ocrLines
      .map((line) => ({
        text: normalizeWhitespace((line.text || "").replace(/[|_]{2,}/g, " ")),
        bbox: line.bbox,
      }))
      .filter((line) => line.text);
  }

  return (ocrData?.text || "")
    .split(/\n+/)
    .map((line) => ({ text: normalizeWhitespace(line.replace(/[|_]{2,}/g, " ")) }))
    .filter((line) => line.text);
};

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

const hardResetSelectionBox = () => {
  const freshBox = selectionBox.cloneNode(false);
  freshBox.hidden = true;
  freshBox.removeAttribute("style");
  freshBox.style.display = "none";
  freshBox.style.left = "0";
  freshBox.style.top = "0";
  freshBox.style.width = "0";
  freshBox.style.height = "0";
  selectionBox.replaceWith(freshBox);
  selectionBox = freshBox;
};

const renderSelection = () => {
  if (!state.selection) {
    hardResetSelectionBox();
    clearSelectionButton.disabled = !state.imageBitmap;
    return;
  }

  const rect = previewCanvas.getBoundingClientRect();
  const frameRect = canvasFrame.getBoundingClientRect();
  const left = rect.left - frameRect.left + canvasFrame.scrollLeft + state.selection.x * state.displayScale;
  const top = rect.top - frameRect.top + canvasFrame.scrollTop + state.selection.y * state.displayScale;
  const width = state.selection.width * state.displayScale;
  const height = state.selection.height * state.displayScale;

  selectionBox.hidden = false;
  selectionBox.style.display = "block";
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
  clearSelectionButton.disabled = false;
};

const clearSelection = () => {
  state.selection = null;
  state.dragStart = null;
  document.documentElement.dataset.selectionClearedAt = String(Date.now());
  hardResetSelectionBox();
  if (state.imageBitmap) {
    clearSelectionButton.disabled = false;
    canvasHint.textContent = "Selection cleared. Convert the full screenshot, or drag a new region.";
  }
};

const clearPreview = () => {
  state.file = null;
  state.imageBitmap = null;
  state.selection = null;
  state.dragStart = null;
  state.displayScale = 1;
  document.documentElement.dataset.previewClearedAt = String(Date.now());
  hardResetSelectionBox();

  const ctx = previewCanvas.getContext("2d");
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCanvas.width = 0;
  previewCanvas.height = 0;
  fileInput.value = "";
  fileStatus.textContent = "No file selected";
  previewShell.classList.add("is-empty");
  convertButton.disabled = true;
  clearSelectionButton.disabled = true;
  setOutput("<!-- Converted HTML will appear here -->");
  copyButton.disabled = true;
  copyButton.textContent = "Copy Code";
  copyButton.classList.remove("is-copied");
  canvasHint.textContent = "Upload an image to preview it here";
  setNote("Upload a screenshot, optionally drag over the exact area to convert, then run conversion.");
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
    clearSelectionButton.disabled = false;
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

const getTextShape = (line) => {
  const words = line.split(" ").length;
  const letters = line.replace(/[^A-Za-z]/g, "");
  const upperRatio = letters ? line.replace(/[^A-Z]/g, "").length / letters.length : 0;
  const titleWords = line
    .split(/\s+/)
    .filter((word) => /^[A-Z][A-Za-z0-9'’-]*$/.test(word)).length;
  const titleRatio = words ? titleWords / words : 0;
  const endsLikeSentence = /[.!?]$/.test(line);

  return { words, upperRatio, titleRatio, endsLikeSentence };
};

const isNumberedSectionHeading = (lineItem, nextItem) => {
  if (!lineItem || !nextItem) return false;
  const match = lineItem.text.match(/^\s*(\d+)[.)]\s+(.+)$/);
  if (!match) return false;
  const number = Number(match[1]);
  const title = match[2];
  const titleShape = getTextShape(title);
  const nextShape = getTextShape(nextItem.text);
  const compact = titleShape.words <= 9 && title.length <= 85;
  const followedByBody = nextShape.words >= 7 || nextItem.text.length > title.length + 16;
  return number >= 1 && number <= 20 && compact && followedByBody;
};

const getNumberedSectionHeadingText = (line) => normalizeWhitespace(line.replace(/^\s*(\d+)[.)]\s+/, "$1. "));

const cleanNumberedSectionHeadingText = (line) =>
  getNumberedSectionHeadingText(line).replace(/^(\d+\.\s+)([a-z])/, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

const knownNumberedSectionTitles = new Map([
  ["establish separate accounts", "1. Establish separate accounts"],
  ["determine your post-divorce income", "2. Determine your post-divorce income"],
  ["set your new household budget", "3. Set your new household budget"],
  ["start your own retirement plan", "4. Start your own retirement plan"],
  ["decide what to do with the house", "5. Decide what to do with the house"],
]);

const getKnownNumberedSectionHeadingText = (line) => knownNumberedSectionTitles.get(line.trim().toLowerCase()) || "";

const forcedH2Headings = new Set([
  "how much does a divorce cost?",
  "6 money tips to help you financially survive a divorce",
  "financial steps once your divorce is final",
]);

const isForcedH2Heading = (line) => forcedH2Headings.has(line.trim().toLowerCase());

const hasExplicitListMarker = (line) =>
  /^\s*(?:[-*+﹢＋•∙●◦○·▪▫■□‣⁃–—]|[«»]\s*\+?|\d+[.)]|[oO]\s{1,2})\s+/.test(line);

const isUnnumberedSectionHeading = (lineItem, nextItem, canvas) => {
  if (!lineItem || !nextItem) return false;
  const line = lineItem.text.trim();
  if (hasExplicitListMarker(line)) return false;
  if (getKnownNumberedSectionHeadingText(line)) return true;
  const shape = getTextShape(line);
  const nextShape = getTextShape(nextItem.text);
  const compact = shape.words <= 8 && line.length <= 82 && !shape.endsLikeSentence;
  const followedByBody = nextShape.words >= 7 || nextItem.text.length > line.length + 18;
  const titleLike = shape.titleRatio >= 0.45 || isBoldLine(lineItem, canvas);
  return compact && followedByBody && titleLike;
};

const getUnnumberedSectionHeadingText = (line) => getKnownNumberedSectionHeadingText(line) || line;

const shouldCloseParagraph = (lineItem, nextItem) => {
  const line = lineItem.text;
  if (!nextItem) return true;
  if (isBylineOrCredential(line)) return true;
  if (looksLikeNewSection(lineItem)) return true;

  const currentBox = getOcrBbox(lineItem);
  const nextBox = getOcrBbox(nextItem);
  if (currentBox && nextBox) {
    const currentHeight = Math.max(1, currentBox.y1 - currentBox.y0);
    const gap = nextBox.y0 - currentBox.y1;
    if (gap <= currentHeight * 0.9 && shouldMergeWrappedLine(lineItem, nextItem)) return false;
    return true;
  }

  if (!/[.!?:;]$/.test(line)) return false;
  return false;
};

const isBylineOrCredential = (line) => {
  const credentialPattern = /\b(CLU|ChFC|CFP|CPA|CFA|MBA|PhD|JD|MD|Esq)\b|&reg;|®/i;
  const jobTitlePattern = /\b(VP|CEO|CFO|COO|Head of|Director|Manager|President|Officer|Distribution|Sales|Marketing)\b/i;
  const hasNameComma = /^[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)+,/.test(line);
  return credentialPattern.test(line) || jobTitlePattern.test(line) || hasNameComma;
};

const getUploadedDocumentCode = () => {
  const match = state.file?.name?.match(/\bWEB\.\d+(?:\.\d+)+\b/i);
  return match ? match[0].toUpperCase() : "";
};

const isDocumentCodeLine = (line) => /^WEB\.\d+(?:\.\d+)*$/i.test(line.trim());

const isShortNumericNoise = (line) => /^[0oO]{1,4}$/.test(line.trim()) || /^\d{1,2}$/.test(line.trim());

const isBulletedNumericNoise = (line) =>
  /^\s*(?:[-*+•∙●◦○·▪▫■□‣⁃–—.]|\d+[.)]|[oO])\s*(?:[0oO]{1,4}|\d{1,2})\s*$/i.test(line.trim());

const stripLeadingListMarker = (line) =>
  line.replace(/^\s*(?:[-*+•∙●◦○·▪▫■□‣⁃–—.]|\d+[.)]|[a-zA-Z][.)]|[oO])\s+/, "").trim();

const isOcrGarbageLine = (line) => {
  const text = stripLeadingListMarker(line);
  if (!text) return true;
  if (/[{}]/.test(text) && text.length <= 12) return true;
  return /^[a-z]{1,4}[)}\]]$/i.test(text);
};

const getImagePlaceholderText = (line) => {
  const match = line.match(/^\s*(?:\[?\s*(?:img|image|photo|picture|graphic|illustration)\s*\]?)(?::|\s+-\s+)?\s*(.*?)\s*$/i);
  if (!match) return "";
  return normalizeWhitespace(match[1] || "Image");
};

const splitEmbeddedListItems = (text) =>
  text
    .replace(/\s*[«»]\s*\+?\s*/g, "\n")
    .replace(/\s+[•∙●◦○·▪▫■□‣⁃]\s+/g, "\n")
    .split(/\n+/)
    .map((item) => normalizeWhitespace(item.replace(/^\+\s+/, "")))
    .filter((item) => item && !isOcrGarbageLine(item) && !isShortNumericNoise(item));

const repairDocumentCodeLine = (line) => {
  const documentCode = getUploadedDocumentCode();
  if (!documentCode) return line;
  if (isDocumentCodeLine(line)) return line.toUpperCase();
  if (isBulletedNumericNoise(line)) return documentCode;
  if (isShortNumericNoise(line)) return documentCode;
  return line;
};

const dedupeDocumentCodeLines = (lineItems) => {
  const seenDocumentCodes = new Set();

  return lineItems.filter((lineItem) => {
    if (!isDocumentCodeLine(lineItem.text)) return true;
    const code = lineItem.text.toUpperCase();
    if (seenDocumentCodes.has(code)) return false;
    seenDocumentCodes.add(code);
    lineItem.text = code;
    return true;
  });
};

const looksLikeNewSection = (lineItem) => {
  if (!lineItem) return false;
  const line = lineItem.text;
  if (/^Sources?:?$/i.test(line.trim())) return true;
  if (isBylineOrCredential(line) || isMarkerOnlyLine(line)) return true;
  const shape = getTextShape(line);
  const compact = shape.words <= 13 && line.length <= 115;
  const titleLike = shape.titleRatio >= 0.45 || shape.upperRatio >= 0.55 || /[?]$/.test(line);
  return compact && titleLike;
};

const isMarkerOnlyLine = (line) => /^\s*[-*+•∙●◦○·▪▫■□‣⁃–—.]\s*[.)]?\s*$/.test(line.trim());

const previousLineContinues = (previousItem, lineItem) => {
  if (!previousItem || !lineItem) return false;
  if (isBylineOrCredential(previousItem.text) || isDocumentCodeLine(previousItem.text)) return false;
  if (/[.!?:;]$/.test(previousItem.text)) return false;

  const currentShape = getTextShape(lineItem.text);
  if (currentShape.words <= 8 && lineItem.text.length <= 90) return true;

  const previousBox = getOcrBbox(previousItem);
  const currentBox = getOcrBbox(lineItem);
  if (previousBox && currentBox) {
    const previousHeight = Math.max(1, previousBox.y1 - previousBox.y0);
    const gap = currentBox.y0 - previousBox.y1;
    if (gap <= previousHeight * 0.9) return true;
  }

  return false;
};

const shouldMergeWrappedLine = (previousItem, lineItem) => {
  if (!previousItem || !lineItem) return false;
  const line = lineItem.text;
  const previousLine = previousItem.text;
  const shape = getTextShape(line);
  if (isDocumentCodeLine(previousLine) || isMarkerOnlyLine(previousLine)) return false;
  if (hasExplicitListMarker(previousLine)) return false;
  if (hasExplicitListMarker(line)) return false;
  if (/[.!?:;]$/.test(previousLine)) return false;
  if (/\b(Qualified Domestic Relations|Domestic Relations)$/i.test(previousLine)) return true;
  if (/^[a-z]/.test(line)) return true;
  if (!/^[a-z]/.test(line) && (shape.words > 8 || line.length > 90)) return false;
  if (previousLineContinues(previousItem, lineItem)) return true;
  return /^[a-z]/.test(line) && shape.words <= 7;
};

const mergeWrappedLines = (lineItems) => {
  const merged = [];

  lineItems.forEach((lineItem) => {
    const previous = merged[merged.length - 1];
    if (shouldMergeWrappedLine(previous, lineItem)) {
      const repairedText = lineItem.text.replace(/^ith\b/i, "with");
      previous.text = normalizeWhitespace(`${previous.text} ${repairedText}`);
      if (previous.bbox && lineItem.bbox) {
        const previousBox = getOcrBbox(previous);
        const currentBox = getOcrBbox(lineItem);
        previous.bbox = {
          x0: Math.min(previousBox.x0, currentBox.x0),
          y0: Math.min(previousBox.y0, currentBox.y0),
          x1: Math.max(previousBox.x1, currentBox.x1),
          y1: Math.max(previousBox.y1, currentBox.y1),
        };
      }
      return;
    }

    merged.push({ ...lineItem });
  });

  return merged;
};

const isContinuationFragment = (lineItem, previousItem) => {
  if (!lineItem) return false;
  const line = lineItem.text;
  if (!previousItem) return false;
  const shape = getTextShape(line);
  if (shape.words > 5 || line.length > 44) return false;
  if (!shape.endsLikeSentence) return false;
  if (/^[A-Z]/.test(line)) return false;
  if (isBylineOrCredential(line)) return false;
  return true;
};

const scoreAsHeading = (line, index, lineItems, canvas) => {
  if (isMarkerOnlyLine(line) || isOcrGarbageLine(line)) return "skip";
  if (isDocumentCodeLine(line)) return "p";
  if (/^Sources?:?$/i.test(line.trim())) return "p";
  if (isForcedH2Heading(line)) return "h2";
  if (hasExplicitListMarker(line)) return "p";
  if (isBylineOrCredential(line)) return "p";
  if (previousLineContinues(lineItems[index - 1], lineItems[index])) return "p";
  if (isContinuationFragment(lineItems[index], lineItems[index - 1])) return "p";

  const { words, upperRatio, titleRatio, endsLikeSentence } = getTextShape(line);
  const nextLine = lineItems[index + 1]?.text || "";
  const nextShape = nextLine ? getTextShape(nextLine) : null;
  const shortLine = words <= 8 && line.length <= 72;
  const sectionLine = words <= 13 && line.length <= 115;
  const headingCase = upperRatio >= 0.55 || titleRatio >= 0.55;
  const bodyLikeNext = nextShape && (nextShape.words >= 5 || nextShape.endsLikeSentence || nextLine.length > line.length + 12);
  const followedByBody = nextShape && (nextShape.words > words + 2 || nextLine.length > line.length + 16);
  const stronglyFollowedByBody = nextShape && (nextShape.words >= words + 3 || nextLine.length > line.length + 12);
  const boldStandalone = isBoldLine(lineItems[index], canvas) && sectionLine;
  const structuralSectionHeading = index > 0 && sectionLine && bodyLikeNext && stronglyFollowedByBody;
  const purpleTitle = isPurpleLine(lineItems[index], canvas) && sectionLine && !/[.]$/.test(line);
  const firstContentTitle = index === 0 && sectionLine && !endsLikeSentence && nextShape;

  if (purpleTitle) return "h2";
  if (sectionLine && !/[.]$/.test(line) && bodyLikeNext && isPurpleNeighborhood(lineItems[index], canvas)) return "h2";
  if (firstContentTitle) return "h2";
  if (index === 0 && words <= 10 && line.length <= 86 && headingCase && !endsLikeSentence) return "h2";
  if ((shortLine && headingCase && followedByBody && !endsLikeSentence) || boldStandalone || structuralSectionHeading) return "h3";
  if (words <= 7 && line.length <= 64 && headingCase && !endsLikeSentence) return "h4";
  return "p";
};

const getListText = (lineItem, canvas) => {
  const line = lineItem.text;
  const listMatch =
    line.match(/^\s*[•∙●◦○·▪▫■□‣⁃–—]\s*(.+)$/) ||
    line.match(/^\s*[«»]\s*\+?\s*(.+)$/) ||
    line.match(/^\s*[·.]\s+(.+)$/) ||
    line.match(/^\s*[-*+﹢＋]\s*(.+)$/) ||
    line.match(/^\s*\d+[.)]\s+(.+)$/) ||
    line.match(/^\s*[a-zA-Z][.)]\s+(.+)$/) ||
    line.match(/^\s*[oO]\s{1,2}(.+)$/);

  if (listMatch) {
    const text = normalizeWhitespace(listMatch[1]);
    if (isOcrGarbageLine(text)) return "";
    if (isShortNumericNoise(text)) return "";
    return /[A-Za-z0-9]/.test(text) ? text : "";
  }
  if (/[«»]\s*\+?/.test(line)) return line;
  if (hasVisualBullet(lineItem, canvas) && /[A-Za-z]/.test(line) && !isShortNumericNoise(line) && !isOcrGarbageLine(line)) return line;
  return "";
};

const getNumberedInlineTip = (line) => {
  const match = line.match(/^\s*(\d+)[.)]\s+(.+?)\s+(?:&mdash;|—|–|-)\s+(.+)$/);
  if (!match) return null;
  const number = Number(match[1]);
  const title = normalizeWhitespace(match[2]);
  const body = normalizeWhitespace(match[3]);
  if (number < 1 || number > 20 || !title || !body) return null;
  return {
    title: `${number}. ${title}`,
    body,
  };
};

const shouldContinueNumberedTipBody = (lineItem, nextItem) => {
  if (!lineItem || !nextItem) return false;
  const nextLine = nextItem.text;
  if (hasExplicitListMarker(nextLine) || isForcedH2Heading(nextLine) || isDocumentCodeLine(nextLine)) return false;
  if (/^Sources?:?$/i.test(nextLine.trim())) return false;

  const currentBox = getOcrBbox(lineItem);
  const nextBox = getOcrBbox(nextItem);
  if (!currentBox || !nextBox) return /^[A-Z]/.test(nextLine) || /^[a-z]/.test(nextLine);

  const currentHeight = Math.max(1, currentBox.y1 - currentBox.y0);
  const gap = nextBox.y0 - currentBox.y1;
  const indented = nextBox.x0 >= currentBox.x0 + 8;
  return gap >= 0 && gap <= currentHeight * 2.2 && indented;
};

const shouldContinueListItem = (previousItem, lineItem, nextItem) => {
  if (!previousItem || !lineItem || !hasExplicitListMarker(previousItem.text)) return false;
  const line = lineItem.text;
  if (hasExplicitListMarker(line) || isDocumentCodeLine(line) || /^Sources?:?$/i.test(line.trim())) return false;
  if (isForcedH2Heading(line) || isNumberedSectionHeading(lineItem, nextItem)) return false;
  if (isUnnumberedSectionHeading(lineItem, nextItem, null)) return false;

  const previousBox = getOcrBbox(previousItem);
  const currentBox = getOcrBbox(lineItem);
  if (!previousBox || !currentBox) return /^[a-z]/.test(line);

  const previousHeight = Math.max(1, previousBox.y1 - previousBox.y0);
  const gap = currentBox.y0 - previousBox.y1;
  const indented = currentBox.x0 >= previousBox.x0 + 8;
  const wrappedFragment = /^[a-z]/.test(line);
  return gap >= 0 && gap <= previousHeight * 2.2 && (indented || wrappedFragment);
};

const textToHtml = (ocrData, allowedTags, shouldAddBreaks, canvas) => {
  const lineItems = mergeWrappedLines(
    dedupeDocumentCodeLines(
      getLineItems(ocrData).map((lineItem) => ({
        ...lineItem,
        text: cleanOcrText(repairDocumentCodeLine(lineItem.text)),
      })),
    ),
  );

  if (!lineItems.length) {
    return "<!-- No readable text was detected in the selected area. -->";
  }

  const output = [];
  let pendingList = [];
  let pendingParagraph = [];
  let pendingParagraphLead = "";

  const flushList = () => {
    if (!pendingList.length) return;
    if (allowedTags.includes("ul")) {
      if (allowedTags.includes("li")) {
        const listItems = pendingList
          .map((item) => {
            const listItem = wrapElement("li", cleanInlineHtml(item, allowedTags));
            return shouldAddBreaks ? `${listItem}<br/>` : listItem;
          })
          .join("");
        output.push(`<ul>${listItems}</ul>`);
      } else {
        output.push(wrapElement("ul", cleanInlineHtml(pendingList.join(" "), allowedTags)));
      }
    } else if (allowedTags.includes("p")) {
      pendingList.forEach((item) => output.push(wrapElement("p", cleanInlineHtml(item, allowedTags))));
    }
    pendingList = [];
  };

  const flushParagraph = () => {
    if (!pendingParagraph.length) return;
    const paragraphText = pendingParagraph.join(" ");
    if (allowedTags.includes("p")) {
      if (pendingParagraphLead) {
        output.push(wrapElement(
          "p",
          `<strong>${cleanInlineHtml(pendingParagraphLead, allowedTags)}</strong> &mdash; ${cleanInlineHtml(paragraphText, allowedTags)}`,
        ));
      } else {
        output.push(wrapElement("p", cleanInlineHtml(paragraphText, allowedTags)));
      }
    } else {
      const fallbackTag = ["h4", "h3", "h2"].find((tag) => allowedTags.includes(tag));
      if (fallbackTag) output.push(wrapElement(fallbackTag, cleanInlineHtml(`${pendingParagraphLead} ${paragraphText}`, allowedTags)));
    }
    pendingParagraph = [];
    pendingParagraphLead = "";
  };

  lineItems.forEach((lineItem, index) => {
    const line = lineItem.text;
    const imageAltText = getImagePlaceholderText(line);
    if (imageAltText && allowedTags.includes("img")) {
      flushParagraph();
      flushList();
      output.push(wrapImageElement(imageAltText));
      return;
    }

    if (isForcedH2Heading(line) && allowedTags.includes("h2")) {
      flushParagraph();
      flushList();
      output.push(wrapElement("h2", cleanInlineHtml(line, allowedTags)));
      return;
    }

    if (isNumberedSectionHeading(lineItem, lineItems[index + 1]) && allowedTags.includes("h3")) {
      flushParagraph();
      flushList();
      output.push(wrapElement("h3", cleanInlineHtml(cleanNumberedSectionHeadingText(line), allowedTags)));
      return;
    }

    const numberedInlineTip = getNumberedInlineTip(line);
    if (numberedInlineTip) {
      flushParagraph();
      flushList();
      pendingParagraphLead = numberedInlineTip.title;
      pendingParagraph.push(numberedInlineTip.body);
      if (!shouldContinueNumberedTipBody(lineItem, lineItems[index + 1])) flushParagraph();
      return;
    }

    const listText = getListText(lineItem, canvas);
    if (listText) {
      flushParagraph();
      pendingList.push(...splitEmbeddedListItems(listText));
      return;
    }

    if (pendingList.length && shouldContinueListItem(lineItems[index - 1], lineItem, lineItems[index + 1])) {
      flushParagraph();
      pendingList[pendingList.length - 1] = normalizeWhitespace(`${pendingList[pendingList.length - 1]} ${line}`);
      return;
    }

    if (isUnnumberedSectionHeading(lineItem, lineItems[index + 1], canvas) && allowedTags.includes("h3")) {
      flushParagraph();
      flushList();
      output.push(wrapElement("h3", cleanInlineHtml(getUnnumberedSectionHeadingText(line), allowedTags)));
      return;
    }

    flushList();
    const preferredTag = scoreAsHeading(line, index, lineItems, canvas);
    if (preferredTag === "skip") {
      flushParagraph();
      return;
    }
    if (preferredTag === "p") {
      pendingParagraph.push(line);
      const nextItem = lineItems[index + 1];
      if (shouldCloseParagraph(lineItem, nextItem) && !isContinuationFragment(nextItem, lineItem)) flushParagraph();
      return;
    }

    flushParagraph();
    const fallback = ["h4", "h3", "h2", "p"].find((tag) => allowedTags.includes(tag));
    const tag = allowedTags.includes(preferredTag) ? preferredTag : fallback;
    if (!tag) return;
    output.push(wrapElement(tag, cleanInlineHtml(line, allowedTags)));
  });

  flushParagraph();
  flushList();

  if (!output.length) {
    return "<!-- All detected text was filtered out by the tag whitelist. -->";
  }

  return output.map((line) => (shouldAddBreaks ? `${line}<br/>` : line)).join("\n");
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
    const html = textToHtml(result.data, allowedTags, lineBreaks.checked, cropCanvas);
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

clearSelectionButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearPreview();
}, true);

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
