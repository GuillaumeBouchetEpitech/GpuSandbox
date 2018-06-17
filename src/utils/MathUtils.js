
class MathUtils {

	static fract(x) {

		return (x - Math.floor(x));
	}

	static fitTextureSide(size) {

		return Math.pow(2, Math.ceil(Math.log(Math.sqrt(size)) / Math.log(2)));
	};
}

export default MathUtils;
