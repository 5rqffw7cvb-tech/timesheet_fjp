/**
 * Bộ ghi giá trị vào file .xlsx ở tầng ZIP/XML.
 *
 * Vì sao không dùng ExcelJS / SheetJS: file template 週報 chứa conditional
 * formatting extension, data validation extension, header/footer và ~250 vùng
 * merge. Các thư viện đọc-rồi-ghi-lại đều làm mất một phần trong số đó.
 * Cách làm ở đây chỉ thay đúng nội dung <c> của những ô cần ghi và giữ nguyên
 * toàn bộ phần còn lại của file, nên format xuất ra giống hệt bản gốc.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

export type CellValue = number | string | boolean | null;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

export function colToNum(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function splitRef(ref: string): { col: string; colNum: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Ô không hợp lệ: ${ref}`);
  return { col: m[1], colNum: colToNum(m[1]), row: Number(m[2]) };
}

/* ────────────────────── thao tác trên XML của 1 sheet ────────────────────── */

interface ParsedCell {
  ref: string;
  colNum: number;
  xml: string;
  style: string | null;
}

function parseStyle(cellXml: string): string | null {
  const m = /\ss="(\d+)"/.exec(cellXml);
  return m ? m[1] : null;
}

function buildCell(ref: string, value: CellValue, style: string | null): string {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === "") return `<c r="${ref}"${s}/>`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><v>${trimNum(value)}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function trimNum(v: number): string {
  // tránh 0.30000000000000004
  const r = Math.round(v * 1e10) / 1e10;
  return String(r);
}

/** Tách các <c> trong nội dung một <row>. */
function parseCells(inner: string): ParsedCell[] {
  const cells: ParsedCell[] = [];
  let i = 0;
  while (i < inner.length) {
    const start = inner.indexOf("<c", i);
    if (start === -1) break;
    // đảm bảo là thẻ <c hoặc <c ... chứ không phải <col
    const after = inner[start + 2];
    if (after !== " " && after !== "/" && after !== ">") { i = start + 2; continue; }

    const tagEnd = inner.indexOf(">", start);
    if (tagEnd === -1) break;
    const selfClosing = inner[tagEnd - 1] === "/";
    let end: number;
    if (selfClosing) {
      end = tagEnd + 1;
    } else {
      const close = inner.indexOf("</c>", tagEnd);
      end = close === -1 ? tagEnd + 1 : close + 4;
    }
    const xml = inner.slice(start, end);
    const refM = /\sr="([A-Z]+\d+)"/.exec(xml);
    if (refM) {
      cells.push({
        ref: refM[1],
        colNum: colToNum(splitRef(refM[1]).col),
        xml,
        style: parseStyle(xml),
      });
    }
    i = end;
  }
  return cells;
}

interface ParsedRow {
  r: number;
  openTag: string;
  inner: string;
}

function parseRows(sheetData: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let i = 0;
  while (i < sheetData.length) {
    const start = sheetData.indexOf("<row", i);
    if (start === -1) break;
    const tagEnd = sheetData.indexOf(">", start);
    if (tagEnd === -1) break;
    const openTag = sheetData.slice(start, tagEnd + 1);
    const selfClosing = sheetData[tagEnd - 1] === "/";
    let inner = "";
    let end: number;
    if (selfClosing) {
      end = tagEnd + 1;
    } else {
      const close = sheetData.indexOf("</row>", tagEnd);
      end = close === -1 ? tagEnd + 1 : close + 6;
      inner = sheetData.slice(tagEnd + 1, close === -1 ? tagEnd + 1 : close);
    }
    const rM = /\sr="(\d+)"/.exec(openTag);
    rows.push({
      r: rM ? Number(rM[1]) : rows.length + 1,
      openTag: selfClosing ? openTag.replace(/\/>$/, ">") : openTag,
      inner,
    });
    i = end;
  }
  return rows;
}

