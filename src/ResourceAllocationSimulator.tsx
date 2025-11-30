import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Plus, Trash2, Play, RotateCcw, Circle, Square } from 'lucide-react';

interface Position {
  x: number;
  y: number;
}

interface ProcessNode {
  id: string;
  type: 'process';
  position: Position;
}

interface ResourceNode {
  id: string;
  type: 'resource';
  instances: number;
  position: Position;
}

type Node = ProcessNode | ResourceNode;

interface Edge {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'allocation';
}

interface Log {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const ResourceAllocationSimulator = () => {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 'P1', type: 'process', position: { x: 150, y: 150 } },
    { id: 'P2', type: 'process', position: { x: 150, y: 350 } },
    { id: 'R1', type: 'resource', instances: 1, position: { x: 450, y: 150 } },
    { id: 'R2', type: 'resource', instances: 1, position: { x: 450, y: 350 } },
  ]);

  const [edges, setEdges] = useState<Edge[]>([
    { id: 'e1', from: 'P1', to: 'R1', type: 'allocation' },
    { id: 'e2', from: 'P1', to: 'R2', type: 'request' },
    { id: 'e3', from: 'P2', to: 'R2', type: 'allocation' },
    { id: 'e4', from: 'P2', to: 'R1', type: 'request' },
  ]);

  const [logs, setLogs] = useState<Log[]>([
    { timestamp: Date.now(), message: 'System initialized with example deadlock scenario', type: 'info' }
  ]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [edgeMode, setEdgeMode] = useState<'request' | 'allocation' | null>(null);
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [deadlockedNodes, setDeadlockedNodes] = useState<Set<string>>(new Set());
  const [cycleEdges, setCycleEdges] = useState<Set<string>>(new Set());
  const [safeSequence, setSafeSequence] = useState<string[] | null>(null);
  const [isSafe, setIsSafe] = useState<boolean | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const processCounter = useRef(3);
  const resourceCounter = useRef(3);

  const addLog = (message: string, type: Log['type'] = 'info') => {
    setLogs(prev => [{ timestamp: Date.now(), message, type }, ...prev].slice(0, 50));
  };

  const addProcessNode = () => {
    const newNode: ProcessNode = {
      id: `P${processCounter.current}`,
      type: 'process',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 300 }
    };
    processCounter.current++;
    setNodes(prev => [...prev, newNode]);
    addLog(`Added process ${newNode.id}`, 'success');
  };

  const addResourceNode = () => {
    const newNode: ResourceNode = {
      id: `R${resourceCounter.current}`,
      type: 'resource',
      instances: 1,
      position: { x: 400 + Math.random() * 200, y: 100 + Math.random() * 300 }
    };
    resourceCounter.current++;
    setNodes(prev => [...prev, newNode]);
    addLog(`Added resource ${newNode.id} with 1 instance`, 'success');
  };

  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    addLog(`Deleted node ${nodeId}`, 'warning');
    setSelectedNode(null);
  };

  const deleteEdge = (edgeId: string) => {
    const edge = edges.find(e => e.id === edgeId);
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    if (edge) {
      addLog(`Deleted ${edge.type} edge from ${edge.from} to ${edge.to}`, 'warning');
    }
  };

  const updateResourceInstances = (nodeId: string, delta: number) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId && n.type === 'resource') {
        const newInstances = Math.max(1, n.instances + delta);
        addLog(`Updated ${nodeId} instances to ${newInstances}`, 'info');
        return { ...n, instances: newInstances };
      }
      return n;
    }));
  };

  const handleMouseDown = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (edgeMode && edgeStart) {
      const startNode = nodes.find(n => n.id === edgeStart);
      const endNode = nodes.find(n => n.id === nodeId);

      if (startNode && endNode && edgeStart !== nodeId) {
        if (edgeMode === 'request' && startNode.type === 'process' && endNode.type === 'resource') {
          const newEdge: Edge = {
            id: `e${Date.now()}`,
            from: edgeStart,
            to: nodeId,
            type: 'request'
          };
          setEdges(prev => [...prev, newEdge]);
          addLog(`Created request edge: ${edgeStart} → ${nodeId}`, 'success');
        } else if (edgeMode === 'allocation' && startNode.type === 'resource' && endNode.type === 'process') {
          const newEdge: Edge = {
            id: `e${Date.now()}`,
            from: edgeStart,
            to: nodeId,
            type: 'allocation'
          };
          setEdges(prev => [...prev, newEdge]);
          addLog(`Created allocation edge: ${edgeStart} → ${nodeId}`, 'success');
        } else {
          addLog('Invalid edge connection', 'error');
        }
      }

      setEdgeMode(null);
      setEdgeStart(null);
      return;
    }

    if (event.button === 0) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        setDraggingNode(nodeId);
        setDragOffset({
          x: event.clientX - node.position.x,
          y: event.clientY - node.position.y
        });
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (draggingNode && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - dragOffset.x;
      const y = event.clientY - rect.top - dragOffset.y;

      setNodes(prev => prev.map(n =>
        n.id === draggingNode ? { ...n, position: { x, y } } : n
      ));
    }
  };

  const handleMouseUp = () => {
    setDraggingNode(null);
  };

  const startEdgeCreation = (nodeId: string, type: 'request' | 'allocation') => {
    setEdgeMode(type);
    setEdgeStart(nodeId);
    addLog(`Click a ${type === 'request' ? 'resource' : 'process'} node to complete the ${type} edge`, 'info');
  };

  const detectDeadlock = () => {
    addLog('Starting deadlock detection...', 'info');

    const waitForGraph: Map<string, Set<string>> = new Map();
    const processes = nodes.filter(n => n.type === 'process').map(n => n.id);

    processes.forEach(p => waitForGraph.set(p, new Set()));

    edges.forEach(edge => {
      if (edge.type === 'request') {
        const resource = edge.to;
        const allocationEdges = edges.filter(e => e.type === 'allocation' && e.from === resource);

        allocationEdges.forEach(allocEdge => {
          const holdingProcess = allocEdge.to;
          if (holdingProcess !== edge.from) {
            waitForGraph.get(edge.from)?.add(holdingProcess);
          }
        });
      }
    });

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = waitForGraph.get(node) || new Set();

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path])) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycles.push(cycle);
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    processes.forEach(process => {
      if (!visited.has(process)) {
        dfs(process, []);
      }
    });

    if (cycles.length > 0) {
      const deadlocked = new Set<string>();
      cycles.forEach(cycle => cycle.forEach(node => deadlocked.add(node)));

      setDeadlockedNodes(deadlocked);

      const cycleEdgeSet = new Set<string>();
      cycles.forEach(cycle => {
        for (let i = 0; i < cycle.length; i++) {
          const from = cycle[i];
          const to = cycle[(i + 1) % cycle.length];

          edges.forEach(edge => {
            if (edge.type === 'request' && edge.from === from) {
              const resource = edge.to;
              const allocEdges = edges.filter(e =>
                e.type === 'allocation' && e.from === resource && e.to === to
              );
              if (allocEdges.length > 0) {
                cycleEdgeSet.add(edge.id);
                allocEdges.forEach(ae => cycleEdgeSet.add(ae.id));
              }
            }
          });
        }
      });

      setCycleEdges(cycleEdgeSet);
      addLog(`DEADLOCK DETECTED! Processes involved: ${Array.from(deadlocked).join(', ')}`, 'error');
    } else {
      setDeadlockedNodes(new Set());
      setCycleEdges(new Set());
      addLog('No deadlock detected - system is safe', 'success');
    }
  };

  const runBankersAlgorithm = () => {
    addLog('Running Banker\'s Algorithm...', 'info');

    const processes = nodes.filter(n => n.type === 'process').map(n => n.id);
    const resources = nodes.filter(n => n.type === 'resource') as ResourceNode[];

    const allocation: Map<string, Map<string, number>> = new Map();
    const request: Map<string, Map<string, number>> = new Map();
    const available: Map<string, number> = new Map();

    processes.forEach(p => {
      allocation.set(p, new Map());
      request.set(p, new Map());
      resources.forEach(r => {
        allocation.get(p)!.set(r.id, 0);
        request.get(p)!.set(r.id, 0);
      });
    });

    resources.forEach(r => {
      available.set(r.id, r.instances);
    });

    edges.forEach(edge => {
      if (edge.type === 'allocation') {
        const resource = edge.from;
        const process = edge.to;
        const current = allocation.get(process)?.get(resource) || 0;
        allocation.get(process)?.set(resource, current + 1);
        available.set(resource, (available.get(resource) || 0) - 1);
      } else if (edge.type === 'request') {
        const process = edge.from;
        const resource = edge.to;
        const current = request.get(process)?.get(resource) || 0;
        request.get(process)?.set(resource, current + 1);
      }
    });

    const finished = new Set<string>();
    const sequence: string[] = [];
    const work = new Map(available);

    let progress = true;
    while (progress && finished.size < processes.length) {
      progress = false;

      for (const process of processes) {
        if (finished.has(process)) continue;

        let canFinish = true;
        for (const resource of resources) {
          const needed = request.get(process)?.get(resource.id) || 0;
          const avail = work.get(resource.id) || 0;
          if (needed > avail) {
            canFinish = false;
            break;
          }
        }

        if (canFinish) {
          finished.add(process);
          sequence.push(process);

          for (const resource of resources) {
            const allocated = allocation.get(process)?.get(resource.id) || 0;
            work.set(resource.id, (work.get(resource.id) || 0) + allocated);
          }

          progress = true;
          break;
        }
      }
    }

    if (finished.size === processes.length) {
      setSafeSequence(sequence);
      setIsSafe(true);
      addLog(`System is SAFE. Safe sequence: ${sequence.join(' → ')}`, 'success');
    } else {
      setSafeSequence(null);
      setIsSafe(false);
      addLog('System is UNSAFE - no safe sequence exists', 'error');
    }
  };

  const resetGraph = () => {
    setNodes([
      { id: 'P1', type: 'process', position: { x: 150, y: 150 } },
      { id: 'P2', type: 'process', position: { x: 150, y: 350 } },
      { id: 'R1', type: 'resource', instances: 1, position: { x: 450, y: 150 } },
      { id: 'R2', type: 'resource', instances: 1, position: { x: 450, y: 350 } },
    ]);
    setEdges([
      { id: 'e1', from: 'P1', to: 'R1', type: 'allocation' },
      { id: 'e2', from: 'P1', to: 'R2', type: 'request' },
      { id: 'e3', from: 'P2', to: 'R2', type: 'allocation' },
      { id: 'e4', from: 'P2', to: 'R1', type: 'request' },
    ]);
    setDeadlockedNodes(new Set());
    setCycleEdges(new Set());
    setSafeSequence(null);
    setIsSafe(null);
    setSelectedNode(null);
    setEdgeMode(null);
    setEdgeStart(null);
    processCounter.current = 3;
    resourceCounter.current = 3;
    addLog('Graph reset to default deadlock example', 'info');
  };

  const getAllocationTable = () => {
    const processes = nodes.filter(n => n.type === 'process');
    const resources = nodes.filter(n => n.type === 'resource');

    const table: Map<string, Map<string, number>> = new Map();

    processes.forEach(p => {
      table.set(p.id, new Map());
      resources.forEach(r => table.get(p.id)!.set(r.id, 0));
    });

    edges.forEach(edge => {
      if (edge.type === 'allocation') {
        const process = edge.to;
        const resource = edge.from;
        const current = table.get(process)?.get(resource) || 0;
        table.get(process)?.set(resource, current + 1);
      }
    });

    return { table, processes, resources };
  };

  const getRequestTable = () => {
    const processes = nodes.filter(n => n.type === 'process');
    const resources = nodes.filter(n => n.type === 'resource');

    const table: Map<string, Map<string, number>> = new Map();

    processes.forEach(p => {
      table.set(p.id, new Map());
      resources.forEach(r => table.get(p.id)!.set(r.id, 0));
    });

    edges.forEach(edge => {
      if (edge.type === 'request') {
        const process = edge.from;
        const resource = edge.to;
        const current = table.get(process)?.get(resource) || 0;
        table.get(process)?.set(resource, current + 1);
      }
    });

    return { table, processes, resources };
  };

  const getAvailableResources = () => {
    const resources = nodes.filter(n => n.type === 'resource') as ResourceNode[];
    const available: Map<string, number> = new Map();

    resources.forEach(r => {
      available.set(r.id, r.instances);
    });

    edges.forEach(edge => {
      if (edge.type === 'allocation') {
        const resource = edge.from;
        available.set(resource, (available.get(resource) || 0) - 1);
      }
    });

    return { available, resources };
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setDraggingNode(null);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const allocation = getAllocationTable();
  const request = getRequestTable();
  const availableRes = getAvailableResources();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Resource Allocation Graph Simulator</h1>
          <p className="text-slate-600">Visualize and detect deadlocks using RAG and Banker's Algorithm</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={addProcessNode}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  <Circle size={16} />
                  Add Process
                </button>
                <button
                  onClick={addResourceNode}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                >
                  <Square size={16} />
                  Add Resource
                </button>
                {selectedNode && (
                  <>
                    <button
                      onClick={() => startEdgeCreation(selectedNode, 'request')}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
                    >
                      Request Edge
                    </button>
                    <button
                      onClick={() => startEdgeCreation(selectedNode, 'allocation')}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
                    >
                      Allocation Edge
                    </button>
                    <button
                      onClick={() => deleteNode(selectedNode)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                    >
                      <Trash2 size={16} />
                      Delete Node
                    </button>
                  </>
                )}
              </div>

              <svg
                ref={svgRef}
                width="100%"
                height="500"
                className="border-2 border-slate-200 rounded-lg bg-slate-50"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <defs>
                  <marker
                    id="arrowhead-request"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#f97316" />
                  </marker>
                  <marker
                    id="arrowhead-allocation"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#8b5cf6" />
                  </marker>
                  <marker
                    id="arrowhead-cycle"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
                  </marker>
                </defs>

                {edges.map(edge => {
                  const fromNode = nodes.find(n => n.id === edge.from);
                  const toNode = nodes.find(n => n.id === edge.to);

                  if (!fromNode || !toNode) return null;

                  const isCycle = cycleEdges.has(edge.id);
                  const color = isCycle ? '#ef4444' : (edge.type === 'request' ? '#f97316' : '#8b5cf6');
                  const marker = isCycle ? 'url(#arrowhead-cycle)' : (edge.type === 'request' ? 'url(#arrowhead-request)' : 'url(#arrowhead-allocation)');

                  return (
                    <g key={edge.id}>
                      <line
                        x1={fromNode.position.x}
                        y1={fromNode.position.y}
                        x2={toNode.position.x}
                        y2={toNode.position.y}
                        stroke={color}
                        strokeWidth={isCycle ? 3 : 2}
                        markerEnd={marker}
                        className="cursor-pointer hover:opacity-70"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete this ${edge.type} edge?`)) {
                            deleteEdge(edge.id);
                          }
                        }}
                      />
                    </g>
                  );
                })}

                {nodes.map(node => {
                  const isDeadlocked = deadlockedNodes.has(node.id);
                  const isSelected = selectedNode === node.id;

                  if (node.type === 'process') {
                    return (
                      <g
                        key={node.id}
                        onMouseDown={(e) => handleMouseDown(node.id, e)}
                        onClick={() => setSelectedNode(node.id)}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={node.position.x}
                          cy={node.position.y}
                          r={30}
                          fill={isDeadlocked ? '#ef4444' : '#3b82f6'}
                          stroke={isSelected ? '#1e293b' : '#1e40af'}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                        <text
                          x={node.position.x}
                          y={node.position.y}
                          textAnchor="middle"
                          dy=".3em"
                          fill="white"
                          fontSize="16"
                          fontWeight="bold"
                        >
                          {node.id}
                        </text>
                      </g>
                    );
                  } else {
                    return (
                      <g
                        key={node.id}
                        onMouseDown={(e) => handleMouseDown(node.id, e)}
                        onClick={() => setSelectedNode(node.id)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={node.position.x - 30}
                          y={node.position.y - 30}
                          width={60}
                          height={60}
                          fill={isDeadlocked ? '#ef4444' : '#10b981'}
                          stroke={isSelected ? '#1e293b' : '#059669'}
                          strokeWidth={isSelected ? 3 : 2}
                          rx={4}
                        />
                        <text
                          x={node.position.x}
                          y={node.position.y - 5}
                          textAnchor="middle"
                          fill="white"
                          fontSize="16"
                          fontWeight="bold"
                        >
                          {node.id}
                        </text>
                        <text
                          x={node.position.x}
                          y={node.position.y + 12}
                          textAnchor="middle"
                          fill="white"
                          fontSize="12"
                        >
                          ({node.instances})
                        </text>
                        {isSelected && (
                          <>
                            <text
                              x={node.position.x - 40}
                              y={node.position.y}
                              textAnchor="middle"
                              fill="white"
                              fontSize="20"
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateResourceInstances(node.id, -1);
                              }}
                            >
                              −
                            </text>
                            <text
                              x={node.position.x + 40}
                              y={node.position.y}
                              textAnchor="middle"
                              fill="white"
                              fontSize="20"
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateResourceInstances(node.id, 1);
                              }}
                            >
                              +
                            </text>
                          </>
                        )}
                      </g>
                    );
                  }
                })}
              </svg>

              <div className="mt-4 text-sm text-slate-600">
                <p><strong>Instructions:</strong> Drag nodes to reposition. Click to select. Click edges to delete.</p>
                <p className="mt-1">
                  <span className="inline-block w-4 h-4 bg-blue-500 rounded-full mr-2"></span>Process (Circle)
                  <span className="inline-block w-4 h-4 bg-green-500 ml-4 mr-2"></span>Resource (Square)
                  <span className="inline-block w-8 h-0.5 bg-orange-500 ml-4 mr-2"></span>Request
                  <span className="inline-block w-8 h-0.5 bg-purple-500 ml-4 mr-2"></span>Allocation
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Controls</h2>
              <div className="space-y-2">
                <button
                  onClick={detectDeadlock}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-semibold"
                >
                  <AlertCircle size={20} />
                  Detect Deadlock
                </button>
                <button
                  onClick={runBankersAlgorithm}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition font-semibold"
                >
                  <Play size={20} />
                  Run Banker's Algorithm
                </button>
                <button
                  onClick={resetGraph}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition font-semibold"
                >
                  <RotateCcw size={20} />
                  Reset Graph
                </button>
              </div>

              {isSafe !== null && (
                <div className={`mt-4 p-4 rounded-lg ${isSafe ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className={`font-semibold ${isSafe ? 'text-green-800' : 'text-red-800'}`}>
                    {isSafe ? '✓ System is SAFE' : '✗ System is UNSAFE'}
                  </p>
                  {safeSequence && (
                    <p className="text-sm text-green-700 mt-2">
                      Safe sequence: {safeSequence.join(' → ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Allocation Matrix</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Process</th>
                      {allocation.resources.map(r => (
                        <th key={r.id} className="text-center p-2">{r.id}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.processes.map(p => (
                      <tr key={p.id} className="border-b">
                        <td className="font-semibold p-2">{p.id}</td>
                        {allocation.resources.map(r => (
                          <td key={r.id} className="text-center p-2">
                            {allocation.table.get(p.id)?.get(r.id) || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Request Matrix</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Process</th>
                      {request.resources.map(r => (
                        <th key={r.id} className="text-center p-2">{r.id}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {request.processes.map(p => (
                      <tr key={p.id} className="border-b">
                        <td className="font-semibold p-2">{p.id}</td>
                        {request.resources.map(r => (
                          <td key={r.id} className="text-center p-2">
                            {request.table.get(p.id)?.get(r.id) || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Available Resources</h2>
              <div className="space-y-2">
                {availableRes.resources.map(r => (
                  <div key={r.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                    <span className="font-semibold">{r.id}</span>
                    <span>{availableRes.available.get(r.id)} / {r.instances}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Event Log</h2>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`text-xs p-2 rounded ${
                      log.type === 'error' ? 'bg-red-50 text-red-800' :
                      log.type === 'warning' ? 'bg-orange-50 text-orange-800' :
                      log.type === 'success' ? 'bg-green-50 text-green-800' :
                      'bg-slate-50 text-slate-800'
                    }`}
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceAllocationSimulator;
