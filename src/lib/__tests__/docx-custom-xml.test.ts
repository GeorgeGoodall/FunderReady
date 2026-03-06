import { describe, it, expect } from 'vitest';
import {
  buildCustomXml,
  parseCustomXml,
  FUNDERREADY_XML_NAMESPACE,
  type DocxMetadata,
} from '../docx-custom-xml';

const sampleMeta: DocxMetadata = {
  application_id: 'app-123',
  questions_set_id: 'qs-456',
  fund_id: 'fund-789',
  exported_at: '2026-03-06T12:00:00.000Z',
};

describe('buildCustomXml', () => {
  it('produces valid XML with all fields', () => {
    const xml = buildCustomXml(sampleMeta);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(FUNDERREADY_XML_NAMESPACE);
    expect(xml).toContain('<application_id>app-123</application_id>');
    expect(xml).toContain('<questions_set_id>qs-456</questions_set_id>');
    expect(xml).toContain('<fund_id>fund-789</fund_id>');
    expect(xml).toContain('<exported_at>2026-03-06T12:00:00.000Z</exported_at>');
    expect(xml).toContain('<funderready');
    expect(xml).toContain('</funderready>');
  });

  it('escapes XML special characters in values', () => {
    const meta: DocxMetadata = {
      application_id: 'id-with-<angle>&"brackets"',
      questions_set_id: 'qs->test',
      fund_id: 'fund&co',
      exported_at: '2026-03-06T12:00:00.000Z',
    };
    const xml = buildCustomXml(meta);

    expect(xml).not.toContain('<angle>');
    expect(xml).toContain('&lt;angle&gt;');
    expect(xml).toContain('&amp;&quot;brackets&quot;');
    expect(xml).toContain('qs-&gt;test');
    expect(xml).toContain('fund&amp;co');
  });
});

describe('parseCustomXml', () => {
  it('round-trips metadata through build and parse', () => {
    const xml = buildCustomXml(sampleMeta);
    const parsed = parseCustomXml(xml);

    expect(parsed).toEqual(sampleMeta);
  });

  it('round-trips metadata with special characters', () => {
    const meta: DocxMetadata = {
      application_id: 'id-<test>&"value"',
      questions_set_id: 'qs->456',
      fund_id: 'fund&co',
      exported_at: '2026-03-06T12:00:00.000Z',
    };
    const xml = buildCustomXml(meta);
    const parsed = parseCustomXml(xml);

    expect(parsed).toEqual(meta);
  });

  it('returns null for non-FunderReady XML', () => {
    const xml = '<?xml version="1.0"?><root><data>hello</data></root>';
    expect(parseCustomXml(xml)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCustomXml('')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<funderready xmlns="${FUNDERREADY_XML_NAMESPACE}">
  <application_id>app-123</application_id>
  <fund_id>fund-789</fund_id>
</funderready>`;

    expect(parseCustomXml(xml)).toBeNull();
  });
});
