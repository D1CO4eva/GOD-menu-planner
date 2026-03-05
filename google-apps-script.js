/**
 * Google Apps Script endpoint for Menu Planner -> Google Sheets.
 *
 * Deploy steps:
 * 1) Open your target Google Sheet.
 * 2) Extensions -> Apps Script.
 * 3) Paste this file into Code.gs.
 * 4) Update MENU_SPREADSHEET_ID (required), MENU_SHEET_NAME (optional), and SHARED_TOKEN (recommended).
 * 5) Deploy -> New deployment -> Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6) Copy the Web app URL and paste it into GOOGLE_APPS_SCRIPT_URL in src/App.tsx.
 */

const MENU_SPREADSHEET_ID = ''; // Required: set this to the Google Sheet ID.
const MENU_SHEET_NAME = 'Menu Planner Logs';
const SHARED_TOKEN = ''; // Optional: set a secret string and send it as payload.token from the app.
const PAST_MENUS_FOLDER_NAME = 'Past Menus';
const MAX_ARCHIVED_MENUS = 0; // 0 disables Drive archive pruning.
const DRIVE_RETRY_ATTEMPTS = 3;
const DRIVE_RETRY_DELAY_MS = 250;
const PAST_MENUS_FOLDER_ID_PROPERTY = 'PAST_MENUS_FOLDER_ID';

const PROGRAM_ROW_STYLES = {
  'radha kalyanam': { background: '#FCE8D8', text: '#8A3A00' },
  'mass prayer': { background: '#E3E8FF', text: '#1F2A7A' },
  'nikunja utsavam': { background: '#EFE5FF', text: '#4C1D95' },
  satsang: { background: '#DDF5F2', text: '#0F4A44' },
  other: { background: '#EEF2F7', text: '#334155' },
  default: { background: '#F7F7F7', text: '#1F2937' }
};

const HEADER_ROW = [
  'Program Type',
  'Course Category',
  'Dish Name',
  'Description',
  'Estimated Quantity',
  'Tray Measurement',
  'Volunteer',
  'Preferences'
];

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};

    if (SHARED_TOKEN && safeString_(params.token) !== SHARED_TOKEN) {
      throw new Error('Unauthorized request. Invalid token.');
    }

    const action = safeString_(params.action).trim().toLowerCase();

    if (!action || action === 'status') {
      return jsonResponse_({
        ok: true,
        message: 'Menu Planner Apps Script endpoint is running.',
        supportedActions: ['status', 'list_archives', 'get_archive'],
        spreadsheetConfigured: Boolean(safeString_(MENU_SPREADSHEET_ID).trim()),
        archivesFolder: PAST_MENUS_FOLDER_NAME,
        archiveFormat: 'json',
        maxArchivedMenus: MAX_ARCHIVED_MENUS
      });
    }

    if (action === 'list_archives') {
      const archives = listArchivedJsonFiles_();
      return jsonResponse_({
        ok: true,
        count: archives.length,
        archives: archives
      });
    }

    if (action === 'get_archive') {
      const fileId = safeString_(params.fileId).trim();
      const fileName = safeString_(params.fileName).trim();
      const format = safeString_(params.format).trim().toLowerCase();
      const file = getArchivedJsonFile_(fileId, fileName);
      const jsonText = file.getBlob().getDataAsString('UTF-8');
      const archivePayload = parseJsonSafely_(jsonText);

      if (format === 'raw') {
        return ContentService
          .createTextOutput(jsonText)
          .setMimeType(ContentService.MimeType.JSON);
      }

      return jsonResponse_({
        ok: true,
        file: {
          id: file.getId(),
          name: file.getName(),
          size: file.getSize(),
          createdAt: file.getDateCreated().toISOString(),
          updatedAt: file.getLastUpdated().toISOString()
        },
        archive: archivePayload
      });
    }

    throw new Error('Unsupported action. Use status, list_archives, or get_archive.');
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

/**
 * Manual test helper for doGet.
 * Run from Apps Script editor: select doGetTest -> Run.
 */
