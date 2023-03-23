import {scaleLinear} from "d3-scale";
import {ID, LinkDatum, NodeDatum} from "./types";

function defaultId(node: NodeDatum) {
	if (node.id) {
		return node.id;
	} else {
		throw new Error('id is not provided and node.id is undefined!!');
	}
}
function markovMobility(
	oldNodes: NodeDatum[],
	oldLinks: LinkDatum[],
	nodes: NodeDatum[],
	links: LinkDatum[],
	id: (node: NodeDatum) => ID = defaultId,
) {
	let defaultDistance = 50;

	let isInit = false;
	if (!oldNodes.length && !oldLinks.length) {
		isInit = true;
	}

	let oldNodesById: Record<ID, NodeDatum> = {};
	let oldLinksById: Record<string, LinkDatum> = {};

	// 两个 map 用来保存原有的节点和连边
	oldNodes.forEach(node => {
		oldNodesById[id(node)] = node;
	});
	oldLinks.forEach(link => {
		oldLinksById[link.id] = link;
	});

	// 影响力矩阵
	let I: Record<ID, Record<ID, number>> = {};
	// 初始节点移动概率
	let p0: Record<string, number> = {};

	nodes.forEach(node => {
		if (node.pos === undefined) {
			node.pos = 0;
		}
		if (node.mobility === undefined) {
			node.mobility = 1;
		}
		p0[id(node)] = 0;
	});

	let adjacentMatrix = __adjacent_matrix(links);
	let degree = __degree(adjacentMatrix);

	// 最短路径矩阵
	let shortestPathMatrix: Record<ID, Record<ID, number>> = {};
	for (let node in adjacentMatrix) {
		shortestPathMatrix[node] = dijkstra(adjacentMatrix, node);
	}

	//1.计算节点的初始移动概率，分为三个部分
	//1.1 第一部分需要计算为理想距离与实际距离之差(第一个时间片不考虑该影响)
	if (!isInit) {
		nodes.forEach(nodeI => {
			nodes.forEach(nodeJ => {
				if (adjacentMatrix[id(nodeI)][id(nodeJ)]) {
					let idealDistance = defaultDistance * shortestPathMatrix[id(nodeI)][id(nodeJ)];
					let deltaX = nodeI.x! - nodeJ.x!;
					let deltaY = nodeI.y! - nodeJ.y!;
					nodeI.pos = Math.abs((Math.sqrt(deltaX * deltaX + deltaY * deltaY) - idealDistance)) / idealDistance;
				}
			});
			nodeI.pos /= degree[id(nodeI)];
		});
	}

	//1.2 如果节点是新增的，则其移动概率+1
	nodes.forEach(node => {
		if (!oldNodesById[id(node)]) {
			node.mov = 1 + node.pos;
		} else {
			node.mov = node.pos;
		}
	});

	const idFromEdge = (node: ID | NodeDatum): ID => {
		if (typeof node === 'object') {
			return id(node);
		} else {
			return node;
		}
	}

	//1.3 针对每条新增的连边，会影响连边两端的节点的移动概率
	links.forEach((link) => {
		if (!oldLinksById[link.id]) {
			p0[idFromEdge(link.source)] += 1 / degree[idFromEdge(link.source)];
			p0[idFromEdge(link.target)] += 1 / degree[idFromEdge(link.target)];
		}
	});

	//2.计算转移矩阵，直接得到逆马尔可夫矩阵，行的和为1
	nodes.forEach(nodeI => {
		p0[id(nodeI)] += nodeI.mov;
		nodes.forEach(nodeJ => {
			if (!I[id(nodeI)]) {
				I[id(nodeI)] = {};
			}
			if (shortestPathMatrix[id(nodeI)][id(nodeJ)] === 1 && id(nodeI) !== id(nodeJ)) {
				I[id(nodeI)][id(nodeJ)] = 1 / degree[id(nodeI)];
			} else {
				I[id(nodeI)][id(nodeJ)] = 0;
			}
		});
	});

	//3. 转移矩阵，计算马尔可夫链达到稳定，也就是p0不再发生变化
	let diff = 1;
	let a = 0.8;
	let sum;
	let lastSum = 0;
	let res: Record<ID, number> = {};

	// p: hard copy of p0
	let p: Record<ID, number> = {};
	for (let node in p0) {
		p[node] = p0[node];
	}
	while (diff > 0.1) {
		// matrix product res = p0 * I
		for (let line in I) {
			res[line] = 0;
			for (let node in p0) {
				res[line] += p0[node] * I[line][node];
			}
		}

		// sum = SUM(res)
		sum = 0;
		for (let node in res) {
			sum += res[node];
		}
		sum *= a;

		diff = Math.abs(sum - lastSum);

		// p0 = res, res = res * a, p += res
		for (let node in res) {
			p0[node] = res[node];
			res[node] *= a;
			p[node] += res[node];
		}

		a *= 0.8;
		lastSum = sum;
	}

	// 归一化
	const linear = scaleLinear()
		.domain([Math.min(...Object.values(p)), Math.max(...Object.values(p))])
		.range([0.2, 1]);
	nodes.forEach(node => {
		node.mobility = linear(p[id(node)]);
	});

	function __adjacent_matrix(links: LinkDatum[]) {
		let adjacentMatrix: Record<ID, Record<ID, number>> = {};
		links.forEach(link => {
			let src = typeof link.source === 'object' ? id(link.source) : link.source;
			let tgt = typeof link.target === 'object' ? id(link.target) : link.target;

			if (!adjacentMatrix[src]) {
				adjacentMatrix[src] = {};
			}
			if (!adjacentMatrix[tgt]) {
				adjacentMatrix[tgt] = {};
			}

			adjacentMatrix[src][tgt] = 1;
			adjacentMatrix[tgt][src] = 1;
		});
		return adjacentMatrix;
	}

	function __degree(adjacentMatrix: Record<ID, Record<ID, number>>) {
		let degree: Record<ID, number> = {};
		Object.keys(adjacentMatrix).forEach(key => {
			degree[key] = Object.keys(adjacentMatrix[key]).length;
		});
		return degree;
	}

	function dijkstra(adjacentMatrix: Record<ID, Record<ID, number>>, start: ID) {
		// 到所有节点的距离
		let distances: Record<ID, number> = {};
		for (let node in adjacentMatrix) {
			distances[node] = Infinity;
		}
		distances[start] = 0;

		let queue: Array<ID> = [];
		queue.push(start);

		while (queue.length > 0) {
			let currentNode = queue.shift();
			if (currentNode !== undefined) {
				let neighbors = adjacentMatrix[currentNode];

				for (let neighbor in neighbors) {
					// 计算从起始节点到该相邻节点的距离
					let distance = distances[currentNode] + neighbors[neighbor];

					// 如果计算出来的距离比已有的距离更短，则更新距离
					if (distance < distances[neighbor]) {
						distances[neighbor] = distance;
						queue.push(neighbor);
					}
				}
			}
		}

		return distances;
	}
}

export default markovMobility;
