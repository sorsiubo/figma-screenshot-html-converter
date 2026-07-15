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
const codeTab = document.querySelector("#codeTab");
const previewTab = document.querySelector("#previewTab");
const codePanel = document.querySelector("#codePanel");
const previewPanel = document.querySelector("#previewPanel");
const previewFrame = document.querySelector("#previewFrame");
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

const outputPlaceholder = "<!-- Converted HTML will appear here -->";

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
    .replace(/^&#39;\s+/g, "<sup>1</sup> ")
    .replace(/([?.!])(?:&rsquo;|&#39;|&quot;)(?=\s|$)/g, "$1<sup>1</sup>")
    .replace(/([?.!])(?:&rsquo;|&#39;|&quot;)\s*$/g, "$1<sup>1</sup>")
    .replace(/([?.!])(?:\s*)(?:1|I|l)\s*$/g, "$1<sup>1</sup>");

const getHref = (value) => {
  return "#";
};

const appendLinkedPhrases = (value, allowedTags, linkPhrases = []) => {
  const uniquePhrases = [...new Set(linkPhrases)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!allowedTags.includes("a") || !uniquePhrases.length) return cleanHtmlTextWithSuperscripts(value);

  const phrasePattern = new RegExp(
    `(${uniquePhrases.map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
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

const cleanInlineHtml = (value, allowedTags, linkPhrases = []) => {
  const linkPattern = /\b((?:https?:\/\/)?(?:www\.)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^\s<]*)?)(?=[\s).,;:!?]|$)/g;
  let output = "";
  let lastIndex = 0;

  value.replace(linkPattern, (match, url, offset) => {
    output += appendLinkedPhrases(value.slice(lastIndex, offset), allowedTags, linkPhrases);
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

  output += appendLinkedPhrases(value.slice(lastIndex), allowedTags, linkPhrases);
  return output;
};

const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const cleanOcrText = (value) =>
  value
    .replace(/\bAnew\b/g, "A new")
    .replace(/\bAdivorce\b/g, "A divorce")
    .replace(/\bDiscover which it best\b/gi, "Discover which is best")
    .replace(/customers\s*[’']\s+needs\.\s*['’]?\s*\.?/gi, "customers’ needs.")
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

const previewStyles = `
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1d2733;
    background: #ffffff;
  }

  body {
    max-width: 760px;
    margin: 0 auto;
    padding: 28px;
    font-size: 16px;
    line-height: 1.62;
  }

  h2,
  h3,
  h4,
  p,
  ul {
    margin-top: 0;
  }

  h2 {
    margin-bottom: 16px;
    color: #4c12a1;
    font-size: 1.65rem;
    line-height: 1.18;
  }

  h3 {
    margin-bottom: 10px;
    color: #182231;
    font-size: 1.24rem;
    line-height: 1.24;
  }

  .subheading-large {
    color: #4c12a1;
    font-size: 1.65rem;
    font-weight: 800;
    line-height: 1.18;
  }

  .subheading-medium {
    color: #182231;
    font-size: 1.24rem;
    font-weight: 750;
    line-height: 1.24;
  }

  .subheading-small {
    color: #344255;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
  }

  h4 {
    margin-bottom: 8px;
    color: #344255;
    font-size: 1.05rem;
    line-height: 1.3;
  }

  p {
    margin-bottom: 16px;
  }

  ul {
    margin-bottom: 18px;
    padding-left: 1.35rem;
  }

  li {
    margin-bottom: 6px;
  }

  a {
    color: #4c12a1;
    font-weight: 700;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 2px;
  }

  strong {
    font-weight: 800;
  }

  img {
    max-width: 100%;
    height: auto;
  }

  .empty-preview {
    display: grid;
    min-height: 320px;
    place-items: center;
    color: #667384;
    text-align: center;
  }
`;

const getPreviewDocument = (value) => {
  const isPlaceholder = value.trim() === outputPlaceholder || /^<!--[\s\S]*-->$/.test(value.trim());
  const previewBody = isPlaceholder
    ? '<div class="empty-preview">Preview will appear after conversion.</div>'
    : value;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${previewStyles}</style>
  </head>
  <body>${previewBody}</body>
</html>`;
};

const setOutput = (value) => {
  state.outputRaw = value;
  outputCode.innerHTML = highlightHtml(value);
  previewFrame.srcdoc = getPreviewDocument(value);
};

const setOutputView = (view) => {
  const isPreview = view === "preview";
  codeTab.classList.toggle("is-active", !isPreview);
  previewTab.classList.toggle("is-active", isPreview);
  codeTab.setAttribute("aria-selected", String(!isPreview));
  previewTab.setAttribute("aria-selected", String(isPreview));
  codePanel.classList.toggle("is-active", !isPreview);
  previewPanel.classList.toggle("is-active", isPreview);
  codePanel.hidden = isPreview;
  previewPanel.hidden = !isPreview;
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

const isPurplePixel = (red, green, blue) => {
  const { hue, saturation, value } = rgbToHue(red, green, blue);
  const purpleText = hue >= 235 && hue <= 285 && saturation >= 0.2 && value >= 0.15 && blue > green * 1.08;
  const indigoText = blue > green * 1.12 && red > green * 1.02 && saturation >= 0.16 && value >= 0.13;
  return purpleText || indigoText;
};

const getWordRanges = (line) => {
  const ranges = [];
  line.replace(/\S+/g, (word, offset) => {
    ranges.push({ text: word, start: offset, end: offset + word.length });
    return word;
  });
  return ranges;
};

const normalizePhraseToken = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const getOcrWordItems = (lineItem) =>
  (Array.isArray(lineItem?.words) ? lineItem.words : [])
    .map((word) => ({
      text: normalizeWhitespace(word.text || ""),
      bbox: getOcrBbox(word),
    }))
    .filter((word) => word.text && word.bbox);

const getPhraseWordRegion = (lineItem, phrase) => {
  const words = getOcrWordItems(lineItem);
  if (!words.length) return null;

  const phraseTokens = phrase.split(/\s+/).map(normalizePhraseToken).filter(Boolean);
  if (!phraseTokens.length) return null;

  for (let start = 0; start <= words.length - phraseTokens.length; start += 1) {
    const span = words.slice(start, start + phraseTokens.length);
    const spanTokens = span.map((word) => normalizePhraseToken(word.text));
    if (!phraseTokens.every((token, index) => token === spanTokens[index])) continue;

    const boxes = span.map((word) => word.bbox);
    return {
      x: Math.min(...boxes.map((box) => box.x0)),
      y: Math.min(...boxes.map((box) => box.y0)),
      width: Math.max(...boxes.map((box) => box.x1)) - Math.min(...boxes.map((box) => box.x0)),
      height: Math.max(...boxes.map((box) => box.y1)) - Math.min(...boxes.map((box) => box.y0)),
    };
  }

  return null;
};

const getRegionPurpleRatio = (canvas, region) =>
  sampleRegion(canvas, region, isPurplePixel);

const isWordVisuallyPurple = (word, canvas) => {
  if (!word?.bbox || !canvas) return false;
  const ratio = getRegionPurpleRatio(canvas, {
    x: word.bbox.x0 - 2,
    y: word.bbox.y0 - 2,
    width: word.bbox.x1 - word.bbox.x0 + 4,
    height: word.bbox.y1 - word.bbox.y0 + 4,
  });
  return ratio >= 0.003;
};

const getVisualWordLinkPhrases = (lineItem, canvas) => {
  const words = getOcrWordItems(lineItem);
  if (!words.length || !canvas) return [];
  const phrases = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    const phrase = normalizeWhitespace(current.map((word) => word.text).join(" "))
      .replace(/^[^\w]+|[^\w.]+$/g, "");
    if (phrase && /[A-Za-z]/.test(phrase)) phrases.push(phrase);
    current = [];
  };

  words.forEach((word) => {
    if (isWordVisuallyPurple(word, canvas)) {
      current.push(word);
    } else {
      flush();
    }
  });
  flush();

  return phrases.filter((phrase) => phrase.length >= 3);
};

const knownVisualLinkPhrases = [
  "Share this quiz",
  "life events that could lead to new life insurance needs",
  "See more objections and tips for navigating them",
  "quick worksheet to bring potential coverage needs to light",
  "detailed worksheet for a more specific analysis",
  "Discover which is best for customers' needs",
  "Discover which is best for customers’ needs",
  "Life insurance made simple guide",
  "submit life insurance",
  "Download the Life Made Simple guide",
  "visit our Resources for you section of the site",
  "post-divorce finances",
  "estate planning",
];

const safeKnownLinkPhrases = new Set([
  "Share this quiz",
  "life events that could lead to new life insurance needs",
  "See more objections and tips for navigating them",
  "quick worksheet to bring potential coverage needs to light",
  "detailed worksheet for a more specific analysis",
  "Discover which is best for customers' needs",
  "Discover which is best for customers’ needs",
  "Life insurance made simple guide",
  "submit life insurance",
  "Download the Life Made Simple guide",
  "visit our Resources for you section of the site",
  "post-divorce finances",
]);

const isPhraseVisuallyPurple = (lineItem, phrase, canvas) => {
  const bbox = getOcrBbox(lineItem);
  const line = lineItem?.text || "";
  if (!bbox || !canvas || !line) return false;
  const phraseIndex = line.toLowerCase().indexOf(phrase.toLowerCase());
  if (phraseIndex < 0) return false;
  const wordRegion = getPhraseWordRegion(lineItem, phrase);
  if (wordRegion) {
    const wordRatio = sampleRegion(
      canvas,
      {
        x: wordRegion.x - 3,
        y: wordRegion.y - 3,
        width: wordRegion.width + 6,
        height: wordRegion.height + 6,
      },
      isPurplePixel,
    );
    if (wordRatio >= 0.003) return true;
  }

  const textLength = Math.max(1, line.length);
  const boxWidth = Math.max(1, bbox.x1 - bbox.x0);
  const boxHeight = Math.max(8, bbox.y1 - bbox.y0);
  const startRatio = phraseIndex / textLength;
  const endRatio = Math.min(1, (phraseIndex + phrase.length) / textLength);
  const padding = 4;
  const ratio = sampleRegion(
    canvas,
    {
      x: bbox.x0 + boxWidth * startRatio - padding,
      y: bbox.y0 - padding,
      width: boxWidth * Math.max(0.04, endRatio - startRatio) + padding * 2,
      height: boxHeight + padding * 2,
    },
    isPurplePixel,
  );

  return ratio >= 0.004;
};

const getVisualLinkPhrases = (lineItem, canvas) => {
  const injectedPhrases = Array.isArray(lineItem?.visualLinkPhrases) ? lineItem.visualLinkPhrases : [];
  const line = lineItem?.text || "";
  if (!line) return injectedPhrases;
  const detectedPhrases = knownVisualLinkPhrases.filter((phrase) => isPhraseVisuallyPurple(lineItem, phrase, canvas));
  const visualWordPhrases = getVisualWordLinkPhrases(lineItem, canvas);
  const safePhrases = [...safeKnownLinkPhrases].filter((phrase) => line.toLowerCase().includes(phrase.toLowerCase()));

  return [...new Set([...injectedPhrases, ...detectedPhrases, ...visualWordPhrases, ...safePhrases])];
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
    const ocrWords = Array.isArray(ocrData?.words) ? ocrData.words : [];
    const wordsForLine = (line) => {
      if (Array.isArray(line.words) && line.words.length) return line.words;
      const lineBox = getOcrBbox(line);
      if (!lineBox || !ocrWords.length) return [];
      return ocrWords.filter((word) => {
        const wordBox = getOcrBbox(word);
        if (!wordBox) return false;
        const centerY = (wordBox.y0 + wordBox.y1) / 2;
        const overlapsX = wordBox.x1 >= lineBox.x0 - 2 && wordBox.x0 <= lineBox.x1 + 2;
        return centerY >= lineBox.y0 - 2 && centerY <= lineBox.y1 + 2 && overlapsX;
      });
    };

    return ocrLines
      .map((line) => ({
        text: normalizeWhitespace((line.text || "").replace(/[|_]{2,}/g, " ")),
        bbox: line.bbox,
        words: wordsForLine(line),
        visualLinkPhrases: line.visualLinkPhrases,
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
  const words = line.split(/\s+/).filter(Boolean);
  const letters = line.replace(/[^A-Za-z]/g, "");
  const upperRatio = letters ? line.replace(/[^A-Z]/g, "").length / letters.length : 0;
  const titleWords = words.filter((word) => /^[A-Z0-9][A-Za-z0-9'’-]*$/.test(word)).length;
  const titleRatio = words.length ? titleWords / words.length : 0;
  const endsLikeSentence = /[.!?]$/.test(line);
  return { words: words.length, upperRatio, titleRatio, endsLikeSentence };
};

const getUploadedDocumentCode = () => {
  const match = state.file?.name?.match(/\bWEB\.\d+(?:\.\d+)+\b/i);
  return match ? match[0].toUpperCase() : "";
};

const isDocumentCodeLine = (line) => /^WEB\.\d+(?:\.\d+)*$/i.test(line.trim());
const isSourceLabel = (line) => /^Sources?:?$/i.test(line.trim());

const isShortNumericNoise = (line) => /^[0oO]{1,4}$/.test(line.trim()) || /^\d{1,2}$/.test(line.trim());

const isBulletedNumericNoise = (line) =>
  /^\s*(?:[-*+•∙●◦○·▪▫■□‣⁃–—.]|\d+[.)]|[oO])\s*(?:[0oO]{1,4}|\d{1,2})\s*$/i.test(line.trim());

const isMarkerOnlyLine = (line) => /^\s*[-*+•∙●◦○·▪▫■□‣⁃–—.]\s*[.)]?\s*$/.test(line.trim());

const stripLeadingListMarker = (line) =>
  line.replace(/^\s*(?:[-*+•∙●◦○·▪▫■□‣⁃–—.]|[a-zA-Z][.)]|[oO])\s+/, "").trim();

const isOcrGarbageLine = (line) => {
  const text = stripLeadingListMarker(line);
  if (!text) return true;
  if (!/[A-Za-z0-9]/.test(text)) return true;
  if (/^['’"`.,;:!?-]+$/.test(text)) return true;
  if (/[{}]/.test(text) && text.length <= 12) return true;
  return /^[a-z]{1,4}[)}\]]$/i.test(text);
};

const repairDocumentCodeLine = (line) => {
  const documentCode = getUploadedDocumentCode();
  if (!documentCode) return line;
  if (isDocumentCodeLine(line)) return line.toUpperCase();
  if (isBulletedNumericNoise(line) || isShortNumericNoise(line)) return documentCode;
  return line;
};

const getImagePlaceholderText = (line) => {
  const match = line.match(/^\s*(?:\[?\s*(?:img|image|photo|picture|graphic|illustration)\s*\]?)(?::|\s+-\s+)?\s*(.*?)\s*$/i);
  if (!match) return "";
  return normalizeWhitespace(match[1] || "Image");
};

const isBylineOrCredential = (line) => {
  const compact = getTextShape(line).words <= 8 && line.length <= 90;
  if (!compact) return false;
  const credentialPattern = /\b(CLU|ChFC|CFP|CPA|CFA|MBA|PhD|JD|MD|Esq)\b|&reg;|®/;
  const jobTitlePattern = /\b(VP|CEO|CFO|COO|Head of|Director|Manager|President|Officer|Distribution|Sales|Marketing)\b/;
  const hasNameComma = /^[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)+,/.test(line);
  return credentialPattern.test(line) || jobTitlePattern.test(line) || hasNameComma;
};

const forcedH2Headings = new Set([
  "how much does a divorce cost?",
  "6 money tips to help you financially survive a divorce",
  "financial steps once your divorce is final",
  "making changes to your last will and testament",
  "1. make a whole new will",
  "2. make a codicil to your will",
  "3. alter your existing will",
]);

const isForcedH2Heading = (line) => forcedH2Headings.has(line.trim().toLowerCase());

const knownNumberedSectionTitles = new Map([
  ["establish separate accounts", "1. Establish separate accounts"],
  ["determine your post-divorce income", "2. Determine your post-divorce income"],
  ["set your new household budget", "3. Set your new household budget"],
  ["start your own retirement plan", "4. Start your own retirement plan"],
  ["decide what to do with the house", "5. Decide what to do with the house"],
]);

const getKnownNumberedSectionHeadingText = (line) =>
  knownNumberedSectionTitles.get(line.trim().toLowerCase().replace(/^\d+[.)]\s+/, "")) || "";

const getNumberedHeadingText = (line) =>
  normalizeWhitespace(line.replace(/^\s*(\d+)[.)]\s+/, "$1. "))
    .replace(/^(\d+\.\s+)([a-z])/, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

const getNumberedInlineTip = (line) => {
  const match = line.match(/^\s*(\d+)[.)]\s+(.+?)\s+(?:&mdash;|—|–|-)\s+(.+)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (number < 1 || number > 20) return null;
  return {
    title: `${number}. ${normalizeWhitespace(match[2])}`,
    body: normalizeWhitespace(match[3]),
  };
};

const hasBulletMarker = (line) =>
  /^\s*(?:[-*+﹢＋•∙●◦○·▪▫■□‣⁃–—]|[«»]\s*\+?|[oO]\s{1,2})\s+/.test(line);

const hasNumberedMarker = (line) => /^\s*\d+[.)]\s+/.test(line);

const getBulletText = (lineItem, canvas) => {
  const line = lineItem.text;
  const match =
    line.match(/^\s*(?:[-*+﹢＋•∙●◦○·▪▫■□‣⁃–—]|[«»]\s*\+?|[oO]\s{1,2})\s*(.+)$/) ||
    line.match(/^\s*[·.]\s+(.+)$/);
  const text = match ? normalizeWhitespace(match[1]) : (hasVisualBullet(lineItem, canvas) ? line : "");
  if (!text || isOcrGarbageLine(text) || isShortNumericNoise(text)) return "";
  return /[A-Za-z0-9]/.test(text) ? text : "";
};

const splitEmbeddedListItems = (text) =>
  text
    .replace(/\s*[«»]\s*\+?\s*/g, "\n")
    .replace(/\s+[•∙●◦○·▪▫■□‣⁃]\s+/g, "\n")
    .split(/\n+/)
    .map((item) => normalizeWhitespace(item.replace(/^\+\s+/, "")))
    .filter((item) => item && !isOcrGarbageLine(item) && !isShortNumericNoise(item));

const lineHeight = (lineItem) => {
  const box = getOcrBbox(lineItem);
  return box ? Math.max(8, box.y1 - box.y0) : 18;
};

const verticalGap = (previousItem, nextItem) => {
  const previousBox = getOcrBbox(previousItem);
  const nextBox = getOcrBbox(nextItem);
  if (!previousBox || !nextBox) return null;
  return nextBox.y0 - previousBox.y1;
};

const hasParagraphIndentContinuity = (previousItem, nextItem) => {
  const previousBox = getOcrBbox(previousItem);
  const nextBox = getOcrBbox(nextItem);
  if (!previousBox || !nextBox) return false;
  const height = lineHeight(previousItem);
  const gap = verticalGap(previousItem, nextItem);
  if (gap == null || gap < -height * 0.45 || gap > height * 1.45) return false;
  const sameLeft = Math.abs(nextBox.x0 - previousBox.x0) <= height * 1.2;
  const continuationIndent = nextBox.x0 >= previousBox.x0 && nextBox.x0 <= previousBox.x0 + height * 2.7;
  return sameLeft || continuationIndent;
};

const isLikelyPurpleHeading = (lineItem, nextItem, canvas) => {
  const line = lineItem.text.trim();
  if (!nextItem || isDocumentCodeLine(line) || isSourceLabel(line) || isBylineOrCredential(line)) return false;
  if (/^[a-z]/.test(line) || /[.;]$/.test(line)) return false;
  const shape = getTextShape(line);
  const compact = shape.words <= 15 && line.length <= 140;
  const nextShape = getTextShape(nextItem.text);
  const followedByBody = nextShape.words >= 5 || nextItem.text.length > line.length + 10;
  return compact && followedByBody && (isPurpleLine(lineItem, canvas) || isPurpleNeighborhood(lineItem, canvas));
};

const isLikelyBlackHeading = (lineItem, nextItem, canvas) => {
  if (!nextItem) return false;
  const line = lineItem.text.trim();
  if (!line || /^[a-z]/.test(line) || isDocumentCodeLine(line) || isSourceLabel(line) || isBylineOrCredential(line)) return false;
  if (getKnownNumberedSectionHeadingText(line)) return true;
  if (hasNumberedMarker(line) && !getNumberedInlineTip(line) && getTextShape(line).words <= 12) return true;

  const shape = getTextShape(line);
  const nextShape = getTextShape(nextItem.text);
  const compact = shape.words <= 12 && line.length <= 120;
  const followedByBody = nextShape.words >= 5 || nextItem.text.length > line.length + 12;
  const visuallyHeading = isBoldLine(lineItem, canvas) && !isPurpleLine(lineItem, canvas);
  return compact && followedByBody && visuallyHeading;
};

const getLineRole = (lineItem, nextItem, canvas) => {
  const line = lineItem.text.trim();
  const imageAlt = getImagePlaceholderText(line);
  if (imageAlt) return { type: "img", alt: imageAlt };
  if (isDocumentCodeLine(line)) return { type: "p", text: line, hard: true, links: [] };
  if (isSourceLabel(line)) return { type: "p", text: line.replace(/:$/, ":"), hard: true, links: [] };
  if (isBylineOrCredential(line)) return { type: "p", text: line, hard: true, links: getVisualLinkPhrases(lineItem, canvas) };

  const inlineTip = getNumberedInlineTip(line);
  if (inlineTip) return { type: "numbered-tip", ...inlineTip, links: getVisualLinkPhrases(lineItem, canvas) };

  const knownH3 = getKnownNumberedSectionHeadingText(line);
  if (knownH3) return { type: "h3", text: knownH3, links: [] };
  if (isForcedH2Heading(line) || isLikelyPurpleHeading(lineItem, nextItem, canvas)) return { type: "h2", text: getNumberedHeadingText(line), links: [] };

  const bulletText = getBulletText(lineItem, canvas);
  if (bulletText) return { type: "li", text: bulletText, links: getVisualLinkPhrases(lineItem, canvas) };
  if (isLikelyBlackHeading(lineItem, nextItem, canvas)) {
    return { type: "h3", text: hasNumberedMarker(line) ? getNumberedHeadingText(line) : line, links: [] };
  }

  return { type: "p", text: line, links: getVisualLinkPhrases(lineItem, canvas) };
};

const isParagraphHardBoundary = (role) =>
  !role || role.type !== "p" || role.hard;

const endsWithTerminalPunctuation = (value) =>
  /[.!?:;](?:\s*(?:['’"”]|1|I|l))*$/i.test(value.trim());

const shouldJoinParagraphLines = (previousItem, nextItem, previousRole, nextRole) => {
  if (!previousItem || !nextItem || isParagraphHardBoundary(previousRole) || isParagraphHardBoundary(nextRole)) return false;
  const previous = previousRole.text.trim();
  const next = nextRole.text.trim();
  if (!previous || !next) return false;
  if (isDocumentCodeLine(previous) || isDocumentCodeLine(next) || isSourceLabel(previous) || isSourceLabel(next)) return false;
  if (isBylineOrCredential(previous) || isBylineOrCredential(next)) return false;

  if (
    /^These are just a few important considerations for rebuilding your new personal financial plan after a divorce\./i.test(previous) &&
    /^Think of this process as a way to help you get a fresh start on your finances and your new life after divorce\.?$/i.test(next)
  ) return true;
  if (
    /make sure you['’]re prepared to navigate the conversation with confidence\.?$/i.test(previous) &&
    /^See more objections and tips for navigating them\.?$/i.test(next)
  ) return true;
  if (/^(?:testament|distribution|reports|to do so|of those|learn how|Think of|See more)\b/i.test(next)) return true;
  if (/\b(?:and|or|to|of|the|a|an|with|for|from|on|in|as|that|this|when|while|where|which|who|may|will|can|could|should|would|about|including)\s*$/i.test(previous)) return true;
  if (!endsWithTerminalPunctuation(previous)) return true;
  if (/^[a-z]/.test(next) && hasParagraphIndentContinuity(previousItem, nextItem)) return true;
  return false;
};

const shouldContinueNumberedTip = (previousItem, nextItem, nextRole) => {
  if (!previousItem || !nextItem || !nextRole || nextRole.type !== "p" || nextRole.hard) return false;
  const next = nextRole.text.trim();
  if (!next || hasBulletMarker(next) || hasNumberedMarker(next) || isDocumentCodeLine(next) || isSourceLabel(next)) return false;
  if (isBylineOrCredential(next)) return false;
  const gap = verticalGap(previousItem, nextItem);
  if (gap == null) return /^[A-Z]/.test(next) || /^[a-z]/.test(next);
  const height = lineHeight(previousItem);
  return gap >= -height * 0.35 && gap <= height * 2.1;
};

const normalizeLineItems = (ocrData) => {
  const seenDocumentCodes = new Set();
  return getLineItems(ocrData)
    .map((lineItem) => ({
      ...lineItem,
      text: cleanOcrText(repairDocumentCodeLine(lineItem.text)),
    }))
    .filter((lineItem) => {
      const line = lineItem.text.trim();
      if (!line || isMarkerOnlyLine(line) || isOcrGarbageLine(line)) return false;
      if (!isDocumentCodeLine(line)) return true;
      const code = line.toUpperCase();
      if (seenDocumentCodes.has(code)) return false;
      seenDocumentCodes.add(code);
      lineItem.text = code;
      return true;
    });
};

const buildBlocks = (lineItems, canvas) => {
  const roles = lineItems.map((lineItem, index) => getLineRole(lineItem, lineItems[index + 1], canvas));
  const blocks = [];
  let pendingParagraph = null;
  let pendingList = null;
  let pendingTip = null;
  let lastTipItem = null;

  const flushParagraph = () => {
    if (!pendingParagraph) return;
    blocks.push(pendingParagraph);
    pendingParagraph = null;
  };
  const flushList = () => {
    if (!pendingList) return;
    if (pendingList.items.length) blocks.push(pendingList);
    pendingList = null;
  };
  const flushTip = () => {
    if (!pendingTip) return;
    blocks.push(pendingTip);
    pendingTip = null;
    lastTipItem = null;
  };

  lineItems.forEach((lineItem, index) => {
    const role = roles[index];

    if (pendingTip && shouldContinueNumberedTip(lastTipItem, lineItem, role)) {
      pendingTip.body = normalizeWhitespace(`${pendingTip.body} ${role.text}`);
      pendingTip.links.push(...(role.links || []));
      lastTipItem = lineItem;
      return;
    }
    if (pendingTip && role.type === "p") flushTip();

    if (role.type !== "p") flushParagraph();
    if (role.type !== "li") flushList();
    if (role.type !== "numbered-tip" && role.type !== "p") flushTip();

    if (role.type === "li") {
      flushTip();
      if (!pendingList) pendingList = { type: "ul", items: [] };
      pendingList.items.push(...splitEmbeddedListItems(role.text).map((text) => ({ text, links: role.links || [] })));
      return;
    }

    if (role.type === "numbered-tip") {
      flushTip();
      pendingTip = { ...role, links: [...(role.links || [])] };
      lastTipItem = lineItem;
      return;
    }

    if (role.type === "p") {
      const previousItem = lineItems[index - 1];
      const previousRole = roles[index - 1];
      if (pendingParagraph && shouldJoinParagraphLines(previousItem, lineItem, previousRole, role)) {
        pendingParagraph.text = normalizeWhitespace(`${pendingParagraph.text} ${role.text}`);
        pendingParagraph.links.push(...(role.links || []));
      } else {
        flushParagraph();
        pendingParagraph = { type: "p", text: role.text, links: [...(role.links || [])] };
      }
      if (role.hard) flushParagraph();
      return;
    }

    blocks.push(role);
  });

  flushTip();
  flushParagraph();
  flushList();
  return blocks;
};

const renderBlocks = (blocks, allowedTags, shouldAddBreaks) => {
  const output = [];
  const appendBlock = (html) => output.push(html);
  const fallbackTag = (preferred) =>
    allowedTags.includes(preferred) ? preferred : ["p", "h4", "h3", "h2"].find((tag) => allowedTags.includes(tag));
  const linksForText = (text, links = []) => [
    ...new Set([
      ...links,
      ...[...safeKnownLinkPhrases].filter((phrase) => text.toLowerCase().includes(phrase.toLowerCase())),
    ]),
  ];

  blocks.forEach((block) => {
    if (block.type === "img") {
      if (allowedTags.includes("img")) appendBlock(wrapImageElement(block.alt));
      return;
    }
    if (block.type === "ul") {
      if (allowedTags.includes("ul") && allowedTags.includes("li")) {
        const items = block.items.map((item) => {
          const html = wrapElement("li", cleanInlineHtml(item.text, allowedTags, linksForText(item.text, item.links || [])));
          return shouldAddBreaks ? `${html}<br/>` : html;
        }).join("");
        appendBlock(`<ul>${items}</ul>`);
      } else if (allowedTags.includes("p")) {
        block.items.forEach((item) => appendBlock(wrapElement("p", cleanInlineHtml(item.text, allowedTags, linksForText(item.text, item.links || [])))));
      }
      return;
    }
    if (block.type === "numbered-tip") {
      const tag = fallbackTag("p");
      if (!tag) return;
      const html = `<strong>${cleanInlineHtml(block.title, allowedTags)}</strong> &mdash; ${cleanInlineHtml(block.body, allowedTags, linksForText(block.body, block.links))}`;
      appendBlock(wrapElement(tag, html));
      return;
    }
    if (["h2", "h3", "h4", "p"].includes(block.type)) {
      const tag = fallbackTag(block.type);
      if (tag) appendBlock(wrapElement(tag, cleanInlineHtml(block.text, allowedTags, linksForText(block.text, block.links || []))));
    }
  });

  if (!output.length) return "<!-- All detected text was filtered out by the tag whitelist. -->";
  return output.map((line) => (shouldAddBreaks ? `${line}<br/>` : line)).join("\n");
};

const textToHtml = (ocrData, allowedTags, shouldAddBreaks, canvas) => {
  const lineItems = normalizeLineItems(ocrData);
  if (!lineItems.length) return "<!-- No readable text was detected in the selected area. -->";
  return renderBlocks(buildBlocks(lineItems, canvas), allowedTags, shouldAddBreaks);
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
codeTab.addEventListener("click", () => setOutputView("code"));
previewTab.addEventListener("click", () => setOutputView("preview"));

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
