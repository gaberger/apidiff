// Each hostname segment must start with a letter so numeric-dotted inputs
// like "26.3.0" (SemVer) don't backtrack-match as host-like.
const HOST_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+(?:\/[a-z0-9-]+(?:\.[a-z0-9-]+)+)?[./_-]/i;
const DOC_PREFIXES = /^(api|openapi|spec|swagger|docs?)[-._]/i;
const FILE_EXT = /\.(json|ya?ml)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function prettyVersionLabel(label) {
  if (!label) return "";
  let s = String(label).trim();

  let prev;
  do {
    prev = s;
    s = s.replace(HOST_PATTERN, "");
    s = s.replace(DOC_PREFIXES, "");
  } while (s !== prev && s.length > 0);

  s = s.replace(FILE_EXT, "");
  s = s.replace(/^[-._]+/, "").replace(/[-._]+$/, "");

  if (!s) return label;
  if (ISO_DATE.test(s)) return `v${s}`;
  return s;
}