/** Ghi một tập ô vào XML của sheet. Style của ô cũ được giữ nguyên. */
export function writeCells(
  sheetXml: string,
  updates: Map<string, CellValue>,
): string {
  if (updates.size === 0) return sheetXml;

  const emptyMatch = /<sheetData\s*\/>/.exec(sheetXml);
  let sdStart: number, sdEnd: number, sdInner: string;
  if (emptyMatch) {
    sdStart = emptyMatch.index;
    sdEnd = emptyMatch.index + emptyMatch[0].length;
    sdInner = "";
  } else {
    const open = sheetXml.indexOf("<sheetData");
    if (open === -1) throw new Error("Sheet không có <sheetData>");
    const openEnd = sheetXml.indexOf(">", open) + 1;
    const close = sheetXml.indexOf("</sheetData>", openEnd);
    sdStart = open;
    sdEnd = close + "</sheetData>".length;
    sdInner = sheetXml.slice(openEnd, close);
  }

  const rows = parseRows(sdInner);
  const rowMap = new Map<number, ParsedRow>();
  for (const r of rows) rowMap.set(r.r, r);

  // gom update theo dòng
  const byRow = new Map<number, Map<string, CellValue>>();
  for (const [ref, value] of updates) {
    const { row } = splitRef(ref);
    if (!byRow.has(row)) byRow.set(row, new Map());
    byRow.get(row)!.set(ref, value);
  }

  for (const [rowNum, cellUpdates] of byRow) {
    let row = rowMap.get(rowNum);
    if (!row) {
      row = { r: rowNum, openTag: `<row r="${rowNum}">`, inner: "" };
      rowMap.set(rowNum, row);
    }
    const cells = parseCells(row.inner);
    const cellMap = new Map<string, ParsedCell>();
    for (const c of cells) cellMap.set(c.ref, c);

    for (const [ref, value] of cellUpdates) {
      const existing = cellMap.get(ref);
      const style = existing ? existing.style : null;
      cellMap.set(ref, {
        ref,
        colNum: colToNum(splitRef(ref).col),
        xml: buildCell(ref, value, style),
        style,
      });
    }

    const sorted = [...cellMap.values()].sort((a, b) => a.colNum - b.colNum);
    row.inner = sorted.map((c) => c.xml).join("");
    // spans cũ có thể không còn đúng sau khi thêm ô -> bỏ đi, Excel tự tính lại
    row.openTag = row.openTag.replace(/\sspans="[^"]*"/, "");
  }

  const newInner = [...rowMap.values()]
    .sort((a, b) => a.r - b.r)
    .map((r) => `${r.openTag}${r.inner}</row>`)
    .join("");

  return (
    sheetXml.slice(0, sdStart) +
    `<sheetData>${newInner}</sheetData>` +
    sheetXml.slice(sdEnd)
  );
}

/* ────────────────────────── Workbook wrapper ────────────────────────── */

export class XlsxTemplate {
  private files: Record<string, Uint8Array>;
  private sheetPath = new Map<string, string>();   // tên sheet -> đường dẫn xml
  private pending = new Map<string, Map<string, CellValue>>();
  private pendingMerges = new Map<string, string[]>();

  private constructor(files: Record<string, Uint8Array>) {
    this.files = files;
    this.indexSheets();
  }

  static load(buffer: Uint8Array | ArrayBuffer): XlsxTemplate {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return new XlsxTemplate(unzipSync(u8));
  }

  private text(path: string): string {
    const f = this.files[path];
    if (!f) throw new Error(`Template thiếu file ${path}`);
    return strFromU8(f);
  }

  private setText(path: string, value: string) {
    this.files[path] = strToU8(value);
  }

