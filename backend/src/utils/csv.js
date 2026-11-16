/**
 * CSV Security & Sanitization Utility
 * Neutralizes Formula / CSV Injection (CWE-1236)
 */
export function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Neutralize formula execution triggers in spreadsheet applications (=, +, -, @, |, tab, CR)
  if (/^[=+@\-\|\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export default {
  sanitizeCsvCell,
};
