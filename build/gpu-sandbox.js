class EnvironmentUtils {

	static isWebBrowser() {

		return typeof window === 'object';
	}

	static isWebtask() {

		return typeof importScripts === 'function';
	}

	static isWeb() {

		return EnvironmentUtils.isWebBrowser() || EnvironmentUtils.isWebtask();
	}
}

class MathUtils {

	static fract(x) {

		return (x - Math.floor(x));
	}

	static fitTextureSide(size) {

		return Math.pow(2, Math.ceil(Math.log(Math.sqrt(size)) / Math.log(2)));
	};
}

class ParserUtils {

	static validateVariableName(name) {

		return ParserUtils.prototype._regexValidateVariableName.test(name);
	}


	static isEscapeCharacter(character) {

		return (
			character === " " ||
			character === "\n" ||
			character === "\t"
		);
	}
}

ParserUtils.prototype._regexValidateVariableName = /^([a-zA-Z0-9_]+)$/;

class SetterParser {

	constructor() {

		this._stepsEnum = {

			collectBufferName: 0,
			collectBufferIndex: 1,
			collectDepthLevel: 2,

			validateEqualPart1: 3,
			validateEqualPart2: 4,

			collectValueLogic: 5,

			validateEndPart: 6,
		};

		// this._stepMap = new Map([
		// 	[],
		// ]);
	}

	collectBufferName(character) {

		if (character === "(") {

			++brackets;
			parserPhase = 1;
		}
		else if (!ParserUtils.isEscapeCharacter(character))
			bufferName += character;
	}

	// TODO: friendlier logic
	parse___experimental(statement) {

		// "[bufferName]([index]) = [valueLogic];"
		// "[bufferName]([index], [depthLevel]) = [valueLogic];"

		let bufferName = "";
		let bufferIndex = "";
		let depthLevel = "";
		let valueLogic = "";
		let parserPhase = 0;
		let brackets = 0;

		for (let ii = 0; ii < statement.length; ++ii) {

			const character = statement[ii];

			switch (parserPhase) {

				case 0: // collect the result buffer name

					if (character === "(") {

						++brackets;
						parserPhase = 1;
					}
					else if (!ParserUtils.isEscapeCharacter(character))
						bufferName += character;

					break;

				case 1: // collect the result buffer index

					if (character === "(")
						++brackets;
					else if (character === ")")
						--brackets;

					if (brackets === 1 && character === ",")
						parserPhase = 2;
					else if (brackets === 0)
						parserPhase = 3;
					else
						bufferIndex += character;

					break;

				case 2: // collect the depth level

					if (character === "(")
						++brackets;
					else if (character === ")")
						--brackets;

					if (brackets === 0)
						parserPhase = 3;
					else
						depthLevel += character;

					break;

				case 3: // 1st step of the ":="

					if (character === ":")
						parserPhase = 4;

					break;

				case 4: // 2nd step of the ":="

					if (character === "=")
						parserPhase = 5;
					else
						return null;

					break;

				case 5: // collect the logic that will return the value to set

					if (!ParserUtils.isEscapeCharacter(character)) {

						valueLogic += character;
						parserPhase = 6;
					}

					break;

				case 6: // end of the setter

					if (character === ";")
						parserPhase = 7;
					else
						valueLogic += character;

					break;
			}
		}

		if (parserPhase !== 7)
			return null;

		if (!ParserUtils.validateVariableName(bufferName))
			return null;

		return {
			bufferName,
			bufferIndex,
			depthLevel,
			valueLogic,
		};
	}

	// TODO: friendlier logic
	parse(statement) {

		// "[bufferName]([index]) = [valueLogic];"
		// "[bufferName]([index], [depthLevel]) = [valueLogic];"

		let bufferName = "";
		let bufferIndex = "";
		let depthLevel = "";
		let valueLogic = "";
		let parserPhase = 0;
		let brackets = 0;

		for (let ii = 0; ii < statement.length; ++ii) {

			const character = statement[ii];

			switch (parserPhase) {

				case 0: // collect the result buffer name

					if (character === "(") {

						++brackets;
						parserPhase = 1;
					}
					else if (!ParserUtils.isEscapeCharacter(character))
						bufferName += character;

					break;

				case 1: // collect the result buffer index

					if (character === "(")
						++brackets;
					else if (character === ")")
						--brackets;

					if (brackets === 1 && character === ",")
						parserPhase = 2;
					else if (brackets === 0)
						parserPhase = 3;
					else
						bufferIndex += character;

					break;

				case 2: // collect the depth level

					if (character === "(")
						++brackets;
					else if (character === ")")
						--brackets;

					if (brackets === 0)
						parserPhase = 3;
					else
						depthLevel += character;

					break;

				case 3: // 1st step of the ":="

					if (character === ":")
						parserPhase = 4;

					break;

				case 4: // 2nd step of the ":="

					if (character === "=")
						parserPhase = 5;
					else
						return null;

					break;

				case 5: // collect the logic that will return the value to set

					if (!ParserUtils.isEscapeCharacter(character)) {

						valueLogic += character;
						parserPhase = 6;
					}

					break;

				case 6: // end of the setter

					if (character === ";")
						parserPhase = 7;
					else
						valueLogic += character;

					break;
			}
		}

		if (parserPhase === 7) {

			return {
				bufferName,
				bufferIndex,
				depthLevel,
				valueLogic
			};
		}

		return null;
	}
}

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
		}
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
		gl.clear(gl.COLOR_BUFFER_BIT);

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

