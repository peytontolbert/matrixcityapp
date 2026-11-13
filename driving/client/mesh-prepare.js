export function prepareMesh(key,arrayBuffer,retainCpuPickData=false){
const gl={UNSIGNED_INT:5125,UNSIGNED_SHORT:5123,HALF_FLOAT:5131,FLOAT:5126,BYTE:5120,SHORT:5122};
if(arrayBuffer.byteLength<20)throw Error("Truncated mesh header");
        const dv = new DataView(arrayBuffer);

        // Header: <4sIIII> = magic, version, vertexCount, indexCount, flags
        const magic =
            String.fromCharCode(dv.getUint8(0)) +
            String.fromCharCode(dv.getUint8(1)) +
            String.fromCharCode(dv.getUint8(2)) +
            String.fromCharCode(dv.getUint8(3));
        const version = dv.getUint32(4, true);
        const vertexCount = dv.getUint32(8, true);
        const indexCount = dv.getUint32(12, true);
        const flags = dv.getUint32(16, true);

        if (magic !== 'MSH0' || (version < 1 || version > 10)) {
            console.warn(`ModelManager: bad mesh header for ${key} (magic=${magic}, version=${version})`);
            return null;
        }

        const affinePositions = version === 10;
        const headerBytes = affinePositions ? 44 : 20;
        if (arrayBuffer.byteLength < headerBytes) {
            console.warn(`ModelManager: truncated mesh header for ${key}`);
            return null;
        }
        const packed = version >= 9;
        const positionMin = affinePositions
            ? [dv.getFloat32(20, true), dv.getFloat32(24, true), dv.getFloat32(28, true)]
            : null;
        const positionExtent = affinePositions
            ? [dv.getFloat32(32, true), dv.getFloat32(36, true), dv.getFloat32(40, true)]
            : null;
        const posBytes = vertexCount * 3 * (packed ? 2 : 4);
        const hasNormals = version >= 2 && (flags & 1) === 1;
        const hasInt8Normals = packed && (flags & 1024) === 1024;
        const hasTightInt8Normals = hasInt8Normals && (flags & 2048) === 2048;
        const nrmBytes = hasNormals ? vertexCount * (hasTightInt8Normals ? 3 : (hasInt8Normals ? 4 : (packed ? 6 : 12))) : 0;
        const hasUvs = version >= 3 && (flags & 2) === 2;
        const uvBytes = hasUvs ? vertexCount * 2 * (packed ? 2 : 4) : 0;
        const hasUv1 = version >= 6 && (flags & 16) === 16;
        const uv1Bytes = hasUv1 ? vertexCount * 2 * (packed ? 2 : 4) : 0;
        const hasUv2 = version >= 7 && (flags & 32) === 32;
        const uv2Bytes = hasUv2 ? vertexCount * 2 * (packed ? 2 : 4) : 0;
        const hasTangents = version >= 4 && (flags & 4) === 4;
        const tanBytes = hasTangents ? vertexCount * 4 * (packed ? 1 : 4) : 0;
        const hasColor0 = version >= 5 && (flags & 8) === 8;
        const col0Bytes = hasColor0 ? vertexCount * 4 : 0;
        const hasColor1 = version >= 7 && (flags & 64) === 64;
        const col1Bytes = hasColor1 ? vertexCount * 4 : 0;
        const hasBlendWeights = version >= 8 && (flags & 128) === 128;
        const blendWeightsBytes = hasBlendWeights ? vertexCount * 4 : 0;
        const hasBlendIndices = version >= 8 && (flags & 256) === 256;
        const blendIndicesBytes = hasBlendIndices ? vertexCount * 4 : 0;
        const hasUint16Indices = packed && (flags & 512) === 512;
        const hasDeltaIndices = hasUint16Indices && (flags & 4096) === 4096;
        const fixedIdxBytes = indexCount * (hasUint16Indices ? 2 : 4);
        const normalOffset = headerBytes + posBytes;
        const uvOffset = hasTightInt8Normals ? ((normalOffset + nrmBytes + 1) & ~1) : normalOffset + nrmBytes;
        const uv1Offset = uvOffset + uvBytes;
        const uv2Offset = uv1Offset + uv1Bytes;
        const tangentOffset = uv2Offset + uv2Bytes;
        const color0Offset = tangentOffset + tanBytes;
        const color1Offset = color0Offset + col0Bytes;
        const blendWeightsOffset = color1Offset + col1Bytes;
        const blendIndicesOffset = blendWeightsOffset + blendWeightsBytes;
        const vertexPayloadEnd = blendIndicesOffset + blendIndicesBytes;
        const indexOffset = packed ? ((vertexPayloadEnd + 3) & ~3) : vertexPayloadEnd;
        const idxBytes = hasDeltaIndices ? arrayBuffer.byteLength - indexOffset : fixedIdxBytes;
        if (indexOffset + idxBytes > arrayBuffer.byteLength) {
            console.warn(`ModelManager: truncated mesh ${key}`);
            return null;
        }

        if (headerBytes + posBytes > arrayBuffer.byteLength) {
            console.warn(`ModelManager: truncated position stream for ${key}`);
            return null;
        }

        const diskPositions = packed ? new Uint16Array(arrayBuffer, headerBytes, vertexCount * 3) : null;
        // MSH10 stores each local position as unorm16 inside the affine bounds
        // from its header. Keep that compact stream on the GPU and decode in the
        // vertex shader instead of expanding it into a Float32Array per mesh.
        const positions = packed ? diskPositions : new Float32Array(arrayBuffer, headerBytes, vertexCount * 3);
        const normals = hasNormals ? (hasInt8Normals
            ? new Int8Array(arrayBuffer, normalOffset, vertexCount * (hasTightInt8Normals ? 3 : 4))
            : (packed ? new Int16Array(arrayBuffer, normalOffset, vertexCount * 3) : new Float32Array(arrayBuffer, normalOffset, vertexCount * 3))) : null;
        const uvs = hasUvs ? (packed ? new Uint16Array(arrayBuffer, uvOffset, vertexCount * 2) : new Float32Array(arrayBuffer, uvOffset, vertexCount * 2)) : null;
        const uv1 = hasUv1 ? (packed ? new Uint16Array(arrayBuffer, uv1Offset, vertexCount * 2) : new Float32Array(arrayBuffer, uv1Offset, vertexCount * 2)) : null;
        const uv2 = hasUv2 ? (packed ? new Uint16Array(arrayBuffer, uv2Offset, vertexCount * 2) : new Float32Array(arrayBuffer, uv2Offset, vertexCount * 2)) : null;
        const tangents = hasTangents ? (packed ? new Int8Array(arrayBuffer, tangentOffset, vertexCount * 4) : new Float32Array(arrayBuffer, tangentOffset, vertexCount * 4)) : null;
        const color0 = hasColor0 ? new Uint8Array(arrayBuffer, color0Offset, vertexCount * 4) : null;
        const color1 = hasColor1 ? new Uint8Array(arrayBuffer, color1Offset, vertexCount * 4) : null;
        const blendWeights = hasBlendWeights ? new Uint8Array(arrayBuffer, blendWeightsOffset, vertexCount * 4) : null;
        const blendIndices = hasBlendIndices ? new Uint8Array(arrayBuffer, blendIndicesOffset, vertexCount * 4) : null;
        let indices;
        if (hasDeltaIndices) {
            indices = new Uint32Array(indexCount);
            const encoded = new Uint8Array(arrayBuffer, indexOffset, idxBytes);
            let cursor = 0;
            let previous = 0;
            for (let i = 0; i < indexCount; i += 1) {
                let value = 0;
                let shift = 0;
                let byte = 0;
                do {
                    if (cursor >= encoded.length || shift > 28) throw new Error(`ModelManager: invalid delta indices in ${key}`);
                    byte = encoded[cursor++];
                    value |= (byte & 0x7f) << shift;
                    shift += 7;
                } while (byte & 0x80);
                const delta = (value >>> 1) ^ -(value & 1);
                previous = (previous + delta) >>> 0;
                indices[i] = previous;
            }
        } else {
            const diskIndices = hasUint16Indices
                ? new Uint16Array(arrayBuffer, indexOffset, indexCount)
                : new Uint32Array(arrayBuffer, indexOffset, indexCount);
            indices = hasUint16Indices ? new Uint32Array(diskIndices) : diskIndices;
        }

        // Do this before any GPU allocation. WebGL only reports a bad index at
        // draw time, where the error otherwise looks like an unrelated renderer
        // failure and can leave subsequent passes with stale state.
        for (let i = 0; i < indices.length; i += 1) {
            if (indices[i] >= vertexCount) {
                console.warn(`ModelManager: mesh ${key} has index ${indices[i]} outside ${vertexCount} vertices`);
                return null;
            }
        }

        const halfToFloat = (value) => {
            const sign = (value & 0x8000) ? -1 : 1;
            const exponent = (value >>> 10) & 0x1f;
            const fraction = value & 0x03ff;
            if (exponent === 0) return sign * Math.pow(2, -14) * (fraction / 1024);
            if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
            return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
        };

        // Conservative local-space bounds + sphere radius (used by occlusion/culling).
        const bmin = affinePositions
            ? [positionMin[0], positionMin[1], positionMin[2]]
            : [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
        const bmax = affinePositions
            ? [
                positionMin[0] + positionExtent[0],
                positionMin[1] + positionExtent[1],
                positionMin[2] + positionExtent[2],
            ]
            : [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
        if (!affinePositions) {
            for (let i = 0; i < positions.length; i += 3) {
                const x = packed ? halfToFloat(positions[i + 0]) : positions[i + 0];
                const y = packed ? halfToFloat(positions[i + 1]) : positions[i + 1];
                const z = packed ? halfToFloat(positions[i + 2]) : positions[i + 2];
                if (x < bmin[0]) bmin[0] = x;
                if (y < bmin[1]) bmin[1] = y;
                if (z < bmin[2]) bmin[2] = z;
                if (x > bmax[0]) bmax[0] = x;
                if (y > bmax[1]) bmax[1] = y;
                if (z > bmax[2]) bmax[2] = z;
            }
        }
        if (!Number.isFinite(bmin[0])) {
            bmin[0] = bmin[1] = bmin[2] = 0;
            bmax[0] = bmax[1] = bmax[2] = 0;
        }
        const cx = (bmin[0] + bmax[0]) * 0.5;
        const cy = (bmin[1] + bmax[1]) * 0.5;
        const cz = (bmin[2] + bmax[2]) * 0.5;
        const dx = (bmax[0] - bmin[0]) * 0.5;
        const dy = (bmax[1] - bmin[1]) * 0.5;
        const dz = (bmax[2] - bmin[2]) * 0.5;
        const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const bounds = { min: bmin, max: bmax, center: [cx, cy, cz] };

        let uploadIndices = indices;
        let indexType = gl.UNSIGNED_INT;
        if (indices.length > 0) {
            let maxIndex = 0;
            for (let i = 0; i < indices.length; i++) maxIndex = Math.max(maxIndex, indices[i]);
            if (maxIndex <= 0xffff) {
                uploadIndices = new Uint16Array(indices);
                indexType = gl.UNSIGNED_SHORT;
            }
        }

        const retainPick = !!retainCpuPickData
            && vertexCount > 0
            && indexCount > 0
            && indexCount <= 300000;
        const pickPositions = retainPick
            ? (affinePositions ? new Uint16Array(diskPositions) : new Float32Array(positions))
            : null;
        const pickIndices = retainPick ? new Uint32Array(indices) : null;
        const pickBytes = (pickPositions?.byteLength || 0) + (pickIndices?.byteLength || 0);


 const specs=[
 ['posBuffer',positions,0,3,affinePositions?5123:packed?5131:5126,affinePositions,0],
 ['nrmBuffer',normals,1,3,hasInt8Normals?5120:packed?5122:5126,packed,hasInt8Normals?(hasTightInt8Normals?3:4):0],
 ['uvBuffer',uvs,2,2,packed?5131:5126,false,0],['uv1Buffer',uv1,9,2,packed?5131:5126,false,0],
 ['uv2Buffer',uv2,10,2,packed?5131:5126,false,0],['tanBuffer',tangents,3,4,packed?5120:5126,packed,0],
 ['col0Buffer',color0,8,4,5121,true,0],['col1Buffer',color1,11,4,5121,true,0],
 ['blendWeightsBuffer',blendWeights,13,4,5121,true,0],['blendIndicesBuffer',blendIndices,14,4,5121,false,0],
 ['idxBuffer',uploadIndices,-1]
 ];
 return {specs,mesh:{key,
            positionAttribType: affinePositions ? gl.UNSIGNED_SHORT : (packed ? gl.HALF_FLOAT : gl.FLOAT),
            positionAttribNormalized: affinePositions,
            positionQuantized: affinePositions,
            positionMin: affinePositions ? positionMin : null,
            positionExtent: affinePositions ? positionExtent : null,
            normalAttribType: hasInt8Normals ? gl.BYTE : (packed ? gl.SHORT : gl.FLOAT),
            normalAttribNormalized: !!packed,
            normalAttribStride: hasInt8Normals ? (hasTightInt8Normals ? 3 : 4) : 0,
            uvAttribType: packed ? gl.HALF_FLOAT : gl.FLOAT,
            tangentAttribType: packed ? gl.BYTE : gl.FLOAT,
            tangentAttribNormalized: !!packed,
            vertexCount,
            indexCount,
            lineIndexCount: 0,
            indexType,
            lineIndexType: indexType,
            pickPositions,
            pickIndices,
            pickPositionQuantized: !!(retainPick && affinePositions),
            pickPositionMin: retainPick && affinePositions ? [...positionMin] : null,
            pickPositionExtent: retainPick && affinePositions ? [...positionExtent] : null,
            approxBytes: (positions.byteLength + nrmBytes + uvBytes + uv1Bytes + uv2Bytes + tanBytes + col0Bytes + col1Bytes + blendWeightsBytes + blendIndicesBytes + uploadIndices.byteLength + 0 + pickBytes),
            bounds,
            radius,
            _lastUsedMs: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
            _disposed: false,
}};
}
