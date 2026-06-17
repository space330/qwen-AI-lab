export const allowedFileTypes = [".txt", ".md", ".csv"];

export function getFileExtension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

export function isAllowedFile(fileName) {
  return allowedFileTypes.includes(getFileExtension(fileName));
}

export async function readUploadFile(file) {
  if (!isAllowedFile(file.name)) {
    throw new Error("仅支持上传 txt、md、csv 文件。");
  }

  const content = await file.text();
  return {
    name: file.name,
    type: getFileExtension(file.name).replace(".", ""),
    size: file.size,
    content,
    uploadedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  };
}

// Deterministic CSV parsing engine.
//
// The parser is a single-pass character state machine over the *entire*
// file rather than a line-by-line split. That is what makes quoted fields
// containing the delimiter, escaped quotes ("") and embedded newlines
// (multi-line cells) parse correctly — inside quotes a newline is data,
// not a record boundary. Output is fully deterministic: identical input
// always yields identical { headers, rows, summary }.
export function parseCsv(content, options = {}) {
  if (typeof content !== "string" || content === "") {
    return { headers: [], rows: [], summary: [] };
  }

  const delimiter = options.delimiter ?? ",";
  // Strip a leading UTF-8 BOM (common in Excel exports) so it does not
  // contaminate the first header name.
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  // Drop records that are a single empty field — i.e. blank lines and the
  // artifact of a trailing newline — while keeping legitimately empty cells
  // such as ",," (which tokenizes to ["", "", ""]).
  const records = tokenizeCsv(clean, delimiter).filter(
    (record) => !(record.length === 1 && record[0] === "")
  );

  if (!records.length) return { headers: [], rows: [], summary: [] };

  const headers = records[0].map((header) => header.trim());
  const dataRows = records.slice(1);

  const summary = headers.map((header, colIndex) => {
    const filled = dataRows
      .map((row) => row[colIndex] ?? "")
      .filter((value) => value.trim() !== "");
    const numeric = filled
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    return {
      header,
      count: filled.length,
      emptyCount: dataRows.length - filled.length,
      numericCount: numeric.length,
      min: numeric.length ? Math.min(...numeric) : null,
      max: numeric.length ? Math.max(...numeric) : null,
      avg: numeric.length
        ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length
        : null,
    };
  });

  return { headers, rows: dataRows, summary };
}

// Tokenize raw CSV text into an array of records (each an array of string
// cells). Handles LF / CRLF / lone-CR line endings, quoted fields with
// embedded delimiters and newlines, and escaped quotes (""). Unquoted
// cells are trimmed of surrounding whitespace; quoted cells are preserved
// verbatim so intentional spacing and leading zeros survive.
function tokenizeCsv(text, delimiter) {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let fieldQuoted = false; // did this cell contain a quoted segment?
  let fieldStarted = false; // has any char (or opening quote) been seen yet?

  const endField = () => {
    record.push(fieldQuoted ? field : field.trim());
    field = "";
    fieldQuoted = false;
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && !fieldStarted) {
      // A quote is only an opening quote at the very start of a field; a
      // quote that appears mid-field (e.g. 3" pipe) is kept literally.
      inQuotes = true;
      fieldQuoted = true;
      fieldStarted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\n") {
      endRecord();
    } else if (char === "\r") {
      endRecord();
      if (text[i + 1] === "\n") i += 1; // treat CRLF as one terminator
    } else {
      field += char;
      fieldStarted = true;
    }
  }

  // Flush the final field/record unless the text ended exactly on a record
  // boundary, which would otherwise append a spurious empty record.
  const endedOnBoundary =
    (text[text.length - 1] === "\n" || text[text.length - 1] === "\r") &&
    field === "" &&
    record.length === 0;

  if (!endedOnBoundary) endRecord();

  return records;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 2);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
