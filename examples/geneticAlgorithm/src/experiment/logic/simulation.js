
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

		this._gpu = {
			totalTaskNumber: 40,
			sandbox: new GpuSandbox(),
		};

		// checkpoints => [ { p1X, p1Y, p2X, p2Y }, ... ]
		const bufferCheckpoints = this._gpu.sandbox.createBuffer("bufferCheckpoints");
		const dataCheckpoints = [];
		checkpoints.forEach(item => dataCheckpoints.push(item.p1.x, item.p1.y, item.p2.x, item.p2.y));
		bufferCheckpoints.setWithFloats(dataCheckpoints);
		const strideCheckpoints = 4;

		// walls => [ { p1X, p1Y, p2X, p2Y }, ... ]
		const bufferWalls = this._gpu.sandbox.createBuffer("bufferWalls");
		const dataWalls = [];
		walls.forEach(item => dataWalls.push(item.p1.x, item.p1.y, item.p2.x, item.p2.y));
		bufferWalls.setWithFloats(dataWalls);
		const strideWalls = 4;

		// weights => [ { weight, ... }, ... ]
		const bufferWeights = this._gpu.sandbox.createBuffer("bufferWeights");
		const dataWeights = [];
		genomes.forEach(genome => {
			genome.weights.forEach(weight => dataWeights.push(weight));
		});
		bufferWeights.setWithFloats(dataWeights);
		const strideWeights = genomes[0].weights.length;

		// workspaces => [ { [input & outputs],  }, ... ]
		const bufferWorkspaces = this._gpu.sandbox.createBuffer("bufferWorkspaces");
		let singleWorkspaceSize = 0;
		this._annTopology.forEach(totalNeurons => singleWorkspaceSize += totalNeurons);
		bufferWorkspaces.setWithLength(this._gpu.totalTaskNumber * singleWorkspaceSize);
		const strideWorkspaces = singleWorkspaceSize;

		// sensors => [ { { p1X, p1Y, p2X, p2Y, result }, ... }, ... ]
		const bufferSensors = this._gpu.sandbox.createBuffer("bufferSensors");
		const dataSensors = [];
		this._cars.forEach(() => {
			for (let ii = 0; ii < 5; ++ii)
				dataSensors.push(0, 0, 0, 0, 1);
		});
		bufferSensors.setWithFloats(dataSensors);
		const strideSensor = 5; // <= sensor (5 * float[5])
		const strideSensors = 5 * strideSensor; // <= sensors (5 * sensor)

		// car => [ { posX, posY, angle, alive, healthTicks, totalTicks }, ...  ]
		const bufferCars = this._gpu.sandbox.createBuffer("bufferCars");
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

		// -> set inputs
		// -> 5 sensors (value) to 5 neurons (input layer)
		const setInputsTaskSource = `

			int sensorsOffset = taskIndex * ${strideSensors};
			int workspacesOffset = taskIndex * ${strideWorkspaces};

			// TODO: hardcoded stuff here

			float myStack[5];

			for (int ii = 0; ii < 5; ++ii)
			{
				float sensorValue = bufferSensors(sensorsOffset + 4);
				myStack[ii] = sensorValue;
			}

			;

			bufferWorkspaces(workspacesOffset + 0) := myStack[0];
			bufferWorkspaces(workspacesOffset + 1) := myStack[1];
			bufferWorkspaces(workspacesOffset + 2) := myStack[2];
			bufferWorkspaces(workspacesOffset + 3) := myStack[3];
			bufferWorkspaces(workspacesOffset + 4) := myStack[4];
		`;

		const setInputsTask = this._gpu.sandbox.createTask("set-inputs-task");
		setInputsTask.setSource(setInputsTaskSource);

		//

		// -> compute hidden layer 1
		// -> 5 neurons (input) to 4 neurons (hidden layer 1)
		const computeHiddenLayer1TaskSource = `

			int workspacesOffset = taskIndex * ${strideWorkspaces};
			int weightsOffset = taskIndex * ${strideWeights};

			// TODO: hardcoded stuff here

			float myStack[4];

			for (int ii = 0; ii < 4; ++ii)
			{
				float activation = 0.0;

				for (int jj = 0; jj < 5; ++jj)
				{
					float inputValue = bufferWorkspaces(workspacesOffset + jj);
					float weightValue = bufferWeights(weightsOffset + jj);

					activation = inputValue * weightValue;
				}

				myStack[ii] = activation;
			}

			;

			bufferWorkspaces(workspacesOffset + 5 + 0) := myStack[0];
			bufferWorkspaces(workspacesOffset + 5 + 1) := myStack[1];
			bufferWorkspaces(workspacesOffset + 5 + 2) := myStack[2];
			bufferWorkspaces(workspacesOffset + 5 + 3) := myStack[3];
		`;

		const computeHiddenLayer1Task = this._gpu.sandbox.createTask("compute-hidden-layer-1-task");
		computeHiddenLayer1Task.setSource(computeHiddenLayer1TaskSource);

		//

		// -> compute hidden layer 2
		// -> 4 neurons (hidden layer 1) to 3 neurons (hidden layer 2)
		const computeHiddenLayer2TaskSource = `

			int workspacesOffset = taskIndex * ${strideWorkspaces};
			int weightsOffset = taskIndex * ${strideWeights};

			// TODO: hardcoded stuff here

			float myStack[3];

			for (int ii = 0; ii < 3; ++ii)
			{
				float activation = 0.0;

				for (int jj = 0; jj < 4; ++jj)
				{
					float inputValue = bufferWorkspaces(workspacesOffset + 5 + jj);
					float weightValue = bufferWeights(weightsOffset + 5 + jj);

					activation = inputValue * weightValue;
				}

				myStack[ii] = activation;
			}

			;

			bufferWorkspaces(workspacesOffset + 5 + 4 + 0) := myStack[0];
			bufferWorkspaces(workspacesOffset + 5 + 4 + 1) := myStack[1];
			bufferWorkspaces(workspacesOffset + 5 + 4 + 2) := myStack[2];
		`;

		const computeHiddenLayer2Task = this._gpu.sandbox.createTask("compute-hidden-layer-2-task");
		computeHiddenLayer2Task.setSource(computeHiddenLayer2TaskSource);

		//

		// -> compute output layer
		// -> 3 neurons (hidden layer 2) to 2 neurons (output layer)
		const computeOutputLayerTaskSource = `

			int workspacesOffset = taskIndex * ${strideWorkspaces};
			int weightsOffset = taskIndex * ${strideWeights};

			// TODO: hardcoded stuff here

			float myStack[2];

			for (int ii = 0; ii < 2; ++ii)
			{
				float activation = 0.0;

				for (int jj = 0; jj < 3; ++jj)
				{
					float inputValue = bufferWorkspaces(workspacesOffset + 5 + 4 + jj);
					float weightValue = bufferWeights(weightsOffset + 5 + 4 + jj);

					activation = inputValue * weightValue;
				}

				myStack[ii] = activation;
			}

			;

			bufferWorkspaces(workspacesOffset + 5 + 4 + 3 + 0) := myStack[0];
			bufferWorkspaces(workspacesOffset + 5 + 4 + 3 + 1) := myStack[1];
		`;

		const computeOutputLayerTask = this._gpu.sandbox.createTask("compute-output-layer-task");
		computeOutputLayerTask.setSource(computeOutputLayerTaskSource);

		//

		// -> compute car data
		const updateCarDataTaskSource = `

			#define M_PI 3.1415926535897932384626433832795
			#define M_ROUND(d_value) (floor((d_value) + 0.5))
			#define M_DELTA 0.016


			int carsOffset = taskIndex * ${strideCars};
			int workspacesOffset = taskIndex * ${strideWorkspaces};

			float myStack[5];
			myStack[0] = bufferCars(carsOffset + 0); // position x
			myStack[1] = bufferCars(carsOffset + 1); // position y
			myStack[2] = bufferCars(carsOffset + 2); // rotation angle
			myStack[3] = bufferCars(carsOffset + 3); // is alive
			myStack[4] = bufferCars(carsOffset + 4); // health in ticks

			int isAlive = int(M_ROUND(myStack[3]));

			if (isAlive > 0)
			{
				int healthInTicks = int(M_ROUND(myStack[4]));

				if (healthInTicks > 0)
				{
					--healthInTicks;
				}

				if (healthInTicks == 0)
				{
					healthInTicks = 50; // TODO: hardcoded stuff here
					isAlive = 0;
					myStack[3] = float(isAlive);
				}

				myStack[4] = float(healthInTicks);
			}

			if (isAlive > 0)
			{
				float leftTheta = bufferWorkspaces(workspacesOffset + 5 + 4 + 3 + 0);
				float rightTheta = bufferWorkspaces(workspacesOffset + 5 + 4 + 3 + 1);

				// if (isinf(leftTheta) ||
				// 	isnan(leftTheta))
				// 	leftTheta = 0;

				// if (isinf(rightTheta) ||
				// 	isnan(rightTheta))
				// 	rightTheta = 0;

				float speedMax = 15.0;
				float steerMax = M_PI / 32.0;

				// TODO: try "clamp"
				myStack[2] += max(-steerMax, min(steerMax, leftTheta * steerMax));
				float speed = max(-speedMax, min(speedMax, rightTheta * speedMax));

				myStack[0] += (speed * cos(myStack[2])) * M_DELTA;
				myStack[1] += (speed * sin(myStack[2])) * M_DELTA;
			}

			;

			bufferCars(carsOffset + 0) := myStack[0]; // position x
			bufferCars(carsOffset + 1) := myStack[1]; // position y
			bufferCars(carsOffset + 2) := myStack[2]; // rotation angle
			bufferCars(carsOffset + 3) := myStack[3]; // is alive
			bufferCars(carsOffset + 4) := myStack[4]; // health in ticks
		`;

		const updateCarDataTask = this._gpu.sandbox.createTask("compute-car-data-task");
		updateCarDataTask.setSource(updateCarDataTaskSource);

		//


		// -> collide walls
		const collideWallsTaskSource = `

			#define M_PI 3.1415926535897932384626433832795
			#define M_ROUND(d_value) (floor((d_value) + 0.5))
			#define M_DELTA 0.016


			int carsOffset = taskIndex * ${strideCars};
			int workspacesOffset = taskIndex * ${strideWorkspaces};

			float myStack[5];
			myStack[0] = bufferCars(carsOffset + 0); // position x
			myStack[1] = bufferCars(carsOffset + 1); // position y
			myStack[2] = bufferCars(carsOffset + 2); // rotation angle
			myStack[3] = bufferCars(carsOffset + 3); // is alive
			myStack[4] = bufferCars(carsOffset + 4); // health in ticks

			int isAlive = int(M_ROUND(myStack[3]));

			if (isAlive > 0)
			{
				int healthInTicks = int(M_ROUND(myStack[4]));

				if (healthInTicks > 0)
				{
					--healthInTicks;
				}

				if (healthInTicks == 0)
				{
					healthInTicks = 50; // TODO: hardcoded stuff here
					isAlive = 0;
					myStack[3] = float(isAlive);
				}

				myStack[4] = float(healthInTicks);
			}

			if (isAlive > 0)
			{
				float leftTheta = bufferWorkspaces(workspacesOffset + 5 + 4 + 3 + 0);
				float rightTheta = bufferWorkspaces(workspacesOffset + 5 + 4 + 3 + 1);

				// if (isinf(leftTheta) ||
				// 	isnan(leftTheta))
				// 	leftTheta = 0;

				// if (isinf(rightTheta) ||
				// 	isnan(rightTheta))
				// 	rightTheta = 0;

				float speedMax = 15.0;
				float steerMax = M_PI / 32.0;

				// TODO: try "clamp"
				myStack[2] += max(-steerMax, min(steerMax, leftTheta * steerMax));
				float speed = max(-speedMax, min(speedMax, rightTheta * speedMax));

				myStack[0] += (speed * cos(myStack[2])) * M_DELTA;
				myStack[1] += (speed * sin(myStack[2])) * M_DELTA;
			}

			;

			bufferCars(carsOffset + 0) := myStack[0]; // position x
			bufferCars(carsOffset + 1) := myStack[1]; // position y
			bufferCars(carsOffset + 2) := myStack[2]; // rotation angle
			bufferCars(carsOffset + 3) := myStack[3]; // is alive
			bufferCars(carsOffset + 4) := myStack[4]; // health in ticks
		`;

		const collideWallsTask = this._gpu.sandbox.createTask("collide-walls-task");
		collideWallsTask.setSource(collideWallsTaskSource);

		//


		// -> update car
		// ---> set positon and angle (<= output3)
		// ---> collide walls (need position+walls)
		// ---> update sensors (need position+angle)
		// ---> collide sensors (need walls)
		// ---> collide checkpoints (need checkpoints+position)

		//

		setInputsTask.run(this._gpu.totalTaskNumber);
		computeHiddenLayer1Task.run(this._gpu.totalTaskNumber);
		computeHiddenLayer2Task.run(this._gpu.totalTaskNumber);
		computeOutputLayerTask.run(this._gpu.totalTaskNumber);
		updateCarDataTask.run(this._gpu.totalTaskNumber);
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
