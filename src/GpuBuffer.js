
import MathUtils from "./utils/MathUtils.js"

class GpuBuffer {

	constructor(gpuSandbox, name) {

		this._gpuSandbox = gpuSandbox;
		this._name = name;
		this._length = 0;
	}

	dispose() {

		if (this._textureObject !== undefined) {

			const gl = this._gpuSandbox._gpuContext;

			gl.deleteTexture(this._textureObject);
			gl.deleteRenderbuffer(this._depthbuffer);
		}

		this._gpuSandbox = undefined;
		this._name = undefined;
		this._length = 0;
	}

	setWithLength(length) {

		const textureSide = MathUtils.fitTextureSide(length);

		this._length = length;

		this._set(textureSide);
	}

	setWithFloats(floats) {

		const textureSide = MathUtils.fitTextureSide(floats.length);

		this._length = floats.length;

		const pixels = new Uint8Array(textureSide * textureSide * 4);

		for (let ii = 0; ii < floats.length; ++ii) {

			const value = floats[ii];
			const s = (value > 0 ? 1 : -1);
			const e = Math.floor(Math.log(s * value) / Math.LN2);
			const m = s * value / Math.pow(2, e);
			pixels[ii * 4 + 0] = Math.floor(MathUtils.fract((m - 1) * 256 * 256) * 256) || 0;
			pixels[ii * 4 + 1] = Math.floor(MathUtils.fract((m - 1) * 256) * 256) || 0;
			pixels[ii * 4 + 2] = Math.floor(MathUtils.fract((m - 1) * 1) * 256) || 0;
			pixels[ii * 4 + 3] = ((e + 63) + (value > 0 ? 128 : 0)) || 0;
		};

		this._set(textureSide, pixels);
	}

	_set(textureSide, pixels) {

		const gl = this._gpuSandbox._gpuContext;

		gl.activeTexture(gl.TEXTURE0);

		this._textureSide = textureSide;

		this._textureObject = gl.createTexture();
		this._depthbuffer = gl.createRenderbuffer();

		gl.bindTexture(gl.TEXTURE_2D, this._textureObject);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSide, textureSide, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

		gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthbuffer);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, textureSide, textureSide);
	}

	unpackAsFloats() {

		if (this._textureObject === undefined)
			throw new Error(`GpuBuffer.unpackAsFloats, not initialised, name="${this._name}"`);

		const gl = this._gpuSandbox._gpuContext;

		const pixels = new Uint8Array(this._textureSide * this._textureSide * 4);

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._textureObject, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
		gl.readPixels(0, 0, this._textureSide, this._textureSide, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

		const floats = [];

		// to avoid annoying floating point error for 0
		const epsilon = 0.000000000000000001;

		for (let ii = 0; ii < this._length; ++ii) {

			const s = pixels[ii * 4 + 3] >= 128 ? 1 : -1;
			const e = pixels[ii * 4 + 3] - (pixels[ii * 4 + 3] >= 128 ? 128 : 0) - 63;
			const m = 1 + pixels[ii * 4 + 0] / 256 / 256 / 256 + pixels[ii * 4 + 1] / 256 / 256 + pixels[ii * 4 + 2] / 256;
			const n = s * Math.pow(2, e) * m;

			floats.push((-epsilon < n && n < epsilon) ? 0 : n);
		}

		return floats;
	}

	fillWithFloat(value) { // Fills an array with a floating point number

		// Since the float packing on the set function is
		// inlined for performance, it must be duplicated
		// here. FIXME: find a way to avoid this.
		const s = value > 0 ? 1 : -1;
		const e = Math.floor(Math.log2(s * value));
		const m = s * value / Math.pow(2, e);
		const a = Math.floor(MathUtils.fract((m - 1) * 256 * 256) * 256) || 0;
		const b = Math.floor(MathUtils.fract((m - 1) * 256) * 256) || 0;
		const c = Math.floor(MathUtils.fract((m - 1) * 1) * 256) || 0;
		const d = ((e + 63) + (value > 0 ? 128 : 0)) || 0;

		const uint32Value = ((d << 24) + (c << 16) + (b << 8) + a);

		return this.fillWithUint32(uint32Value);
	}

	fillWithUint32(value) { // Fills an array with an Uint32

		if (this._textureObject === undefined)
			throw new Error(`GpuBuffer.unpackAsFloats, not initialised, name="${this._name}"`);

		const sandbox = this._gpuSandbox;
		const gl = sandbox._gpuContext;

		gl.bindFramebuffer(gl.FRAMEBUFFER, sandbox._textureFramebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._textureObject, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
		gl.clearColor(
			((value & 0x000000FF) >>>  0) / 255,
			((value & 0x0000FF00) >>>  8) / 255,
			((value & 0x00FF0000) >>> 16) / 255,
			((value & 0xFF000000) >>> 24) / 255
		);
		gl.clear(gl.COLOR_BUFFER_BIT)

		return this;
	}

	get name() {
		return this._name;
	}

	get textureName() {
		return `${this._name}_texture`;
	}

	get textureObject() {
		return this._textureObject;
	}
}

export default GpuBuffer;
