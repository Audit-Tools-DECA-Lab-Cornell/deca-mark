import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const container = process.argv[2];
assert.match(container ?? '', /^(decamark-baseline-\d+|fieldmaps-db19-baseline)$/);
const numbers = [0, -0, 5e-324, -5e-324, 2.2250738585072014e-308,
  0.000001, 0.0000009999999999999999, 0.0000010000000000000002,
  1e-7, 9.999999999999997e-7, 0.1, 1.0000000000000002, 142.49574323423423,
  179.99999999999997, -180, 180, 1.2345678901234568e-250];
let state = 0x12345678;
const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
const buffer = Buffer.alloc(8);
for (let index = 0; index < 5000; index += 1) {
  buffer.writeUInt32BE(next(), 0);
  buffer.writeUInt32BE(next(), 4);
  const value = buffer.readDoubleBE();
  if (Number.isFinite(value) && Math.abs(value) <= 180) numbers.push(value);
}
const cases = numbers.map(value => [value, JSON.stringify(value)]);
const fixtures = JSON.parse(readFileSync(new URL('../../contracts/zones/geometry.cases.json', import.meta.url)));
const jcsGeometry = value => JSON.stringify({ coordinates: value.coordinates, type: 'MultiPolygon' });
const canonicalSquare = { type: 'MultiPolygon', coordinates: [fixtures.geometries.square.coordinates] };
const expectedDigest = createHash('sha256').update(jcsGeometry(canonicalSquare)).digest('hex');
const sql = `
SELECT count(*) FROM jsonb_array_elements($cases$${JSON.stringify(cases)}$cases$::jsonb) c
WHERE fieldmaps_private.zone_number((c->>0)::float8) IS DISTINCT FROM c->>1;
SELECT fieldmaps_private.zone_geometry_digest(fieldmaps_private.normalize_zone_geometry(
$geometry$${JSON.stringify(fixtures.geometries.square)}$geometry$::jsonb));
`;
const output = execFileSync('docker', ['exec', '-i', container, 'psql', '-h', '/tmp', '-X', '-U', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim().split('\n');
assert.equal(output[0], '0', 'SQL coordinate number serialization must match ECMAScript');
assert.equal(output[1], expectedDigest, 'SQL geometry digest must match independent Node JCS bytes');
console.log(`PASS: ${cases.length} coordinate numbers match Node ${process.version}; geometry JCS digest matches.`);
