class GtaVehicleGranularProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.clips = new Map();
        this.grains = [];
        this.port.onmessage = (event) => this._handleMessage(event.data || {});
    }

    _handleMessage(message) {
        if (message.type === 'clips' && Array.isArray(message.clips)) {
            this.clips.clear();
            for (const clip of message.clips) {
                const channels = Array.isArray(clip?.channels)
                    ? clip.channels.map((buffer) => new Float32Array(buffer))
                    : [];
                if (clip?.name && channels.length) this.clips.set(String(clip.name), channels);
            }
            return;
        }
        if (message.type === 'clear') {
            this.grains.length = 0;
            return;
        }
        if (message.type === 'releaseClip' || message.type === 'releaseAll') {
            const fade = Math.max(1, Number(message.fadeFrames) || 128);
            for (const grain of this.grains) if (message.type === 'releaseAll' || grain.clip === message.clip) {
                grain.durationFrames = grain.startFrame >= currentFrame ? 0 : Math.min(grain.durationFrames, currentFrame - grain.startFrame + fade);
                grain.fadeFrames = Math.min(grain.fadeFrames, fade);
            }
            return;
        }
        if (message.type !== 'grain' || !message.clip || this.grains.length >= 128) return;
        if (![message.durationFrames, message.startFrame, message.offsetFrames, message.rate, message.gain, message.fadeFrames].every(Number.isFinite)) return;
        const durationFrames = Math.max(1, Math.round(message.durationFrames));
        const start = Math.max(currentFrame, Math.round(message.startFrame));
        const fade = Math.max(1, Math.min(Math.floor(durationFrames * 0.22), Number(message.fadeFrames) | 0 || 1));
        if (Number.isFinite(message.sustainFrames)) for (const previous of this.grains) {
            if (previous.clip === String(message.clip) && previous.startFrame <= start) {
                previous.durationFrames = Math.min(previous.durationFrames, start - previous.startFrame + fade);
            }
        }
        this.grains.push({
            clip: String(message.clip),
            startFrame: Math.max(currentFrame, Math.round(message.startFrame)),
            offsetFrames: Math.max(0, Number(message.offsetFrames) || 0),
            loopStartFrames: Math.max(0, Number(message.loopStartFrames) || 0),
            durationFrames: Number.isFinite(message.sustainFrames) ? Math.max(durationFrames, Math.min(sampleRate * 2, message.sustainFrames)) : durationFrames,
            rate: Math.max(0.05, Math.min(4.0, Number(message.rate) || 1.0)),
            gain: Math.max(0, Math.min(1.0, Number(message.gain) || 0)),
            fadeFrames: Math.max(1, Math.min(Math.floor(durationFrames * 0.22), Number(message.fadeFrames) | 0 || 1)),
        });
    }

    _sample(channel, position, loopStart = 0) {
        if (!channel.length || position < 0) return 0;
        loopStart = Math.min(channel.length - 1, loopStart);
        if (position >= channel.length) position = loopStart + (position - channel.length) % (channel.length - loopStart);
        const index = Math.floor(position);
        const fraction = position - index;
        return channel[index] + (channel[index + 1 < channel.length ? index + 1 : loopStart] - channel[index]) * fraction;
    }

    process(_inputs, outputs) {
        const out = outputs[0];
        const left = out?.[0];
        const right = out?.[1] || left;
        if (!left || !right) return true;
        left.fill(0);
        if (right !== left) right.fill(0);
        const frameEnd = currentFrame + left.length;
        const keep = [];
        for (const grain of this.grains) {
            const channels = this.clips.get(grain.clip);
            if (!channels) continue;
            const grainEnd = grain.startFrame + grain.durationFrames;
            if (grainEnd <= currentFrame) continue;
            if (grain.startFrame >= frameEnd) {
                keep.push(grain);
                continue;
            }
            const begin = Math.max(0, grain.startFrame - currentFrame);
            const end = Math.min(left.length, grainEnd - currentFrame);
            const sourceLeft = channels[0];
            const sourceRight = channels[1] || sourceLeft;
            for (let index = begin; index < end; index++) {
                const fadeIn = Math.min(1, (currentFrame + index - grain.startFrame) / grain.fadeFrames);
                const fadeOut = Math.min(1, (grainEnd - (currentFrame + index)) / grain.fadeFrames);
                const envelope = Math.max(0, Math.min(1, fadeIn, fadeOut));
                const sourcePosition = grain.offsetFrames + (currentFrame + index - grain.startFrame) * grain.rate;
                const gain = grain.gain * envelope;
                left[index] += this._sample(sourceLeft, sourcePosition, grain.loopStartFrames) * gain;
                if (right !== left) right[index] += this._sample(sourceRight, sourcePosition, grain.loopStartFrames) * gain;
            }
            if (grainEnd > frameEnd) keep.push(grain);
        }
        this.grains = keep;
        return true;
    }
}

registerProcessor('webglgta-gta-vehicle-granular-v1', GtaVehicleGranularProcessor);

// Asset path: js/gameplay/city_vehicle_audio_worklet.js
