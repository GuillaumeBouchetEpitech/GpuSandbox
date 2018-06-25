
window.onload = () => {

	console.log(`currentDate=${(new Date()).toISOString()}`);

	console.log("===");

	{
		const gpuSandbox = new GpuSandbox();

		const librarySource = `

			const int g_globalValue = 200;

			float myAdd(float a, float b)
			{
			    return a + b;
			}
		`;

		gpuSandbox.setLibrarySource(librarySource);

		const bufferA = gpuSandbox.createBuffer("bufferA");
		bufferA.setWithFloats([1, 2, 3, 4]);

		const bufferB = gpuSandbox.createBuffer("bufferB");
		bufferB.setWithFloats([1, 2, 3, 4]);

		const bufferC = gpuSandbox.createBuffer("bufferC");
		bufferC.setWithLength(16);

		const testTask = gpuSandbox.createTask("test");

		const taskSource = `

			float valueA = bufferA(taskIndex);
			float valueB = bufferB(taskIndex);

			float valueC = myAdd(valueA, valueB);

			float myStack[4];

			for (int ii = 0; ii < 2; ++ii)
			{
				myStack[ii * 2 + 0] = valueC + float(ii);
				myStack[ii * 2 + 1] = valueC + float(ii) + float(g_globalValue);
			}

			;

			bufferC(taskIndex * 4 + 0) := myStack[0];
			bufferC(taskIndex * 4 + 1) := myStack[1];
			bufferC(taskIndex * 4 + 2) := myStack[2];
			bufferC(taskIndex * 4 + 3) := myStack[3];
			;
		`;

		testTask.setSource(taskSource);

		testTask.run(4);

		console.log(`bufferA=${bufferA.unpackAsFloats()}`);
		console.log(`bufferB=${bufferB.unpackAsFloats()}`);

		const result = bufferC.unpackAsFloats();

		console.log(`bufferC=${result}`);

		result.forEach((item, ii) => {

			console.log(`bufferC[${ii}]=item=${item.toFixed(3)}`);
		});
	}

	console.log("===");

	// chain workers:
	// -> compute neural network (need weights)
	// ---> 1st hidden layer
	// ---> 2nd hidden layer
	// ---> output layer
	// -> update positon and angle
	// -> get sensor results
	// repeat

	// const textLib = extractDomElementText("gpu-library");
	// const textWork = extractDomElementText("gpu-worker");

	// // console.log(textLib);
	// // console.log(textWork);

	// const monkeys = WebMonkeys();

	// const totalWorker = 1;

	// monkeys.set("neuralNetworkOutput", totalWorker * 2);

	// // monkeys.set("in_workspace", totalWorker * 20);
	// monkeys.set("inout_workspace", Array.apply(null, {length: (totalWorker * 20)}).map(Number.call, Number));
	// monkeys.set("in_weights", totalWorker * 50);

	// monkeys.set("out_workerResult", totalWorker);

	// // monkeys.set("hiddenLayers", [1, 1, 2, 2, 3, 3, 4, 4]);
	// // monkeys.set("outputs", [1, 1, 2, 2, 3, 3, 4, 4]);

	// // You can set a lib of GLSL functions using the .lib call
	// monkeys.lib(textLib);

	// // Workers are able to use functions defined on the lib
	// monkeys.work(4, textWork);

	// // const lol_str = [
	// // 	"vec2 checkpoint = vec2(checkpoints(i * 2), checkpoints(i * 2 + 1));",
	// // 	"vec2 lol = vec2(a(i), b(i));",
	// // 	"c(i) := add(lol.x + checkpoint.x, lol.y + checkpoint.y) + float(g_globalValue);"
	// // ].join("\n")

	// // console.log(lol_str);

	// // // // Workers are able to use functions defined on the lib
	// // monkeys.work(4, lol_str);

	// const result = monkeys.get("inout_workspace");

	// console.log(`result=${result}`);
}
