import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (message) => console.log("CONSOLE:", message.type(), message.text().slice(0, 200)));
page.on("pageerror", (error) => console.log("PAGEERROR:", error.message.slice(0, 300)));
await page.goto("http://localhost:5173/");
await page.getByRole("article").filter({ hasText: "Friday, 16:58" }).getByRole("button").click();
await page.getByRole("heading", { name: "Jev", exact: true }).waitFor();
await page.waitForTimeout(1000);
const info = await page.evaluate(() => {
  const svg = document.querySelector("svg");
  if (!svg) return { found: false };
  const nodes = [...svg.querySelectorAll("rect, text, line")];
  let chain: unknown[] = [];
  let el: Element | null = svg;
  for (let i = 0; i < 4 && el; i += 1) {
    const rect = el.getBoundingClientRect();
    chain.push({ tag: el.tagName, cls: (el as HTMLElement).className?.toString?.().slice(0, 80), w: rect.width, h: rect.height });
    el = el.parentElement;
  }
  return {
    found: true,
    chain,
    svgRect: svg.getBoundingClientRect().toJSON(),
    viewBox: svg.getAttribute("viewBox"),
    htmlLength: svg.outerHTML.length,
    childCount: nodes.length,
    firstRects: nodes.slice(0, 4).map((node) => ({
      tag: node.tagName,
      rect: node.getBoundingClientRect().toJSON(),
      fill: node.getAttribute("fill"),
      stroke: node.getAttribute("stroke"),
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
console.log("VIEWBOX:", info.found ? info.viewBox : "n/a");
const probe = await page.evaluate(() => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-5 -5 10 10");
  svg.style.width = "100px";
  svg.style.height = "100px";
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "-4");
  rect.setAttribute("y", "-4");
  rect.setAttribute("width", "8");
  rect.setAttribute("height", "8");
  rect.setAttribute("fill", "red");
  svg.appendChild(rect);
  document.body.appendChild(svg);
  const matrix = svg.getScreenCTM();
  const out = { a: matrix?.a, d: matrix?.d, rect: rect.getBoundingClientRect().toJSON() };
  svg.remove();
  return out;
});
console.log("PROBE:", JSON.stringify(probe));
console.log("SVG RECT", JSON.stringify(info.found ? info.svgRect : null));
const head = await page.evaluate(() => document.querySelector("svg")?.outerHTML.slice(0, 160));
console.log("HEAD:", head);
const ctm = await page.evaluate(() => {
  const svg = document.querySelector("svg");
  const matrix = svg?.getScreenCTM();
  const text = svg?.querySelector("text") as SVGGraphicsElement | null;
  return { svg: matrix ? [matrix.a, matrix.d, matrix.e, matrix.f] : null, textRect: text?.getBoundingClientRect().toJSON() };
});
console.log("CTM:", JSON.stringify(ctm));

const fresh = await page.evaluate(() => {
  const svg = document.querySelector("svg") as SVGSVGElement;
  const read = () => { const m = svg.getScreenCTM(); return [m?.a, m?.d]; };
  const out: Record<string, unknown> = { initial: read() };
  svg.style.width = "346px";
  svg.style.height = "538px";
  out.inlinePx = read();
  return out;
});
console.log("FRESH:", JSON.stringify(fresh));
const experiments = await page.evaluate(() => {
  const svg = document.querySelector("svg") as SVGSVGElement;
  const read = () => { const m = svg.getScreenCTM(); return [m?.a, m?.d]; };
  const out: Record<string, unknown> = {};
  out.initial = read();
  svg.style.width = "346px";
  svg.style.height = "538px";
  out.inlineSize = read();
  svg.removeAttribute("preserveAspectRatio");
  out.noPar = read();
  svg.setAttribute("viewBox", "0 0 104 86");
  out.positiveViewBox = read();
  svg.setAttribute("viewBox", "-5.2 -4 -10.4 8.6");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.style.width = "346px";
  clone.style.height = "538px";
  document.body.appendChild(clone);
  const m2 = clone.getScreenCTM();
  out.cloneInline = [m2?.a, m2?.d];
  out.cls = svg.getAttribute("class");
  const style = getComputedStyle(svg);
  out.computed = { width: style.width, height: style.height, display: style.display, minWidth: style.minWidth, maxWidth: style.maxWidth };
  clone.remove();
  return out;
});
console.log("EXPERIMENTS:", JSON.stringify(experiments));
const variants = await page.evaluate(() => {
  const svg = document.querySelector("svg") as SVGSVGElement;
  const read = () => { const m = svg.getScreenCTM(); return [m?.a, m?.d]; };
  const out: Record<string, unknown> = {};
  for (const vb of ["-5 -4 10 9", "0 -4 10.4 8.6", "-5.2 0 10.4 8.6", "0 0 10.4 8.6", "-5.2 -4 10.4 8.6"]) {
    svg.setAttribute("viewBox", vb);
    out[vb] = read();
  }
  return out;
});
console.log("VARIANTS:", JSON.stringify(variants));
await browser.close();
