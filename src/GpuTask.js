
import MathUtils from "./utils/MathUtils.js"

import GpuSandbox from "./GpuSandbox.js"

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

		// get the "not commented" and not "not empty" lines of code;
		const taskStatements = sourceCode.split(";")
										 .map(item => item.trim())
										 .filter(item => item.substr(0, 2) !== "//")
										 .filter(item => item.length > 0);

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
		};

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
		};

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

export default GpuTask;
