import {createOwnedProgram as nxCreateStartupProgram} from '../nexus_extensions/rendering/nyc-materials-v7/parallel-program.js';
export class ShaderProgram {
    constructor(gl) {
        this.gl = gl;
        this.program = null;
        this.attributes = {};
        this.uniforms = {};
    }

    /**
     * Very small GLSL preprocessor for `#include "file.glsl"`.
     * - Only supports quoted includes.
     * - Keeps `#version` where it is; include files must not declare `#version`.
     * @param {string} source
     * @param {(name: string) => (string|Promise<string>)} includeLoader
     * @param {number} maxDepth
     * @returns {Promise<string>}
     */
    static async preprocessIncludes(source, includeLoader, maxDepth = 20) {
        /** @param {string} src @param {string[]} stack */
        const expand = async (src, stack) => {
            // IMPORTANT:
            // Do NOT share a single global RegExp across recursive expand() calls.
            // RegExp with /g uses a mutable `lastIndex`; if recursion reuses the same RegExp,
            // nested calls will clobber lastIndex and the parent loop can re-match the same
            // include line repeatedly, growing `parts` until we hit RangeError: Invalid array length.
            const includeRe = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*$/gm;

            if (stack.length > maxDepth) {
                throw new Error(`GLSL include depth exceeded (${maxDepth}): ${stack.join(' -> ')}`);
            }

            /** @type {string[]} */
            const parts = [];
            let lastIdx = 0;
            includeRe.lastIndex = 0;
            for (;;) {
                const m = includeRe.exec(src);
                if (!m) break;
                const [full, name] = m;
                const start = m.index;
                const end = start + full.length;
                parts.push(src.slice(lastIdx, start));

                const trimmed = String(name || '').trim();
                if (!trimmed) {
                    parts.push(`\n/* #include "" ignored */\n`);
                    lastIdx = end;
                    continue;
                }
                if (stack.includes(trimmed)) {
                    throw new Error(`GLSL include cycle: ${[...stack, trimmed].join(' -> ')}`);
                }

                const inc = await includeLoader(trimmed);
                if (typeof inc !== 'string') {
                    throw new Error(`GLSL include not found: "${trimmed}"`);
                }
                parts.push(`\n/* begin include: ${trimmed} */\n`);
                parts.push(await expand(inc, [...stack, trimmed]));
                parts.push(`\n/* end include: ${trimmed} */\n`);

                lastIdx = end;
            }
            parts.push(src.slice(lastIdx));
            return parts.join('');
        };

        return await expand(String(source ?? ''), []);
    }
    
    async createProgram(vsSource, fsSource) {
        // Single-output passes without geometry motion explicitly mark pixels reactive.
        // Unattached MRT outputs are ignored by normal/non-temporal framebuffers.
        if (fsSource.includes('#version 300 es') && !fsSource.includes('temporalMotion') &&
            (fsSource.match(/(?:^|\n)\s*(?:layout\s*\([^)]*\)\s*)?out\s+\w+\s+\w+\s*;/g) || []).length === 1) {
            fsSource = fsSource.replace(/(^|\n)(\s*)out\s+(\w+)\s+(\w+)\s*;/g, '$1$2layout(location=0) out $3 $4;');
            fsSource = fsSource.replace(/void\s+main\s*\(\s*\)\s*\{/, 'layout(location=1) out highp vec4 temporalMotion;\nvoid main() { temporalMotion=vec4(0.,0.,0.,1.);');
        }
if(this.program){this.gl.deleteProgram(this.program);this.program=null;}this.attributes={};this.uniforms={};return await nxCreateStartupProgram(this,vsSource,fsSource);}
    getAttributeLocations() {
        // Get number of active attributes
        const numAttribs = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_ATTRIBUTES);
        
        // Get each attribute location
        for (let i = 0; i < numAttribs; i++) {
            const info = this.gl.getActiveAttrib(this.program, i);
            if (info) {
                this.attributes[info.name] = this.gl.getAttribLocation(this.program, info.name);
            }
        }
    }
    
    getUniformLocation(name) {
        // Cache even null results; use "in" so null doesn't trigger repeated lookups.
        if (!(name in this.uniforms)) {
            this.uniforms[name] = this.gl.getUniformLocation(this.program, name);
        }
        return this.uniforms[name];
    }
    
    setUniform(name, value) {
        const location = this.getUniformLocation(name);
        if (location === null) {
            console.warn(`Uniform ${name} not found in shader program`);
            return;
        }
        
        if (Array.isArray(value)) {
            value = new Float32Array(value);
        }

        if (value instanceof Float32Array) {
            switch (value.length) {
                case 1:
                    this.gl.uniform1f(location, value[0]);
                    break;
                case 2:
                    this.gl.uniform2f(location, value[0], value[1]);
                    break;
                case 3:
                    this.gl.uniform3f(location, value[0], value[1], value[2]);
                    break;
                case 4:
                    this.gl.uniform4f(location, value[0], value[1], value[2], value[3]);
                    break;
                case 9:
                    this.gl.uniformMatrix3fv(location, false, value);
                    break;
                case 16:
                    this.gl.uniformMatrix4fv(location, false, value);
                    break;
                default:
                    console.warn(`Unsupported uniform array length: ${value.length}`);
            }
        } else {
            // Heuristic: integers are typically samplers/bitfields; non-integers are floats.
            if (typeof value === 'number' && !Number.isInteger(value)) {
                this.gl.uniform1f(location, value);
            } else {
                this.gl.uniform1i(location, value);
            }
        }
    }
    
    use() {
        this.gl.useProgram(this.program);
    }
    
    dispose() {
        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
    }
} 