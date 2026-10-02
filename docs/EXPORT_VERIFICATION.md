# Verify an ORBIT data export

Every export ZIP contains `orbit-export.json` and `SIGNATURE.json`. The signature covers the exact bytes of the JSON file with HMAC-SHA256, so a changed byte fails verification.

Run the repository verifier from the project root:

```bash
EXPORT_SIGNING_SECRET='the-secret-used-by-the-exporting-environment' \
  pnpm verify:export -- /absolute/path/to/orbit-export.zip
```

A valid result exits with code 0 and prints `"valid": true`, the format version, and export time. A missing file, invalid schema, bad signature, wrong secret, or unreadable ZIP exits non-zero and prints the reason.

The signing secret must come from the environment's secret manager and must not be placed inside the ZIP or committed to source control. HMAC proves integrity and authenticity to a verifier that holds that secret; it is not a public-signature scheme. A future cross-organization verification flow should add an asymmetric signature and publish only its public key.
