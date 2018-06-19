
import Circuit from "./circuit.js";
import Car from "./car.js";
import GeneticAlgorithm from "../ai/geneticAlgorithm.js";

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
		const genomes = this._geneticAlgorithm.genomes;

		this._cars = [];
		for (let ii = 0; ii < genomeSize; ++ii) {

			const car = new Car(position, angle, checkpoints);

			genomes[ii].car = car;

			this._cars.push(car);
		}

		this._trails = [];

		//

		// chain tasks:
		// -> set input (<= sensor results)
		// -> compute neural network (need weights)
		// ---> 1st hidden layer: input -> output1
		// ---> 2nd hidden layer: output1 -> output2
		// ---> output layer: output2 -> output3
		// -> update car
		// ---> set positon and angle (<= output3)
		// ---> collide walls (need position+walls)
		// ---> update sensors (need position+angle)
		// ---> collide sensors (need walls)
		// ---> collide checkpoints (need checkpoints+position)
		// repeat

		// checkpoints => [ { p1X, p1Y, p2X, p2Y }, ... ]
		// walls => [ { p1X, p1Y, p2X, p2Y }, ... ]
		// weights => [ { weight, ... }, ... ]
		// workspaces => [ { [inputs + outputs],  }, ... ]
		// sensors => [ { { p1X, p1Y, p2X, p2Y, result }, ... }, ... ]
		// car => [ { posX, posY, angle, alive, healthTicks, totalTicks }, ...  ]

		const walls = this._circuit.walls;

		this._gpuTaskNumber = 40;

		this._gpuSandbox = new GpuSandbox();

		// checkpoints => [ { p1X, p1Y, p2X, p2Y }, ... ]
		const bufferCheckpoints = this._gpuSandbox.createBuffer("bufferCheckpoints");
		const dataCheckpoints = [];
		checkpoints.forEach((item) => dataCheckpoints.push(item.p1.x, item.p1.y, item.p2.x, item.p2.y));
		bufferCheckpoints.setWithFloats(dataCheckpoints);

		// walls => [ { p1X, p1Y, p2X, p2Y }, ... ]
		const bufferWalls = this._gpuSandbox.createBuffer("bufferWalls");
		const dataWalls = [];
		walls.forEach((item) => dataWalls.push(item.p1.x, item.p1.y, item.p2.x, item.p2.y));
		bufferWalls.setWithFloats(dataWalls);

		// weights => [ { weight, ... }, ... ]
		const bufferWeights = this._gpuSandbox.createBuffer("bufferWeights");
		const dataWeights = [];
		genomes.forEach((genome) => {
			genome.weights.forEach((weight) => dataWeights.push(weight));
		});
		bufferWeights.setWithFloats(dataWeights);

		// workspaces => [ { [input & outputs],  }, ... ]
		const bufferWorkspaces = this._gpuSandbox.createBuffer("bufferWorkspaces");
		let workspaceSize = 0;
		this._annTopology.forEach((totalNeurons) => workspaceSize += totalNeurons);
		bufferWorkspaces.setWithLength(this._gpuTaskNumber * workspaceSize);

		// sensors => [ { { p1X, p1Y, p2X, p2Y, result }, ... }, ... ]
		const bufferSensors = this._gpuSandbox.createBuffer("bufferSensors");

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
