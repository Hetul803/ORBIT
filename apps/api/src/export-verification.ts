import { createHmac, timingSafeEqual } from 'node:crypto';

import AdmZip from 'adm-zip';

interface SignatureManifest {
  readonly algorithm: 'HMAC-SHA256';
  readonly signedFile: 'orbit-export.json';
  readonly signature: string;
}

export interface ExportVerificationResult {
  readonly valid: boolean;
  readonly product: string | null;
  readonly formatVersion: string | null;
  readonly exportedAt: string | null;
  readonly reason: string | null;
}

const invalid = (reason: string): ExportVerificationResult => ({
  valid: false,
  product: null,
  formatVersion: null,
  exportedAt: null,
  reason,
});

export const verifyExportArchive = (
  archiveBytes: Buffer,
  signingSecret: string,
): ExportVerificationResult => {
  try {
    const archive = new AdmZip(archiveBytes);
    const dataEntry = archive.getEntry('orbit-export.json');
    const signatureEntry = archive.getEntry('SIGNATURE.json');
    if (dataEntry === null || signatureEntry === null) {
      return invalid('Required export or signature file is missing.');
    }
    const data = dataEntry.getData();
    const signaturePayload = JSON.parse(signatureEntry.getData().toString('utf8')) as unknown;
    if (typeof signaturePayload !== 'object' || signaturePayload === null) {
      return invalid('Signature manifest is malformed.');
    }
    const signature = signaturePayload as Partial<SignatureManifest>;
    if (
      signature.algorithm !== 'HMAC-SHA256' ||
      signature.signedFile !== 'orbit-export.json' ||
      typeof signature.signature !== 'string'
    ) {
      return invalid('Signature manifest uses an unsupported format.');
    }
    const expected = createHmac('sha256', signingSecret).update(data).digest('base64url');
    const providedBytes = Buffer.from(signature.signature);
    const expectedBytes = Buffer.from(expected);
    if (
      providedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(providedBytes, expectedBytes)
    ) {
      return invalid('Export signature does not match its contents.');
    }
    const payload = JSON.parse(data.toString('utf8')) as unknown;
    if (typeof payload !== 'object' || payload === null)
      return invalid('Export JSON is malformed.');
    const record = payload as Record<string, unknown>;
    if (
      record.product !== 'ORBIT' ||
      record.formatVersion !== '1.0' ||
      typeof record.exportedAt !== 'string' ||
      typeof record.data !== 'object' ||
      record.data === null
    ) {
      return invalid('Export JSON does not match ORBIT format 1.0.');
    }
    return {
      valid: true,
      product: record.product,
      formatVersion: record.formatVersion,
      exportedAt: record.exportedAt,
      reason: null,
    };
  } catch (error: unknown) {
    return invalid(error instanceof Error ? error.message : 'Export could not be read.');
  }
};
