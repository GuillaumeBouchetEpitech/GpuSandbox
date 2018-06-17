
import EnvironmentUtils from "./utils/EnvironmentUtils.js"
import MathUtils from "./utils/MathUtils.js"
import ParserUtils from "./utils/ParserUtils.js"

import SetterParser from "./SetterParser.js"

import GpuBuffer from "./GpuBuffer.js"
import GpuTask from "./GpuTask.js"

class GpuSandbox {

	constructor() {

		if (!EnvironmentUtils.isWeb())
			throw new Error("unsuported environment, only work in a (browser) script or a (web) task");

		this._initialiseGpuContext();

		this._buffersMap = new Map();
		this._buffersArray = [];
		this._tasksMap = new Map();

		this._userLibSource = "";

		this._shaderWriter = this._buildShader(
			this._writerVertexShaderSource,
			this._writerFragmentShaderSource
		);

		const gl = this._gpuContext;

		gl.clearDepth(256.0);

		this._geometryVBO = gl.createBuffer();

		this._resultTextureObject = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this._resultTextureObject);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		this._textureFramebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._textureFramebuffer);

		this._vertexIndexSize = 0;
		this._resultTextureSide = 0;

		this._setterParser = new SetterParser();
	}

	_initialiseGpuContext() {

		this._canvas = (EnvironmentUtils.isWebBrowser()
			? document.createElement("canvas")
			: new OffscreenCanvas(1, 1));

		const contextOptions = {
			antialias: false,
			preserveDrawingBuffer: true
		};

		const gpuContext =
			this._canvas.getContext('webgl', contextOptions) ||
			this._canvas.getContext('experimental-webgl', contextOptions);

		if (!gpuContext)
			throw new Error("unsuported environment, only work if WebGL is available");

		this._gpuContext = gpuContext;

		this._canvas.width = 1;
		this._canvas.height = 1;
		this._canvas.style = `
			border: 1px solid black;
			image-rendering: optimizeSpeed;
			image-rendering: -moz-crisp-edges;
			image-rendering: -webkit-optimize-contrast;
			image-rendering: -o-crisp-edges;
			image-rendering: pixelated;
			-ms-interpolation-mode: nearest-neighbor
		`;
	}

	createBuffer(name) {

		if (!ParserUtils.validateVariableName(name))
			throw new Error(`invalid GpuBuffer name, input="${name}"`);

		if (this._buffersMap.has(name))
			throw new Error(`duplicate GpuBuffer name, input="${name}"`);

		const newBuffer = new GpuBuffer(this, name);

		this._buffersMap.set(name, newBuffer);
		this._buffersArray.push(newBuffer);

		return newBuffer;
	}

	getBuffer(name) {

		const buffer = this._buffersMap.get(name);

		if (!buffer)
			throw new Error(`GpuBuffer not found, input="${name}"`);

		return buffer;
	}

	deleteBuffer(gpuBuffer) {

		const buffer = this._buffersMap.get(name);

		if (!buffer)
			throw new Error(`GpuBuffer not found, input="${name}"`);

		this._buffersMap.delete(name);

		this._buffersArray = this._buffersArray.filter((item) => item !== buffer);

		buffer.dispose();
	}

	setLibrarySource(sourceCode) {

		// TODO (store, mark all tasks as dirty)

		this._userLibSource = sourceCode;
	}

	createTask(name) {

		if (this._tasksMap.has(name))
			throw new Error(`duplicate GpuTask name, input="${name}"`);

		const newtask = new GpuTask(this, name);

		this._tasksMap.set(name, newtask);

		return newtask;
	}

	getTask(name) {

		const task = this._tasksMap.get(name);

		if (!task)
			throw new Error(`GpuTask not found, input="${name}"`);

		return task;
	}

	deleteTask(name) {

		const task = this._tasksMap.get(name);

		if (!task)
			throw new Error(`GpuTask not found, input="${name}"`);

		this._tasksMap.delete(name);

		task.dispose();
	}

	_compileShaderSource(shaderType, shaderSource) {

		const gl = this._gpuContext;

		const shader = gl.createShader(shaderType);
		gl.shaderSource(shader, shaderSource);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

			const infoLog = gl.getShaderInfoLog(shader);

			throw new Error(`WebGL error, shader compilation failure, infoLog="${infoLog}"`);
		}

		return shader;
	}

	_buildShader(vertexSource, fragmentSource) {

		const gl = this._gpuContext;

		const vertexShader = this._compileShaderSource(gl.VERTEX_SHADER, vertexSource);
		const fragmentShader = this._compileShaderSource(gl.FRAGMENT_SHADER, fragmentSource);

		const shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);

		if(!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS))
			throw Error("WebGL error, shaders linking failure.");

		return shaderProgram;
	}

	_allocVertexIndices(neededVertexIndexSize) {

		if (neededVertexIndexSize <= this._vertexIndexSize)
			return;

		this._vertexIndexSize = Math.pow(MathUtils.fitTextureSide(neededVertexIndexSize), 2);
		const vertexIndexArray = new Float32Array(this._vertexIndexSize);

		for (let ii = 0; ii < this._vertexIndexSize; ++ii)
			vertexIndexArray[ii] = ii;

		const gl = this._gpuContext;

		gl.bindBuffer(gl.ARRAY_BUFFER, this._geometryVBO);
		gl.bufferData(gl.ARRAY_BUFFER, vertexIndexArray, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	}

	_allocResultTexture(usedTextureSide) {

		if (usedTextureSide <= this._resultTextureSide)
			return;

		this._resultTextureSide = usedTextureSide;

		const gl = this._gpuContext;

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this._resultTextureObject);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, usedTextureSide, usedTextureSide, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	}

}

