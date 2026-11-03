import { describe, it, expect } from 'vitest';
import { googleDocExportUrl, googleDocId } from './googleDocs';
import { parseGoogleDocsUrl } from './documentImport';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-abcd';

describe('googleDocId', () => {
  it('reads the id from the links Google gives out', () => {
    expect(googleDocId(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)).toBe(ID);
    expect(googleDocId(`  https://docs.google.com/document/d/${ID}  `)).toBe(ID);
    expect(googleDocId(`https://docs.google.com/document/u/0/d/${ID}/edit#heading=h.1`)).toBe(ID);
    expect(googleDocId(`http://docs.google.com/document/d/${ID}/`)).toBe(ID);
  });

  it('turns down links to anywhere but docs.google.com', () => {
    expect(googleDocId(`https://docs.google.com.evil.example/document/d/${ID}`)).toBeNull();
    expect(googleDocId(`https://evil.example/document/d/${ID}`)).toBeNull();
    expect(googleDocId(`https://evil.example/?u=https://docs.google.com/document/d/${ID}`)).toBeNull();
    expect(googleDocId(`https://docs.google.com@evil.example/document/d/${ID}`)).toBeNull();
    expect(googleDocId(`ftp://docs.google.com/document/d/${ID}`)).toBeNull();
    expect(googleDocId(`file:///document/d/${ID}`)).toBeNull();
  });

  it('turns down other Google files, odd ids and things that aren’t links', () => {
    expect(googleDocId(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBeNull();
    expect(googleDocId('https://docs.google.com/document/d/short')).toBeNull();
    expect(googleDocId(`https://docs.google.com/document/d/${'a'.repeat(201)}`)).toBeNull();
    expect(googleDocId('https://docs.google.com/document/d/..%2F..%2Fadmin1234')).toBeNull();
    expect(googleDocId('https://docs.google.com/document/d/abc.def.ghijk')).toBeNull();
    expect(googleDocId(`docs.google.com/document/d/${ID}`)).toBeNull();
    expect(googleDocId('')).toBeNull();
  });
});

describe('googleDocExportUrl', () => {
  it('asks Google for the doc as plain text', () => {
    expect(googleDocExportUrl(ID)).toBe(`https://docs.google.com/document/d/${ID}/export?format=txt`);
  });
});

describe('parseGoogleDocsUrl', () => {
  it('takes a Google Docs link and turns down anything else', () => {
    expect(parseGoogleDocsUrl(` https://docs.google.com/document/d/${ID}/edit `)).toEqual({
      kind: 'gdocs-url', payload: `https://docs.google.com/document/d/${ID}/edit`,
    });
    expect(() => parseGoogleDocsUrl(`https://docs.google.com.evil.example/document/d/${ID}`)).toThrow('That doesn\'t look like a Google Docs URL.');
  });
});
