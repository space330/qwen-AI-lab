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

export function parseCsv(content) {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitCsvLine(line));

  if (!rows.length) return { headers: [], rows: [], summary: [] };

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const summary = headers.map((header, colIndex) => {
    const values = dataRows.map((row) => row[colIndex] ?? "").filter(Boolean);
    const numeric = values.map(Number).filter((value) => Number.isFinite(value));
    const emptyCount = dataRows.length - values.length;

    return {
      header,
      count: values.length,
      emptyCount,
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

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 2);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