function doGetTest() {
  const tokenParam = SHARED_TOKEN ? { token: SHARED_TOKEN } : {};

  const listResponse = doGet({
    parameter: Object.assign({ action: 'list_archives' }, tokenParam)
  });
  Logger.log('list_archives (JSON) => ' + listResponse.getContent());

  const listPayload = JSON.parse(listResponse.getContent());
  if (listPayload && listPayload.ok && listPayload.archives && listPayload.archives.length > 0) {
    const first = listPayload.archives[0];
    const getResponse = doGet({
      parameter: Object.assign(
        {
          action: 'get_archive',
          fileId: first.id
        },
        tokenParam
      )
    });
    Logger.log('get_archive (JSON) => ' + getResponse.getContent().slice(0, 500));
  }

  return listResponse;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    const payload = parsePayload_(e);

    if (SHARED_TOKEN && payload.token !== SHARED_TOKEN) {
      throw new Error('Unauthorized request. Invalid token.');
    }

    validatePayload_(payload);

    const sheet = getOrCreateSheet_(MENU_SHEET_NAME);
    const rows = buildRows_(payload);
    const archiveResult = sheetHasMenuData_(sheet)
      ? archiveCurrentSheetToDrive_(sheet)
      : null;

    overwriteSheetWithRows_(sheet, rows);

    if (rows.length > 0) {
      applyProgramStyling_(sheet, 2, rows.length, HEADER_ROW.length, payload.programType);
    }

    return jsonResponse_({
      ok: true,
      rowCount: rows.length,
      archivedFileName: archiveResult ? archiveResult.fileName : null,
      deletedArchiveCount: archiveResult ? archiveResult.deletedCount : 0,
      message: archiveResult
        ? 'Existing menu archived as JSON and new menu saved to Google Sheet.'
        : 'New menu saved to Google Sheet.'
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manual test helper for doPost.
 * Run from Apps Script editor: select doPostTest -> Run.
 *
 * Notes:
 * - If SHARED_TOKEN is set, this test auto-includes it.
 * - Writes a sample menu into the target sheet.
 */
function doPostTest() {
  const samplePayload = {
    token: SHARED_TOKEN || '',
    programType: 'Satsang',
    preferences: ['Vegetarian only', 'No onion', 'No garlic'],
    volunteers: {
      'Sambar Rice': 'Test Volunteer'
    },
    courses: [
      {
        category: 'Main Course',
        items: [
          {
            name: 'Sambar Rice',
            description: 'Comforting rice with lentil-based sambar.',
            estimatedQuantity: '8 kg rice',
            trayMeasurement: '1 Small Tray'
          }
        ]
      }
    ]
  };

  const fakeEvent = {
    postData: {
      contents: JSON.stringify(samplePayload),
      type: 'text/plain',
      length: JSON.stringify(samplePayload).length
    }
  };

  const response = doPost(fakeEvent);
  Logger.log(response.getContent());
  return response;
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing POST body.');
  }

  const raw = e.postData.contents;

  // App sends JSON in text/plain to keep browser request simple for Web Apps.
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error('Invalid JSON payload.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a JSON object.');
  }

  return payload;
}

function validatePayload_(payload) {
  if (!payload.programType) {
    throw new Error('programType is required.');
  }
  if (!Array.isArray(payload.courses)) {
    throw new Error('courses must be an array.');
  }
}

function buildRows_(payload) {
  const programType = safeString_(payload.programType);
  const preferences = Array.isArray(payload.preferences) ? payload.preferences.join(', ') : '';
  const volunteers = payload.volunteers && typeof payload.volunteers === 'object' ? payload.volunteers : {};

  const rows = [];
  const courses = Array.isArray(payload.courses) ? payload.courses : [];

  courses.forEach(function(course) {
    const category = safeString_(course && course.category);
    const items = Array.isArray(course && course.items) ? course.items : [];

    if (items.length === 0) {
      rows.push([
        programType,
        category,
        '',
        '',
        '',
        '',
        '',
        preferences
      ]);
      return;
    }

    items.forEach(function(item) {
      const name = safeString_(item && item.name);
      rows.push([
        programType,
        category,
        name,
        safeString_(item && item.description),
        safeString_(item && item.estimatedQuantity),
        safeString_(item && item.trayMeasurement),
        safeString_(volunteers[name]),
        preferences
      ]);
    });
  });

  if (rows.length === 0) {
    rows.push([
      programType,
      '',
      '',
      '',
      '',
      '',
      '',
      preferences
    ]);
  }

  return rows;
}

function getOrCreateSheet_(sheetName) {
  const spreadsheetId = safeString_(MENU_SPREADSHEET_ID).trim();
  if (!spreadsheetId) {
    throw new Error('MENU_SPREADSHEET_ID is not configured.');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  if (!spreadsheet) {
    throw new Error('Unable to open spreadsheet by MENU_SPREADSHEET_ID.');
  }

  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  return sheet;
}

function sheetHasMenuData_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= 1) return false;
  if (lastColumn <= 0) return false;

  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues();
  return values.some(function(row) {
    return row.some(function(cell) {
      return String(cell || '').trim() !== '';
    });
  });
}