  private indexSheets() {
    const wb = this.text("xl/workbook.xml");
    const rels = this.text("xl/_rels/workbook.xml.rels");

    const relMap = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1];
      const target = /Target="([^"]+)"/.exec(m[0])?.[1];
      if (id && target) {
        relMap.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
      }
    }

    for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
      const name = /name="([^"]*)"/.exec(m[0])?.[1];
      const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
      if (name && rid && relMap.has(rid)) {
        this.sheetPath.set(decodeXml(name), relMap.get(rid)!);
      }
    }
  }

  get sheetNames(): string[] {
    return [...this.sheetPath.keys()];
  }

  /** Đặt giá trị cho một ô. Gọi nhiều lần rồi save() một lượt. */
  set(sheet: string, ref: string, value: CellValue): this {
    if (!this.sheetPath.has(sheet)) {
      throw new Error(`Template không có sheet "${sheet}". Có: ${this.sheetNames.join(", ")}`);
    }
    if (!this.pending.has(sheet)) this.pending.set(sheet, new Map());
    this.pending.get(sheet)!.set(ref, value);
    return this;
  }

  setMany(sheet: string, values: Record<string, CellValue>): this {
    for (const [ref, v] of Object.entries(values)) this.set(sheet, ref, v);
    return this;
  }

  /** Đọc giá trị thô (<v>) của một ô — dùng để kiểm tra template. */
  peek(sheet: string, ref: string): string | null {
    const path = this.sheetPath.get(sheet);
    if (!path) return null;
    const xml = this.text(path);
    const re = new RegExp(`<c[^>]*\\sr="${ref}"[^>]*>([\\s\\S]*?)</c>`);
    const m = re.exec(xml);
    if (!m) return null;
    const v = /<v>([\s\S]*?)<\/v>/.exec(m[1]);
    return v ? v[1] : null;
  }

  /** Bổ sung vùng merge (dùng cho các dòng 予定 chưa được merge sẵn). */
  merge(sheet: string, refs: string[]): this {
    if (!this.pendingMerges.has(sheet)) this.pendingMerges.set(sheet, []);
    this.pendingMerges.get(sheet)!.push(...refs);
    return this;
  }

  save(): Uint8Array {
    for (const [sheet, updates] of this.pending) {
      const path = this.sheetPath.get(sheet)!;
      this.setText(path, writeCells(this.text(path), updates));
    }
    for (const [sheet, refs] of this.pendingMerges) {
      const path = this.sheetPath.get(sheet);
      if (!path) continue;
      this.setText(path, addMerges(this.text(path), refs));
    }
    this.pending.clear();
    this.pendingMerges.clear();
    this.forceRecalcOnOpen();
    return zipSync(this.files, { level: 6 });
  }

  /**
   * Toàn bộ 月間集計シート và 勤務報告書 đều là công thức tham chiếu tới 6 sheet
   * tuần, nên sau khi ghi phải buộc Excel tính lại khi mở file.
   */
  private forceRecalcOnOpen() {
    // calcChain cũ không còn đúng -> xoá cả file lẫn khai báo
    if (this.files["xl/calcChain.xml"]) {
      delete this.files["xl/calcChain.xml"];
      const ct = this.text("[Content_Types].xml").replace(
        /<Override[^>]*calcChain\.xml"[^>]*\/>/g,
        "",
      );
      this.setText("[Content_Types].xml", ct);
      const rels = this.text("xl/_rels/workbook.xml.rels").replace(
        /<Relationship\b[^>]*calcChain\.xml"[^>]*\/>/g,
        "",
      );
      this.setText("xl/_rels/workbook.xml.rels", rels);
    }

    let wb = this.text("xl/workbook.xml");
    if (/<calcPr\b[^>]*\/>/.test(wb)) {
      wb = wb.replace(/<calcPr\b([^>]*)\/>/, (_all, attrs: string) => {
        let a = attrs
          .replace(/\sfullCalcOnLoad="[^"]*"/, "")
          .replace(/\scalcCompleted="[^"]*"/, "")
          .replace(/\scalcId="[^"]*"/, ' calcId="0"');
        if (!/calcId=/.test(a)) a += ' calcId="0"';
        return `<calcPr${a} fullCalcOnLoad="1"/>`;
      });
    } else {
      wb = wb.replace("</workbook>", '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    }
    this.setText("xl/workbook.xml", wb);
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/* ────────────────────────── merge cells ────────────────────────── */

/** Bổ sung vùng merge còn thiếu vào XML của sheet. */
export function addMerges(sheetXml: string, refs: string[]): string {
  if (refs.length === 0) return sheetXml;

  const existing = new Set<string>();
  const block = /<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/.exec(sheetXml);
  const selfClosed = /<mergeCells\b[^>]*\/>/.exec(sheetXml);

  if (block) {
    for (const m of block[1].matchAll(/ref="([^"]+)"/g)) existing.add(m[1]);
  }
  const toAdd = refs.filter((r) => !existing.has(r));
  if (toAdd.length === 0) return sheetXml;

  const items = toAdd.map((r) => `<mergeCell ref="${r}"/>`).join("");
  const total = existing.size + toAdd.length;

  if (block) {
    return (
      sheetXml.slice(0, block.index) +
      `<mergeCells count="${total}">${block[1]}${items}</mergeCells>` +
      sheetXml.slice(block.index + block[0].length)
    );
  }
  if (selfClosed) {
    return (
      sheetXml.slice(0, selfClosed.index) +
      `<mergeCells count="${toAdd.length}">${items}</mergeCells>` +
      sheetXml.slice(selfClosed.index + selfClosed[0].length)
    );
  }
  // chèn ngay sau </sheetData> — đúng thứ tự schema OOXML
  return sheetXml.replace(
    "</sheetData>",
    `</sheetData><mergeCells count="${toAdd.length}">${items}</mergeCells>`,
  );
}
