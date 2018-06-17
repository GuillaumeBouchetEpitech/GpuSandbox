
export default [
	{
		input: 'src/index.js',
		output: [
			{
				format: 'es',
				name: 'GpuSandbox',
				file: 'build/gpu-sandbox.js',
				indent: '\t'
			}
		]
	},
	{
		input: 'src/index-global.js',
		output: [
			{
				format: 'es',
				name: 'GpuSandbox',
				file: 'build/gpu-sandbox-global.js',
				indent: '\t'
			}
		]
	}
];