function overwriteSheetWithRows_(sheet, rows) {
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADER_ROW.length).setValues(rows);
  }
}

function archiveCurrentSheetToDrive_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= 1) return null;
  if (lastColumn <= 0) return null;

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  if (values.length <= 1) return null;

  const programType = inferProgramTypeFromSheet_(values);
  const normalizedProgram = sanitizeFilenamePart_(programType || 'unknown_program');
  const datePart = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Etc/UTC',
    'yyyy-MM-dd'
  );
  const baseName = normalizedProgram + '_' + datePart;

  const folder = getOrCreateFolderByName_(PAST_MENUS_FOLDER_NAME);
  const fileName = getUniqueJsonFileName_(folder, baseName);
  const archivePayload = sheetValuesToArchivePayload_(values);
  const jsonContent = JSON.stringify(archivePayload, null, 2);

  folder.createFile(fileName, jsonContent, 'application/json');
  const deletedCount =
    MAX_ARCHIVED_MENUS > 0 ? pruneOldArchivedJsonFiles_(folder, MAX_ARCHIVED_MENUS) : 0;
  return {
    fileName: fileName,
    deletedCount: deletedCount
  };
}

function inferProgramTypeFromSheet_(sheetValues) {
  for (var i = 1; i < sheetValues.length; i++) {
    var programType = safeString_(sheetValues[i][0]).trim();
    if (programType) return programType;
  }
  return 'unknown_program';
}

function getOrCreateFolderByName_(folderName) {
  const fromId = getFolderByStoredId_();
  if (fromId) return fromId;

  const folders = withDriveRetry_('getOrCreateFolderByName', function() {
    return DriveApp.getFoldersByName(folderName);
  });
  if (folders.hasNext()) {
    const existing = folders.next();
    storePastMenusFolderId_(existing.getId());
    return existing;
  }

  const created = withDriveRetry_('createFolder', function() {
    return DriveApp.createFolder(folderName);
  });
  storePastMenusFolderId_(created.getId());
  return created;
}

function getFolderByName_(folderName) {
  const fromId = getFolderByStoredId_();
  if (fromId) return fromId;

  const folders = withDriveRetry_('getFolderByName', function() {
    return DriveApp.getFoldersByName(folderName);
  });
  if (!folders.hasNext()) return null;
  const folder = folders.next();
  storePastMenusFolderId_(folder.getId());
  return folder;
}