GpuSandbox.prototype._defaultLibSource = `

	vec2 indexToPos(vec2 size, float index) {

		return vec2(mod(index, size.x), floor(index / size.x));
	}

	float posToIndex(vec2 size, vec2 pos) {

		return pos.y * size.x + pos.x;
	}

	vec2 scaleRange(vec2 fromA, vec2 fromB, vec2 toA, vec2 toB, vec2 pos) {

		return toA + (pos - fromA) / (fromB - fromA) * (toB - toA);
	}

	vec4 packFloat(float x) {

		float s = 0.0;
		float e = 0.0;
		float m = x;

		if (m < 0.0)
			s = 1.0, m = -m;

		for (int i = 0; i < 24; ++i) {
			if (m >= 2.0)
				m = m / 2.0, e += 1.0;
			if (m <  1.0)
				m = m * 2.0, e -= 1.0;
			if (m >= 1.0 && m < 2.0)
				break;
		}

		return vec4(
			floor(fract((m - 1.0) * 256.0 * 256.0) * 256.0),
			floor(fract((m - 1.0) * 256.0) * 256.0),
			floor(fract((m - 1.0) * 1.0) * 256.0),
			((e+63.0) + (x > 0.0 ? 128.0 : 0.0))
		) / 255.0;
	}

	float unpackFloat(vec4 v) {

		v *= 255.0;
		float s = v.a >= 128.0 ? 1.0 : -1.0;
		float e = v.a - (v.a >= 128.0 ? 128.0 : 0.0) - 63.0;
		float m = 1.0 + v.x / 256.0 / 256.0 / 256.0 + v.y / 256.0 / 256.0 + v.z / 256.0;

		return s * pow(2.0, e) * m;
	}

	vec4 packVec4(vec4 v) {

		return v / 255.0;
	}

	vec4 unpackVec4(vec4 v) {

		return v * 255.0;
	}

	vec4 packIndexDepth(int a, int b) {

		float av = float(a);
		float bv = float(b);
		float x = mod(floor(av), 256.0);
		float y = mod(floor(av / 256.0), 256.0);
		float z = mod(floor(av / 256.0 / 256.0), 256.0);
		float w = mod(floor(bv), 256.0);
		return vec4(x, y, z, w) / 255.0;
	}

	int unpackIndex(vec4 v) {
		return int(v.x * 255.0 + v.y * 255.0 * 256.0 + v.z * 255.0 * 256.0 * 256.0);
	}

	int unpackDepth(vec4 v) {
		return int(v.w * 255.0);
	}
`;

GpuSandbox.prototype._writerVertexShaderSource = `

	precision highp float;

	uniform sampler2D u_resultTexture;
	uniform float u_resultTextureSide;
	uniform float u_resultGridSide;
	uniform float u_resultSquareSide;
	uniform float u_targetTextureSide;

	attribute float a_resultIndex;

	varying vec4 v_value;

	${GpuSandbox.prototype._defaultLibSource}

	void main() {

		float resultSquareIndex = mod(a_resultIndex, u_resultSquareSide * u_resultSquareSide / 2.0);
		vec2 resultSquareCoord = indexToPos(vec2(u_resultSquareSide / 2.0, u_resultSquareSide), resultSquareIndex) * vec2(2.0, 1.0);
		vec2 resultGridCoord = indexToPos(vec2(u_resultGridSide), floor(a_resultIndex / (u_resultSquareSide * u_resultSquareSide / 2.0)));
		vec2 resultCoord = resultGridCoord * u_resultSquareSide + resultSquareCoord;
		vec2 indexCoord = (resultCoord + vec2(0.5, 0.5)) / u_resultTextureSide;
		vec2 valueCoord = (resultCoord + vec2(1.5, 0.5)) / u_resultTextureSide;
		float index = float(unpackIndex(texture2D(u_resultTexture, indexCoord)) - 1);
		float depth = float(unpackDepth(texture2D(u_resultTexture, indexCoord)));

		v_value = texture2D(u_resultTexture, valueCoord);
		vec2 rPos = (indexToPos(vec2(u_targetTextureSide), index) + vec2(0.5)) / u_targetTextureSide * 2.0 - 1.0;

		gl_Position = vec4(depth > 0.5 ? rPos : vec2(-1.0, -1.0), (255.0 - depth) / 255.0, 1.0);
		gl_PointSize = 1.0;
	}
`;

GpuSandbox.prototype._writerFragmentShaderSource = `

	precision highp float;

	varying vec4 v_value;

	void main() {

		gl_FragColor = v_value;
	}
`;

export default GpuSandbox;
