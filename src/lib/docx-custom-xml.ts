export const FUNDERREADY_XML_NAMESPACE = "https://funderready.com/docx-export/v1";

export interface DocxMetadata {
  application_id: string;
  questions_set_id: string;
  fund_id: string;
  exported_at: string;
}

const REQUIRED_FIELDS: (keyof DocxMetadata)[] = [
  'application_id',
  'questions_set_id',
  'fund_id',
  'exported_at',
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function buildCustomXml(meta: DocxMetadata): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<funderready xmlns="${FUNDERREADY_XML_NAMESPACE}">`,
    ...REQUIRED_FIELDS.map(
      (field) => `  <${field}>${escapeXml(meta[field])}</${field}>`
    ),
    '</funderready>',
  ];
  return lines.join('\n');
}

export function parseCustomXml(xml: string): DocxMetadata | null {
  if (!xml) return null;

  // Check for funderready root element with our namespace
  if (!xml.includes(FUNDERREADY_XML_NAMESPACE)) return null;
  if (!/<funderready\s/.test(xml) && !/<funderready>/.test(xml)) return null;

  const result: Partial<DocxMetadata> = {};

  for (const field of REQUIRED_FIELDS) {
    const match = xml.match(new RegExp(`<${field}>([\\s\\S]*?)</${field}>`));
    if (!match) return null;
    result[field] = unescapeXml(match[1]);
  }

  return result as DocxMetadata;
}
