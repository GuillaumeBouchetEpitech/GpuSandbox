
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

export default ParserUtils;
