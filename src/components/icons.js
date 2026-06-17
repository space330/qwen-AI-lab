export const icons = {
  chat: icon("M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"),
  agent: icon("M12 8V4m0 4a4 4 0 0 0-4 4v4h8v-4a4 4 0 0 0-4-4Zm-6 8H4a2 2 0 0 1-2-2v-2m16 4h2a2 2 0 0 0 2-2v-2M9 13h.01M15 13h.01"),
  document: icon("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6"),
  csv: icon("M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 9h16 M4 15h16 M10 9v12"),
  settings: icon("M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.46.5.82.96.96H21a2 2 0 1 1 0 4h-.09c-.46.14-.82.5-.96 1z"),
  send: icon("M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z"),
  upload: icon("M12 3v12 M7 8l5-5 5 5 M5 21h14"),
  copy: icon("M8 8h10v12H8z M6 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"),
  save: icon("M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8"),
  file: icon("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6"),
  panel: icon("M4 4h16v16H4z M15 4v16"),
  menu: icon("M4 6h16 M4 12h16 M4 18h16"),
  plus: icon("M12 5v14 M5 12h14"),
  search: icon("M21 21l-4.35-4.35 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"),
  globe: icon("M12 2A10 10 0 1 0 12 22 A10 10 0 1 0 12 2z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"),
  history: icon("M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 2"),
  edit: icon("M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"),
  trash: icon("M3 6h18 M8 6V4h8v2 M19 6l-1 15H6L5 6 M10 11v6 M14 11v6"),
  download: icon("M12 3v12 M7 10l5 5 5-5 M5 21h14"),
  close: icon("M18 6 6 18 M6 6l12 12"),
};

function icon(path) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path
    .split(" M")
    .map((part, index) => `<path d="${index ? "M" : ""}${part}"></path>`)
    .join("")}</svg>`;
}