function listArchivedJsonFiles_() {
  let folder = null;
  try {
    folder = getFolderByName_(PAST_MENUS_FOLDER_NAME);
  } catch (err) {
    Logger.log('listArchivedJsonFiles_ folder lookup failed: ' + safeErrorMessage_(err));
    return [];
  }
  if (!folder) return [];

  const files = withDriveRetry_('listArchivedJsonFiles', function() {
    return folder.getFiles();
  });
  const rows = [];
  while (withIteratorRetry_('listArchivedJsonFiles.hasNext', files)) {
    const file = withIteratorNextRetry_('listArchivedJsonFiles.next', files);
    if (!file) continue;

    const name = safeString_(safeDriveCall_('file.getName', function() {
      return file.getName();
    }));
    if (!/\.json$/i.test(name)) continue;

    const id = safeDriveCall_('file.getId', function() {
      return file.getId();
    });
    const size = safeDriveCall_('file.getSize', function() {
      return file.getSize();
    });
    const createdAtDate = safeDriveCall_('file.getDateCreated', function() {
      return file.getDateCreated();
    });
    const updatedAtDate = safeDriveCall_('file.getLastUpdated', function() {
      return file.getLastUpdated();
    });

    rows.push({
      id: safeString_(id),
      name: name,
      size: Number(size) || 0,
      createdAt: toIsoString_(createdAtDate),
      updatedAt: toIsoString_(updatedAtDate)
    });
  }

  rows.sort(function(a, b) {
    const aTime = a && a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b && b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  return rows;
}

function getArchivedJsonFile_(fileId, fileName) {
  if (fileId) {
    const fileById = withDriveRetry_('getArchivedJsonFile.byId', function() {
      return DriveApp.getFileById(fileId);
    });
    if (!/\.json$/i.test(safeString_(fileById.getName()))) {
      throw new Error('Requested file is not a JSON archive.');
    }
    return fileById;
  }

  if (!fileName) {
    throw new Error('fileId or fileName is required for get_archive.');
  }

  const folder = getFolderByName_(PAST_MENUS_FOLDER_NAME);
  if (!folder) {
    throw new Error('Past Menus folder does not exist.');
  }

  const files = withDriveRetry_('getArchivedJsonFile.byName', function() {
    return folder.getFilesByName(fileName);
  });
  if (!files.hasNext()) {
    throw new Error('JSON archive not found: ' + fileName);
  }

  const file = files.next();
  if (!/\.json$/i.test(safeString_(file.getName()))) {
    throw new Error('Requested file is not a JSON archive.');
  }
  return file;
}

function getUniqueJsonFileName_(folder, baseName) {
  const normalizedBase = sanitizeFilenamePart_(baseName);
  const firstAttempt = normalizedBase + '.json';

  if (!folder.getFilesByName(firstAttempt).hasNext()) {
    return firstAttempt;
  }

  let counter = 2;
  while (true) {
    const candidate = normalizedBase + '_' + counter + '.json';
    if (!folder.getFilesByName(candidate).hasNext()) {
      return candidate;
    }
    counter++;
  }
}

function pruneOldArchivedJsonFiles_(folder, maxFileCount) {
  if (!maxFileCount || maxFileCount < 1) return 0;

  const files = folder.getFiles();
  const archives = [];
  while (files.hasNext()) {
    const file = files.next();
    const name = safeString_(file.getName());
    if (!/\.json$/i.test(name)) continue;

    archives.push({
      file: file,
      updatedAtMs: file.getLastUpdated().getTime(),
      createdAtMs: file.getDateCreated().getTime()
    });
  }

  archives.sort(function(a, b) {
    if (b.updatedAtMs !== a.updatedAtMs) return b.updatedAtMs - a.updatedAtMs;
    return b.createdAtMs - a.createdAtMs;
  });

  let deletedCount = 0;
  for (var i = maxFileCount; i < archives.length; i++) {
    archives[i].file.setTrashed(true);
    deletedCount++;
  }
  return deletedCount;
}

function sheetValuesToArchivePayload_(values) {
  const headers = (values && values[0] && values[0].length > 0 ? values[0] : HEADER_ROW).map(function(header) {
    return safeString_(header);
  });
  const dataRows = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowObject = {};
    var hasValue = false;

    headers.forEach(function(header, index) {
      var cellValue = safeString_(row && row[index]);
      if (cellValue.trim()) hasValue = true;
      rowObject[header] = cellValue;
    });

    if (hasValue) {
      dataRows.push(rowObject);
    }
  }

  const preferencesText = dataRows.reduce(function(found, rowObject) {
    return found || safeString_(rowObject['Preferences']).trim();
  }, '');

  const preferences = preferencesText
    ? preferencesText.split(',').map(function(entry) {
        return safeString_(entry).trim();
      }).filter(function(entry) {
        return Boolean(entry);
      })
    : [];

  const courseMap = {};
  const courseOrder = [];
  const volunteers = {};

  dataRows.forEach(function(rowObject) {
    const category = safeString_(rowObject['Course Category']).trim() || 'Uncategorized';
    if (!courseMap[category]) {
      courseMap[category] = [];
      courseOrder.push(category);
    }

    const dishName = safeString_(rowObject['Dish Name']).trim();
    if (!dishName) return;

    courseMap[category].push({
      name: dishName,
      description: safeString_(rowObject['Description']),
      estimatedQuantity: safeString_(rowObject['Estimated Quantity']),
      trayMeasurement: safeString_(rowObject['Tray Measurement'])
    });

    const volunteer = safeString_(rowObject['Volunteer']).trim();
    if (volunteer) {
      volunteers[dishName] = volunteer;
    }
  });

  const courses = courseOrder.map(function(category) {
    return {
      category: category,
      items: courseMap[category]
    };
  });

  return {
    version: 1,
    format: 'menu-archive-json',
    archivedAt: new Date().toISOString(),
    programType: inferProgramTypeFromSheet_(values),
    preferences: preferences,
    volunteers: volunteers,
    courses: courses,
    sheetSnapshot: {
      headers: headers,
      rows: dataRows
    }
  };
}

function sanitizeFilenamePart_(value) {
  const normalized = safeString_(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');

  return normalized || 'menu';
}

function ensureHeaderRow_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, HEADER_ROW.length).getValues()[0];
  const headersMatch = HEADER_ROW.every(function(header, index) {
    return String(currentHeaders[index] || '') === header;
  });

  if (!headersMatch) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
  }
}