class GpuTask {

	constructor(gpuSandbox, name) {

		this._gpuSandbox = gpuSandbox;
		this._name = name;

		this._usesDepth = false;
	}

	dispose() {

		// TODO
	}

	setSource(sourceCode) {

		const sandbox = this._gpuSandbox;

		this._usesDepth = false;

		const taskStatements = sourceCode.split(";");
		taskStatements.pop();

		const setters = [];

		do {

			const taskStatement = taskStatements[taskStatements.length - 1] + ";";

			// const setter = ParserUtils.parseSetterStatement(taskStatement);
			const setter = sandbox._setterParser.parse(taskStatement);

			if (!setter)
				break;

			taskStatements.pop();

			if (!sandbox._buffersMap.has(setter.bufferName))
				continue;

			setters.push(setter);

			if (setter.depthLevel.length > 0)
				this._usesDepth = true;

		} while (true);

		if (setters.length === 0)
			throw new Error("sourceCode must end with a setter statement such as `foo[0] = 0;`");

		this._resultBufferName = setters[0].bufferName;

		for (let ii = 1; ii < setters.length; ++ii)
			if (setters[ii].bufferName !== this._resultBufferName)
				throw new Error(`sourceCode must write to only one buffer per task, actual=${setters[ii].bufferName}, expected=${this._resultBufferName}.`);

		const taskWithoutSetters = taskStatements.join(";") + ";";

		// `usedResults` is how many sets this work does.
		// `allocResults` is how many sets we actually allocated space for.
		// Explanation: a result is an (indice, value) pair which will be used on
		// the next pass to fill the target array. Those results are recorded
		// into square sections of a 2D texture. Each monkey has its own square.
		// In order for everything to fit, the square of a monkey will have empty
		// space. For example, if a task makes 3 sets, it requires 6 pixels on
		// the texture report its result (3 indices + 3 values). To fit 6 pixels,
		// we need a square of side 4; side 2 isn't enough because it only fits 4
		// pixels, side 3 isn't allowed because such a square wouldn't align
		// correctly on the texture.
		// TODO: complete this explanation, move it to the top, make some drawings
		const usedResults = setters.length;
		this._allocResults = Math.pow(MathUtils.fitTextureSide(usedResults * 2), 2) / 2;

		let getters = "";

		sandbox._buffersArray.forEach((value) => {

			const methodName = value.name;
			const textureName = value.textureName;
			const textureSide = value._textureSide;

			const source = `

				uniform sampler2D ${textureName};

				// getter (float) for "${textureName}"
				float ${methodName}(float idx) {

					vec2 pos = indexToPos(vec2(${textureSide.toFixed(1)}), idx);

					return unpackFloat(texture2D(${textureName}, pos / ${textureSide.toFixed(2)}));
				}

				// getter (int) for "${textureName}"
				float ${methodName}(int idx) {

					// simple call to the float version of this getter
					return ${methodName}(float(idx));
				}
			`;

			getters += source;
		});

		let setterFns = "";
		for (let ii = 0; ii < this._allocResults; ++ii) {

			const source = `

				void set${ii}(int index_${ii}, int depth_${ii}, float value_${ii}) {

					v_results[${ii * 2 + 0}] = packIndexDepth(index_${ii} + 1, depth_${ii});
					v_results[${ii * 2 + 1}] = packFloat(value_${ii});
				}

				void set${ii}(int index_${ii}, int depth_${ii}, vec4 value_${ii}) {

					v_results[${ii * 2 + 0}] = packIndexDepth(index_${ii} + 1, depth_${ii});
					v_results[${ii * 2 + 1}] = packVec4(value_${ii});
				}
			`;

			setterFns += source;
		}
		let writeToTexture = "";
		for (let ii = 0; ii < this._allocResults * 2; ++ii) {

			if (ii === 0) {

				writeToTexture += `
					if (idx == ${ii})
						gl_FragColor = v_results[${ii}];
				`;
			}
			else {

				writeToTexture += `
					else if (idx == ${ii})
						gl_FragColor = v_results[${ii}];
				`;
			}
		}

		let taskWithSetters = "";
		for (let ii = 0; ii < this._allocResults; ++ii) {

			if (ii < usedResults) {
				const item = setters[ii];
				taskWithSetters += `set${ii}(${item.bufferIndex}, ${(item.depthLevel || 1)}, ${item.valueLogic});`;
			} else {
				taskWithSetters += `set${ii}(0, 0, vec4(0.0));`;
			}
		}
		const vertexShaderSource = `

			precision highp float;

			uniform float u_resultTextureSide;
			uniform float u_resultGridSide;
			uniform float u_resultSquareSide;

			attribute float a_resultIndex;

			varying vec4 v_results[${this._allocResults * 2}];

			${GpuSandbox.prototype._defaultLibSource}

			${getters === undefined ? "" : getters}

			${setterFns === undefined ? "" : setterFns}

			${sandbox._userLibSource === undefined ? "" : sandbox._userLibSource}

			vec4 scaleToScreen(vec2 pos) {

				vec2 screenCoord = scaleRange(vec2(0.0,0.0), vec2(u_resultGridSide), vec2(-1.0), vec2(-1.0 + u_resultSquareSide * u_resultGridSide / u_resultTextureSide * 2.0), pos);
				return vec4(screenCoord + vec2(u_resultSquareSide) / u_resultTextureSide, 1.0, 1.0);
			}

			void main() {

				int taskIndex = int(a_resultIndex);

				${taskWithoutSetters}

				${taskWithSetters}

				gl_PointSize = u_resultSquareSide;
				gl_Position = scaleToScreen(indexToPos(vec2(u_resultGridSide), a_resultIndex));
			}
		`;

		const fragmentShaderSource = `

			precision highp float;

			uniform float u_resultSquareSide;

			varying vec4 v_results[${this._allocResults * 2}];

			void main() {

				vec2 coord = floor(gl_PointCoord * u_resultSquareSide);
				int idx = int((u_resultSquareSide - 1.0 - coord.y) * u_resultSquareSide + coord.x);

				${writeToTexture}
			}
		`;

		this._shadertask = sandbox._buildShader(vertexShaderSource, fragmentShaderSource);
	}

