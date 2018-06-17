
import ParserUtils from "./utils/ParserUtils.js"

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

export default SetterParser;
