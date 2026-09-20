import type { DicomP10Meta } from './medicalDatasetTypes';

/** Strict DICOM Part-10 reader for explicit-VR little-endian datasets. Unsupported transfer syntaxes
 * (anything but `1.2.840.10008.1.2.1`) are rejected by name rather than mis-parsed. */

function text(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0/g, '').trim();
}

function u16(bytes: Uint8Array, o: number): number { return bytes[o] | (bytes[o + 1] << 8); }
function u32(bytes: Uint8Array, o: number): number { return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0; }

const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'UC', 'UR', 'UT', 'UN']);

export function parseDicomPart10(bytes: Uint8Array): DicomP10Meta {
  if (bytes.byteLength < 132 || text(bytes, 128, 4) !== 'DICM') throw new Error('DICOM_REJECTED:NO_PART10_PREAMBLE');
  let offset = 132;
  let transferSyntaxUid: string | null = null;
  let sopClassUid: string | null = null;
  let rows: number | null = null;
  let columns: number | null = null;
  let bitsAllocated: number | null = null;
  let pixelDataOffset: number | null = null;
  let pixelDataLength: number | null = null;

  while (offset + 8 <= bytes.byteLength) {
    const group = u16(bytes, offset); const element = u16(bytes, offset + 2); const vr = text(bytes, offset + 4, 2); offset += 6;
    let length: number;
    if (LONG_VR.has(vr)) { offset += 2; if (offset + 4 > bytes.byteLength) break; length = u32(bytes, offset); offset += 4; }
    else { if (offset + 2 > bytes.byteLength) break; length = u16(bytes, offset); offset += 2; }
    if (length === 0xffffffff) throw new Error('DICOM_REJECTED:UNDEFINED_LENGTH_SEQUENCE');
    if (offset + length > bytes.byteLength) throw new Error('DICOM_REJECTED:TRUNCATED_ELEMENT');
    const tag = `(${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')})`;
    if (tag === '(0002,0002)') sopClassUid = text(bytes, offset, length);
    if (tag === '(0002,0010)') transferSyntaxUid = text(bytes, offset, length);
    if (tag === '(0028,0010)' && length >= 2) rows = u16(bytes, offset);
    if (tag === '(0028,0011)' && length >= 2) columns = u16(bytes, offset);
    if (tag === '(0028,0100)' && length >= 2) bitsAllocated = u16(bytes, offset);
    if (tag === '(7fe0,0010)') { pixelDataOffset = offset; pixelDataLength = length; break; }
    offset += length;
  }
  if (!transferSyntaxUid) throw new Error('DICOM_REJECTED:NO_TRANSFER_SYNTAX');
  if (transferSyntaxUid !== '1.2.840.10008.1.2.1') throw new Error(`DICOM_REJECTED:UNSUPPORTED_TRANSFER_SYNTAX:${transferSyntaxUid}`);
  return { transferSyntaxUid, sopClassUid, rows, columns, bitsAllocated, pixelDataOffset, pixelDataLength };
}
