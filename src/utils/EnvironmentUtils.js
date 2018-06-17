
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

export default EnvironmentUtils;
