
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

		this._initGpuVersion();
	}

	_initGpuVersion() {

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

		const position = this._circuit.startPosition;
		const angle = this._circuit.startAngle;
		const checkpoints = this._circuit.checkpoints;
		const genomes = this._geneticAlgorithm.genomes;
		const walls = this._circuit.walls;

		this._gpuTotalTaskNumber = 40;

		this._gpuSandbox = new GpuSandbox();

		// checkpoints => [ { p1X, p1Y, p2X, p2Y }, ... ]
		const bufferCheckpoints = this._gpuSandbox.createBuffer("bufferCheckpoints");
		const dataCheckpoints = [];
		checkpoints.forEach(item => dataCheckpoints.push(item.p1.x, item.p1.y, item.p2.x, item.p2.y));
		bufferCheckpoints.setWithFloats(dataCheckpoints);
		const strideCheckpoints = 4;

		// walls => [ { p1X, p1Y, p2X, p2Y }, ... ]
		const bufferWalls = this._gpuSandbox.createBuffer("bufferWalls");
		const dataWalls = [];
		walls.forEach(item => dataWalls.push(item.p1.x, item.p1.y, item.p2.x, item.p2.y));
		bufferWalls.setWithFloats(dataWalls);
		const strideWalls = 4;

		// weights => [ { weight, ... }, ... ]
		const bufferWeights = this._gpuSandbox.createBuffer("bufferWeights");
		const dataWeights = [];
		genomes.forEach(genome => {
			genome.weights.forEach(weight => dataWeights.push(weight));
		});
		bufferWeights.setWithFloats(dataWeights);
		const strideWeights = genome.weights.length;

		// workspaces => [ { [input & outputs],  }, ... ]
		const bufferWorkspaces = this._gpuSandbox.createBuffer("bufferWorkspaces");
		let singleWorkspaceSize = 0;
		this._annTopology.forEach(totalNeurons => singleWorkspaceSize += totalNeurons);
		bufferWorkspaces.setWithLength(this._gpuTotalTaskNumber * singleWorkspaceSize);
		const strideWorkspaces = singleWorkspaceSize;

		// sensors => [ { { p1X, p1Y, p2X, p2Y, result }, ... }, ... ]
		const bufferSensors = this._gpuSandbox.createBuffer("bufferSensors");
		const dataSensors = [];
		this._cars.forEach(() => {
			for (let ii = 0; ii < 5; ++ii)
				dataSensors.push(0, 0, 0, 0, 1);
		});
		bufferSensors.setWithFloats(dataSensors);
		const strideSensor = 5; // <= sensor (5 * float[5])
		const strideSensors = 5 * strideSensor; // <= sensors (5 * sensor)

		// car => [ { posX, posY, angle, alive, healthTicks, totalTicks }, ...  ]
		const bufferCars = this._gpuSandbox.createBuffer("bufferCars");
		const dataCars = [];
		this._cars.forEach((car) => {
			dataCars.push(
				position.x,
				position.y,
				angle,
				1, // alive
				car.maxHealthInTicks, // healthInTicks
				0, // totalTicks
			);
		});
		bufferCars.setWithFloats(dataCars);
		const strideCars = 6;

		const setInputTaskSource = `

			const int sensorsOffset = taskIndex * ${strideSensors};
			const int workspacesOffset = taskIndex * ${strideWorkspaces};

			for (int ii = 0; ii < 5; ++ii)
			{
				workspacesOffset() = ;
			}

			float sensorsOffset = bufferSensors(sensorsOffset);
			float valueB = bufferB(taskIndex);

			float valueC = myAdd(valueA, valueB);

			bufferWorkspaces(taskIndex * strideWorkspaces) := valueC + float(g_globalValue);
		`;

		// -> set input (<= sensor results)
		const setInputTask = gpuSandbox.createTask("set-input-task");
		setInputTask.setSource(setInputTaskSource);

		testTask.run(8);
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
