import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';

import { signExport } from '../src/crypto.js';
import { verifyExportArchive } from '../src/export-verification.js';

const secret = 'a-test-export-secret';

const archive = (body: Buffer, signature = signExport(body, secret)): Buffer => {
  const zip = new AdmZip();
  zip.addFile('orbit-export.json', body);
  zip.addFile(
    'SIGNATURE.json',
    Buffer.from(
      JSON.stringify({ algorithm: 'HMAC-SHA256', signedFile: 'orbit-export.json', signature }),
    ),
  );
  return zip.toBuffer();
};

describe('export verification', () => {
  it('accepts an intact signed ORBIT export', () => {
    const body = Buffer.from(
      JSON.stringify({
        product: 'ORBIT',
        formatVersion: '1.0',
        exportedAt: '2026-10-01',
        data: {},
      }),
    );
    expect(verifyExportArchive(archive(body), secret)).toMatchObject({ valid: true });
  });

  it('rejects a changed signature', () => {
    const body = Buffer.from(
      JSON.stringify({
        product: 'ORBIT',
        formatVersion: '1.0',
        exportedAt: '2026-10-01',
        data: {},
      }),
    );
    expect(verifyExportArchive(archive(body, 'tampered'), secret)).toMatchObject({
      valid: false,
      reason: 'Export signature does not match its contents.',
    });
  });
});