function applyProgramStyling_(sheet, startRow, rowCount, columnCount, programType) {
  if (!rowCount || rowCount <= 0) return;

  const style = getProgramStyle_(programType);
  const range = sheet.getRange(startRow, 1, rowCount, columnCount);

  range.setBackground(style.background);
  range.setFontColor(style.text);

  // Emphasize key identity columns for quicker scanning.
  sheet.getRange(startRow, 1, rowCount, 1).setFontWeight('bold'); // Program Type
  sheet.getRange(startRow, 2, rowCount, 1).setFontWeight('bold'); // Course Category
  sheet.getRange(startRow, 3, rowCount, 1).setFontWeight('bold'); // Dish Name
}

function getProgramStyle_(programType) {
  const normalized = safeString_(programType).trim().toLowerCase();
  if (!normalized) return PROGRAM_ROW_STYLES.default;

  return PROGRAM_ROW_STYLES[normalized] || PROGRAM_ROW_STYLES.default;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function withDriveRetry_(operationName, operationFn) {
  let lastError = null;
  for (var attempt = 1; attempt <= DRIVE_RETRY_ATTEMPTS; attempt++) {
    try {
      return operationFn();
    } catch (err) {
      lastError = err;
      if (!isRetryableDriveError_(err) || attempt === DRIVE_RETRY_ATTEMPTS) {
        break;
      }
      Utilities.sleep(DRIVE_RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(operationName + ' failed: ' + safeErrorMessage_(lastError));
}

function getFolderByStoredId_() {
  const props = PropertiesService.getScriptProperties();
  const folderId = safeString_(props.getProperty(PAST_MENUS_FOLDER_ID_PROPERTY)).trim();
  if (!folderId) return null;

  try {
    const folder = withDriveRetry_('getFolderByStoredId', function() {
      return DriveApp.getFolderById(folderId);
    });
    return folder || null;
  } catch (err) {
    Logger.log('Stored folder ID invalid. Clearing property. Error: ' + safeErrorMessage_(err));
    props.deleteProperty(PAST_MENUS_FOLDER_ID_PROPERTY);
    return null;
  }
}

function storePastMenusFolderId_(folderId) {
  const id = safeString_(folderId).trim();
  if (!id) return;
  PropertiesService.getScriptProperties().setProperty(PAST_MENUS_FOLDER_ID_PROPERTY, id);
}

function withIteratorRetry_(operationName, iterator) {
  return withDriveRetry_(operationName, function() {
    return iterator.hasNext();
  });
}

function withIteratorNextRetry_(operationName, iterator) {
  return withDriveRetry_(operationName, function() {
    return iterator.next();
  });
}

function safeDriveCall_(operationName, operationFn) {
  try {
    return withDriveRetry_(operationName, operationFn);
  } catch (err) {
    // Skip single-file metadata failures instead of failing the whole response.
    Logger.log(operationName + ' skipped due to error: ' + safeErrorMessage_(err));
    return null;
  }
}

function isRetryableDriveError_(err) {
  const message = safeErrorMessage_(err).toLowerCase();
  return (
    message.indexOf('server error occurred') >= 0 ||
    message.indexOf('service unavailable') >= 0 ||
    message.indexOf('timed out') >= 0 ||
    message.indexOf('rate limit') >= 0
  );
}

function safeErrorMessage_(err) {
  if (!err) return 'Unknown error';
  if (err && err.message) return String(err.message);
  return String(err);
}

function toIsoString_(value) {
  if (!value) return null;
  if (typeof value.toISOString === 'function') {
    return value.toISOString();
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseJsonSafely_(rawText) {
  const text = safeString_(rawText);
  try {
    return JSON.parse(text);
  } catch (err) {
    return {
      parseError: String(err && err.message ? err.message : err),
      raw: text
    };
  }
}

function safeString_(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}
