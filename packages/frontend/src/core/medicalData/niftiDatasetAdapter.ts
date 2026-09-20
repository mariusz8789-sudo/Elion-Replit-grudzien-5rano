import type { NiftiHeader } from './medicalDatasetTypes';

/**
 * D-136 — a real, minimal NIfTI-1 (uncompressed, single-file `.nii`) header reader. Every field is
 * read from the actual bytes at their spec-defined offsets; nothing is invented. A file that fails
 * any structural check (short header, wrong `sizeof_hdr`, bad magic, truncated voxel data) is
 * refused by name, never silently accepted as a differently-shaped volume.
 */

function asAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

export function parseNifti1Header(bytes: Uint8Array): NiftiHeader {
  if (bytes.byteLength < 352) throw new Error('NIFTI_REJECTED:HEADER_TOO_SHORT');
  const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const le = new DataView(raw).getInt32(0, true);
  const be = new DataView(raw).getInt32(0, false);
  const little = le === 348 ? true : be === 348 ? false : null;
  if (little === null) throw new Error('NIFTI_REJECTED:SIZEOF_HDR_NOT_348');
  const view = new DataView(raw);
  const magic = asAscii(view, 344, 3);
  if (magic !== 'n+1' && magic !== 'ni1') throw new Error(`NIFTI_REJECTED:MAGIC:${magic}`);
  const dims = Array.from({ length: 8 }, (_, i) => view.getInt16(40 + i * 2, little));
  const datatype = view.getInt16(70, little);
  const bitpix = view.getInt16(72, little);
  const pixdim = Array.from({ length: 8 }, (_, i) => view.getFloat32(76 + i * 4, little));
  const voxOffset = view.getFloat32(108, little);
  if (!Number.isFinite(voxOffset) || voxOffset < 352 || voxOffset > bytes.byteLength) throw new Error('NIFTI_REJECTED:INVALID_VOX_OFFSET');
  if (dims[0] < 3 || dims[1] < 1 || dims[2] < 1 || dims[3] < 1) throw new Error('NIFTI_REJECTED:INVALID_DIMS');
  return { endian: little ? 'LE' : 'BE', sizeofHdr: 348, dims, datatype, bitpix, pixdim, voxOffset, magic: magic as 'n+1' | 'ni1' };
}

export function niftiVoxelCount(h: NiftiHeader): number {
  return h.dims[1] * h.dims[2] * h.dims[3];
}

const BYTES_PER_VOXEL: Readonly<Record<number, number>> = { 2: 1, 4: 2, 8: 4, 16: 4, 64: 8, 256: 1, 512: 2, 768: 4 };

/** Reads real voxel values per the NIfTI datatype code — never a placeholder/zero-filled array. */
export function readNiftiVoxels(bytes: Uint8Array, h: NiftiHeader): Float32Array {
  const count = niftiVoxelCount(h);
  const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(raw);
  const le = h.endian === 'LE';
  const out = new Float32Array(count);
  const offset = Math.trunc(h.voxOffset);
  const bytesPerVoxel = BYTES_PER_VOXEL[h.datatype];
  if (!bytesPerVoxel) throw new Error(`NIFTI_REJECTED:UNSUPPORTED_DATATYPE:${h.datatype}`);
  if (offset + count * bytesPerVoxel > bytes.byteLength) throw new Error('NIFTI_REJECTED:VOXEL_DATA_TRUNCATED');
  for (let i = 0; i < count; i++) {
    const p = offset + i * bytesPerVoxel;
    switch (h.datatype) {
      case 2: out[i] = view.getUint8(p); break;
      case 4: out[i] = view.getInt16(p, le); break;
      case 8: out[i] = view.getInt32(p, le); break;
      case 16: out[i] = view.getFloat32(p, le); break;
      case 64: out[i] = view.getFloat64(p, le); break;
      case 256: out[i] = view.getInt8(p); break;
      case 512: out[i] = view.getUint16(p, le); break;
      case 768: out[i] = view.getUint32(p, le); break;
      default: throw new Error(`NIFTI_REJECTED:UNSUPPORTED_DATATYPE:${h.datatype}`);
    }
  }
  return out;
}
