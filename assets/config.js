/* Dashboard settings */
window.KM_CONFIG = {
  // Live link to your Google Sheet. In the sheet: File > Share > Publish to web >
  // choose "Sheet1" and "Comma-separated values (.csv)" > Publish, then paste the link here.
  // Leave empty to use only the saved data in the data/ folder.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTqWFjsm70JwBmdNzDB575nH8DUUg74HTNXIJz_-VwEdhD1fb8Zv2Dc73UdLjg_Z6PS3OpCv2ccz4fo/pub?gid=0&single=true&output=csv",

  // Optional: a second tab to override scores, published the same way.
  // Columns: Store Code | Audit Cycle (e.g. "October 2026 Cycle") | CCL Score and/or KM Score
  // (Normally not needed: CCL is worked out from the KM score automatically.)
  scoresCsvUrl: "",

  // How many audit cycles to show, counting back from the newest one in the sheet.
  // 3 = e.g. Aug, Sep, Oct; when November is added it becomes Sep, Oct, Nov. 0 = show all.
  monthsToShow: 3,

  // How dates like 05/10/2026 are written in the sheet: "DMY" (5 October) or "MDY" (May 10).
  dateOrder: "DMY",
};
