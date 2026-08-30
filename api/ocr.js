const { createCanvas, Image } = require("canvas");
const { recognize } = require("tesseract.js");

const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

globalThis.Image = Image;

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function renderPage(pdf, pageNumber, scale, factory) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvasAndContext = factory.create(viewport.width, viewport.height);
  const ctx = canvasAndContext.context;

  await page.render({
    canvasContext: ctx,
    viewport,
    canvasFactory: factory,
  }).promise;

  return canvasAndContext.canvas;
}

async function ocrCanvas(canvasObj) {
  const buffer = canvasObj.toBuffer("image/png");
  const { data } = await recognize(buffer, "eng");
  return (data && data.text) || "";
}

async function ocrPdf(buffer) {
  const data = new Uint8Array(buffer);
  const factory = new NodeCanvasFactory();
  const pdf = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    canvasFactory: factory,
  }).promise;

  const numPages = pdf.numPages;
  const pages = [];

  for (let i = 1; i <= numPages; i++) {
    const canvas = await renderPage(pdf, i, 2, factory);
    const text = await ocrCanvas(canvas);
    pages.push(`[ Page ${i} ]\n${text}`);
  }

  return pages.join("\n\n");
}

module.exports = { ocrPdf };
