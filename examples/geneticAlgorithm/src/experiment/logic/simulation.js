
import Circuit from "./circuit.js";
import Car from "./car.js";
import GeneticAlgorithm from "../ai/geneticAlgorithm.js";

//

import "../../externals/WebMonkeys.js";

//

class Simulation {

	constructor(circuitData) {

		//
		// circuit

		const genomeSize = 40;
		this._annTopology = [5, 4, 3, 2];

		this._geneticAlgorithm = new GeneticAlgorithm(genomeSize, this._annTopology);
		this._circuit = new Circuit(circuitData);

		//
		// cars

		const position = this._circuit.startPosition;
		const angle = this._circuit.startAngle;
		const checkpoints = this._circuit.checkpoints;

		this._cars = [];
		for (let ii = 0; ii < genomeSize; ++ii) {

			const car = new Car(position, angle, checkpoints);

			this._geneticAlgorithm.genomes[ii].car = car;

			this._cars.push(car);
		}

		this._trails = [];

		//

		// chain workers:
		// -> compute neural network (need weights)
		// ---> 1st hidden layer
		// ---> 2nd hidden layer
		// ---> output layer
		// -> update positon and angle
		// -> get sensor results
		// repeat

		// this._monkeys = WebMonkeys();


		// _processLayer(layer, inputs, output) {

		// 	// Cycle over all the connections and sum their weights against the inputs.
		// 	for (let ii = 0; ii < layer.length; ++ii) {

		// 		const connections = layer[ii];

		// 		let activation = 0.0;

		// 		// Sum the weights to the activation value.
		// 		for (let jj = 0; jj < inputs.length; ++jj)
		// 			activation += inputs[jj] * connections[jj];

		// 		output.push(activation);
		// 	}
		// }

		// // weights (offset + size)
		// // inputs (offset + size)
		// // outputs offset to write in
		// // number of neurons on the current layer
		// // number of neurons on the previous layer

		// this._monkeys.lib([
		// 	"float processLayer(vec2 layerData, vec2 inputsData, int outputsOffset) {",
		// 	"",
		// 	"    int layerOffset = layerData.x;",
		// 	"    int layerSize = layerData.y;",
		// 	"",
		// 	"    int inputsOffset = inputsData.x;",
		// 	"    int inputsSize = inputsData.y;",
		// 	"",
		// 	"    for (int ii = 0; ii < layerSize; ++ii)",
		// 	"    {",
		// 	"        int weightsOffset = layerOffset + ii",
		// 	"        connections",
		// 	"    }",
		// 	"",
		// 	"    return a + b;",
		// 	"}",
		// ].join("\n"));

		// this._monkeys.set("weights", [1, 1, 2, 2, 3, 3, 4, 4]);

		// // this._monkeys.set("a", [1, 2, 3, 4]);
		// // this._monkeys.set("b", [1, 2, 3, 4]);
		// // this._monkeys.set("c", 4);
		// // this._monkeys.set("checkpoints", [1, 1, 2, 2, 3, 3, 4, 4]);

		// // this._monkeys.set("hiddenLayers", [1, 1, 2, 2, 3, 3, 4, 4]);
		// // this._monkeys.set("outputs", [1, 1, 2, 2, 3, 3, 4, 4]);

		// // // Workers are able to use functions defined on the lib
		// // this._monkeys.work(4, [
		// // 	"vec2 checkpoint = vec2(checkpoints(i * 2), checkpoints(i * 2 + 1));",
		// // 	"vec2 lol = vec2(a(i), b(i));",
		// // 	"c(i) := add(lol.x + checkpoint.x, lol.y + checkpoint.y);"
		// // ].join("\n"));

		// // const result = this._monkeys.get("c");

	}

	update(delta) {

		let readyToBreed = true;

		for (let ii = 0; ii < this._cars.length; ++ii) {

			if (!this._cars[ii].alive)
				continue;

			this._cars[ii].update(delta, this._circuit.walls, this._geneticAlgorithm.ANNs[ii]);

			readyToBreed = false;
		}

		// end of the current generation?

		if (!readyToBreed)
			return; // no

		// rate the genome

		for (let ii = 0; ii < this._cars.length; ++ii)
			this._geneticAlgorithm.genomes[ii].fitness = this._cars[ii].fitness;

		const progressWasMade = this._geneticAlgorithm.breedPopulation();

		// save the best trail

		if (progressWasMade) {

			this._trails.push( this._geneticAlgorithm._bestGenome.car.trail );

			if (this._trails.length > 5)
				this._trails.shift();
		}

		// reset the cars

		for (let ii = 0; ii < this._cars.length; ++ii) {

			const car = this._cars[ii];

			car.reset(this._circuit.startPosition, this._circuit.startAngle);

			this._geneticAlgorithm.genomes[ii].car = car;
		}
	}

	get annTopology() { return this._annTopology; }
	get geneticAlgorithm() { return this._geneticAlgorithm; }
	get circuit() { return this._circuit; }
	get cars() { return this._cars; }
	get trails() { return this._trails; }

}

export default Simulation;
