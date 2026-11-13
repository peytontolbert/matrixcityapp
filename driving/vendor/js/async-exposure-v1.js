// One reusable PBO and at most one pending fence per post-processing renderer.
// A late result leaves exposure at its previous measurement; rendering never waits.
export class LuminanceReadback {
    constructor(gl) {
        this.gl = gl;
        this.buffer = null;
        this.fence = null;
        this.pixels = new Uint8Array(4);
        this.failed = false;
        this.stats = {submitted: 0, completed: 0, deferred: 0, failures: 0};
    }
    get pending() { return !!this.fence || this.failed; }
    poll() {
        const gl = this.gl;
        if (gl.isContextLost()) { this.buffer = null; this.fence = null; this.failed = true; return null; }
        if (!this.fence) return null;
        const status = gl.clientWaitSync(this.fence, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) { this.stats.deferred++; return null; }
        if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
            this.stats.failures++; this.dispose(); this.failed = true; return null;
        }
        const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        try {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.pixels);
            this.stats.completed++;
            return Math.max(1e-3, Math.min(1e3, Math.exp(-8 + this.pixels[0] / 255 * 10)));
        } finally {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
            gl.deleteSync(this.fence); this.fence = null;
        }
    }
    submit() {
        const gl = this.gl;
        if (this.pending || gl.isContextLost()) return false;
        const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        try {
            if (!this.buffer) {
                this.buffer = gl.createBuffer();
                if (!this.buffer) { this.failed = true; this.stats.failures++; return false; }
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);

            } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffer);
            // Orphan the four-byte store before the next GPU write.
            gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
            this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            if (!this.fence) { this.failed = true; this.stats.failures++; return false; }
            gl.flush();
            this.stats.submitted++;
            return true;
        } finally { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous); }
    }
    dispose() {
        const gl = this.gl;
        if (!gl.isContextLost()) {
            if (this.fence) gl.deleteSync(this.fence);
            if (this.buffer) gl.deleteBuffer(this.buffer);
        }
        this.fence = null; this.buffer = null;
    }
}

export function updateAutoExposure() {
        // The opaque character-loading screen hides the scene. Measuring it
        // competes with critical shader/geometry work and can synchronize GPU
        // readback on the main thread. Resume normal exposure at world entry.
        const app=globalThis.__viewerApp;
        if(app?.gl===this.gl && app.nycOnlyMode && !app.multiplayer?.__nxCharacterWorldActive){
            if(this._auto)this._auto.lastMs=performance.now();
            return;
        }

        const gl = this.gl;
        const lv = this._lum?.levels;
        if (!lv || lv.length < 1) return;
        if (!this._scene?.tex) return;
        if (!this._lumExtractProg?.program || !this._lumDownProg?.program) return;

        // IMPORTANT (stability): avoid inheriting scene renderer state (scissor/cull/blend).
        try { gl.disable(gl.SCISSOR_TEST); } catch { /* ignore */ }
        try { gl.disable(gl.STENCIL_TEST); } catch { /* ignore */ }
        try { gl.disable(gl.CULL_FACE); } catch { /* ignore */ }
        try { gl.disable(gl.BLEND); } catch { /* ignore */ }
        try { gl.colorMask(true, true, true, true); } catch { /* ignore */ }

        // Throttle readback to reduce stalls; adaptation uses EMA so it remains smooth.
        this._auto.frame = (this._auto.frame + 1) >>> 0;
        const readback = this._asyncLuminance ??= new LuminanceReadback(gl);
        const measured = readback.poll();
        if (measured !== null) this._auto.measuredLum = measured;
        const doReadback = !readback.pending && (this._auto.frame % Math.max(1, this._auto.readbackEveryNFrames | 0)) === 0;
        if (doReadback) {

        // 1) Extract log luminance into level 0
        {
            const L0 = lv[0];
            gl.bindFramebuffer(gl.FRAMEBUFFER, L0.fbo);
            gl.viewport(0, 0, L0.w, L0.h);
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(false);
            this._lumExtractProg.use();
            gl.bindVertexArray(this._fsVao);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._scene.tex);
            gl.uniform1i(this._u.lumExtract.uSceneTex, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // 2) Downsample chain (box filter of log luminance)
        for (let i = 0; i + 1 < lv.length; i++) {
            const src = lv[i];
            const dst = lv[i + 1];
            gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
            gl.viewport(0, 0, dst.w, dst.h);
            this._lumDownProg.use();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.uniform1i(this._u.lumDown.uTex, 0);
            gl.uniform2f(this._u.lumDown.uTexel, 1.0 / src.w, 1.0 / src.h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // Queue one four-byte result. Never wait for unfinished GPU work.
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv[lv.length - 1].fbo);
        readback.submit();
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        // 4) Adapt over time (EMA in linear luminance domain)
        const now = performance.now();
        const dt = (this._auto.lastMs > 0) ? Math.max(0.0, (now - this._auto.lastMs) * 0.001) : (1.0 / 60.0);
        this._auto.lastMs = now;
        const speed = Math.max(0.0, Number(this.autoExposureSpeed) || 0.0);
        const k = 1.0 - Math.exp(-dt * speed);
        const prev = Number(this._auto.adaptedLum) || 1.0;
        const next = prev + (this._auto.measuredLum - prev) * k;
        this._auto.adaptedLum = Number.isFinite(next) ? next : prev;

    }