	run(processNumber) {

		const sandbox = this._gpuSandbox;
		const gl = sandbox._gpuContext;

		const resultBuffer = sandbox._buffersMap.get(this._resultBufferName);

		const resultSquareSide = MathUtils.fitTextureSide(this._allocResults * 2);
		const resultGridSide = MathUtils.fitTextureSide(processNumber);
		const usedResultTextureSide = resultGridSide * resultSquareSide;

		sandbox._allocResultTexture(usedResultTextureSide);
		sandbox._allocVertexIndices(Math.max(processNumber, processNumber * resultSquareSide * resultSquareSide / 2));

		gl.useProgram(this._shadertask);

		gl.bindBuffer(gl.ARRAY_BUFFER, sandbox._geometryVBO);

		gl.bindFramebuffer(gl.FRAMEBUFFER, sandbox._textureFramebuffer);

		gl.uniform1f(gl.getUniformLocation(this._shadertask, "u_resultGridSide"), resultGridSide);
		gl.uniform1f(gl.getUniformLocation(this._shadertask, "u_resultSquareSide"), resultSquareSide);
		gl.uniform1f(gl.getUniformLocation(this._shadertask, "u_resultTextureSide"), sandbox._resultTextureSide);

		const resultIndextaskLocation = gl.getAttribLocation(this._shadertask, "a_resultIndex");
		gl.vertexAttribPointer(resultIndextaskLocation, 1, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(resultIndextaskLocation);

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sandbox._resultTextureObject, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);

		gl.viewport(0, 0, sandbox._resultTextureSide, sandbox._resultTextureSide);

		sandbox._buffersArray.forEach((value, index) => {

			gl.activeTexture(gl.TEXTURE0 + index);
			gl.bindTexture(gl.TEXTURE_2D, value.textureObject);

			gl.uniform1i(gl.getUniformLocation(this._shadertask, value.textureName), index);
		});

		gl.drawArrays(gl.POINTS, 0, processNumber);

		if (this._usesDepth)
			gl.enable(gl.DEPTH_TEST);

		gl.useProgram(sandbox._shaderWriter);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sandbox._resultTextureObject);

		gl.uniform1i(gl.getUniformLocation(sandbox._shaderWriter, "u_resultTexture"), sandbox._resultTextureObject);
		gl.uniform1f(gl.getUniformLocation(sandbox._shaderWriter, "u_resultGridSide"), resultGridSide);
		gl.uniform1f(gl.getUniformLocation(sandbox._shaderWriter, "u_resultSquareSide"), resultSquareSide);
		gl.uniform1f(gl.getUniformLocation(sandbox._shaderWriter, "u_resultTextureSide"), sandbox._resultTextureSide);
		gl.uniform1f(gl.getUniformLocation(sandbox._shaderWriter, "u_targetTextureSide"), resultBuffer._textureSide);

		const resultIndexWriterLocation = gl.getAttribLocation(sandbox._shaderWriter, "a_resultIndex");
		gl.vertexAttribPointer(resultIndexWriterLocation, 1, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(resultIndexWriterLocation);

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resultBuffer.textureObject, 0);
		gl.viewport(0, 0, resultBuffer._textureSide, resultBuffer._textureSide);

		if (this._usesDepth) {

			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, resultBuffer._depthbuffer);
			gl.clear(gl.DEPTH_BUFFER_BIT);
		}

		gl.drawArrays(gl.POINTS, 0, processNumber * resultSquareSide * resultSquareSide / 2);

		if (this._usesDepth)
			gl.disable(gl.DEPTH_TEST);
	}
}

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
