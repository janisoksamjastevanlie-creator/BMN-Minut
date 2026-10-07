import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '../../context/AppContext';
import { WarehouseRack, InventoryItem } from '../../types';
import { Package, Layers, AlertTriangle, AlertCircle, CheckCircle2, ArrowRight, PlusCircle, Search } from 'lucide-react';

export const Warehouse3D: React.FC<{ onSelectItem?: (item: InventoryItem) => void }> = ({ onSelectItem }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { warehouseRacks, inventoryItems, performance3D, setActiveView, setIsQuickActionOpen, setSelectedInventoryItem } = useApp();
  const [selectedRackId, setSelectedRackId] = useState<string>('rack-a');
  const [hoveredRackName, setHoveredRackName] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rackMeshesRef = useRef<{ [key: string]: THREE.Mesh }>({});
  const animationFrameRef = useRef<number | null>(null);

  const selectedRack = warehouseRacks.find(r => r.id === selectedRackId);
  const rackItems = inventoryItems.filter(item => item.rak === selectedRack?.code);

  const safeCount = rackItems.filter(i => i.status === 'Aman').length;
  const warningCount = rackItems.filter(i => i.status === 'Menipis').length;
  const emptyCount = rackItems.filter(i => i.status === 'Habis').length;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.03);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 7, 12);
    camera.lookAt(0, 1.2, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: performance3D !== 'low',
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, performance3D === 'low' ? 1 : 2));
    renderer.shadowMap.enabled = performance3D === 'normal';
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // 4. Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(amb);

    const dirLight = new THREE.DirectionalLight(0x60a5fa, 1.6);
    dirLight.position.set(10, 15, 8);
    dirLight.castShadow = performance3D === 'normal';
    scene.add(dirLight);

    const orangeLight = new THREE.PointLight(0xf59e0b, 1.5, 15);
    orangeLight.position.set(0, 4, 2);
    scene.add(orangeLight);

    // 5. Floor (Warehouse Polished Concrete)
    const floorGeo = new THREE.PlaneGeometry(24, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.3
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = performance3D === 'normal';
    scene.add(floor);

    // Grid lines for warehouse aisles
    const grid = new THREE.GridHelper(24, 24, 0x1e3a8a, 0x334155);
    grid.position.y = 0.01;
    scene.add(grid);

    // 6. Build 5 Warehouse Industrial Racks
    rackMeshesRef.current = {};
    warehouseRacks.forEach(rack => {
      const [rx, ry, rz] = rack.position3D;
      const isSelected = rack.id === selectedRackId;

      // Filter items to evaluate shelf health color
      const itemsInRack = inventoryItems.filter(i => i.rak === rack.code);
      const hasEmpty = itemsInRack.some(i => i.status === 'Habis');
      const hasLow = itemsInRack.some(i => i.status === 'Menipis');

      // Main structural uprights (Metal Frame)
      const frameGroup = new THREE.Group();
      frameGroup.position.set(rx, ry, rz);

      const rackWidth = 1.35;
      const rackHeight = 2.4;
      const rackDepth = 3.6;

      // Rack hit box for click detection
      const hitBoxGeo = new THREE.BoxGeometry(rackWidth + 0.2, rackHeight + 0.2, rackDepth + 0.2);
      const hitBoxMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: isSelected ? 0.25 : 0.05,
        color: isSelected ? 0x38bdf8 : 0xffffff
      });
      const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
      hitBox.userData = { rackId: rack.id, rackName: rack.name };
      hitBox.position.set(0, 0.2, 0);
      frameGroup.add(hitBox);
      rackMeshesRef.current[rack.id] = hitBox;

      // Shelves (Horizontal steel beams)
      const shelfLevels = 4;
      for (let s = 0; s < shelfLevels; s++) {
        const shelfY = -1.0 + s * 0.75;
        const shelfGeo = new THREE.BoxGeometry(rackWidth, 0.06, rackDepth);
        const shelfMat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          roughness: 0.5,
          metalness: 0.6
        });
        const shelfMesh = new THREE.Mesh(shelfGeo, shelfMat);
        shelfMesh.position.y = shelfY;
        frameGroup.add(shelfMesh);

        // Boxes/Inventory items on shelves
        if (performance3D !== 'low') {
          for (let b = 0; b < 4; b++) {
            const boxZ = -1.2 + b * 0.8;
            const boxGeo = new THREE.BoxGeometry(0.7, 0.45, 0.55);

            // Box color according to health
            let boxColor = 0x3b82f6; // safe
            if (s === 1 && hasEmpty) boxColor = 0xef4444; // empty/red
            else if (s === 2 && hasLow) boxColor = 0xf59e0b; // low/yellow
            else if (rack.code === 'Rak D') boxColor = 0x10b981;
            else if (rack.code === 'Rak C') boxColor = 0xa855f7;

            const boxMat = new THREE.MeshStandardMaterial({
              color: boxColor,
              roughness: 0.7
            });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(0, shelfY + 0.25, boxZ);
            box.castShadow = performance3D === 'normal';
            frameGroup.add(box);
          }
        }
      }

      // Overhead Rack Sign Tag
      const signGeo = new THREE.BoxGeometry(1.2, 0.35, 0.08);
      const signMat = new THREE.MeshStandardMaterial({
        color: isSelected ? 0x0284c7 : 0x1e293b,
        emissive: isSelected ? 0x0284c7 : 0x000000,
        emissiveIntensity: 0.3
      });
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, rackHeight / 2 + 0.3, 0);
      frameGroup.add(sign);

      scene.add(frameGroup);
    });

    // 7. Interactive Controls & Orbiting
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 14, theta: 0.0, phi: 0.95 };

    const updateCamera = () => {
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, 1.0, 0);
    };
    updateCamera();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        spherical.theta -= deltaX * 0.007;
        spherical.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, spherical.phi - deltaY * 0.007));
        updateCamera();
      } else {
        raycaster.setFromCamera(mouse, camera);
        const meshes = Object.values(rackMeshesRef.current);
        const intersects = raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          setHoveredRackName(hit.userData.rackName);
          container.style.cursor = 'pointer';
        } else {
          setHoveredRackName(null);
          container.style.cursor = 'default';
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;

      const rect = container.getBoundingClientRect();
      const clickMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(clickMouse, camera);
      const meshes = Object.values(rackMeshesRef.current);
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        setSelectedRackId(hit.userData.rackId);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(6, Math.min(22, spherical.radius + e.deltaY * 0.015));
      updateCamera();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // 8. Render Loop
    const animate = () => {
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [warehouseRacks, selectedRackId, performance3D, inventoryItems]);

  return (
    <div className="relative w-full h-[540px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl flex flex-col md:flex-row">
      {/* 3D Warehouse Canvas */}
      <div className="relative flex-1 h-full min-h-[340px]" ref={containerRef}>
        {/* Top Tag */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-xs font-semibold text-slate-200 flex items-center gap-1.5 shadow-lg">
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span>Digital Twin Gudang Persediaan BPS Minahasa Utara</span>
          </div>

          {hoveredRackName && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-600/90 backdrop-blur-md text-white text-xs font-bold animate-pulse shadow-lg">
              {hoveredRackName}
            </div>
          )}
        </div>

        {/* Rack Quick Selector */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-1.5 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-xl">
          <Layers className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
          {warehouseRacks.map(rack => (
            <button
              key={rack.id}
              onClick={() => setSelectedRackId(rack.id)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                selectedRackId === rack.id ? 'bg-amber-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {rack.code}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 z-10 hidden sm:flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-700/60 text-[11px] shadow-lg">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500"></span>
            <span>Aman</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500"></span>
            <span>Menipis (≤ Min)</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500"></span>
            <span>Habis (0)</span>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-400 bg-slate-900/60 backdrop-blur-sm px-2.5 py-1 rounded-md">
          Klik rak untuk membuka daftar stok item & bin code
        </div>
      </div>

      {/* Selected Rack Items Panel */}
      <div className="w-full md:w-88 bg-slate-900/95 backdrop-blur-xl border-t md:border-t-0 md:border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto">
        {selectedRack ? (
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  {selectedRack.code} • 4 Shelves
                </span>
                <h3 className="text-lg font-bold text-white mt-1 leading-snug">{selectedRack.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedRack.category}</p>
              </div>
            </div>

            {/* Health Stat */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
              <div className="bg-emerald-950/30 border border-emerald-900/50 p-2 rounded-lg">
                <div className="flex items-center justify-center text-emerald-400 text-[10px] mb-0.5">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  <span>Aman</span>
                </div>
                <div className="text-base font-bold text-emerald-300">{safeCount}</div>
              </div>

              <div className="bg-amber-950/30 border border-amber-900/50 p-2 rounded-lg">
                <div className="flex items-center justify-center text-amber-400 text-[10px] mb-0.5">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  <span>Menipis</span>
                </div>
                <div className="text-base font-bold text-amber-300">{warningCount}</div>
              </div>

              <div className="bg-rose-950/30 border border-rose-900/50 p-2 rounded-lg">
                <div className="flex items-center justify-center text-rose-400 text-[10px] mb-0.5">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  <span>Habis</span>
                </div>
                <div className="text-base font-bold text-rose-300">{emptyCount}</div>
              </div>
            </div>

            {/* Items inside this rack */}
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Daftar Barang Pada {selectedRack.code}</span>
                <span className="text-slate-500 font-normal">{rackItems.length} jenis</span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {rackItems.slice(0, 10).map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedInventoryItem(item);
                      if (onSelectItem) onSelectItem(item);
                    }}
                    className="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="mr-2">
                        <div className="text-xs font-semibold text-slate-200 line-clamp-1">{item.nama}</div>
                        <div className="text-[10px] font-mono text-cyan-400 mt-0.5 flex items-center gap-1.5">
                          <span className="bg-slate-800 px-1.5 py-0.2 rounded text-[10px] text-slate-300">{item.binCode}</span>
                          <span>• Min {item.stokMinimum} {item.satuan}</span>
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-xs font-bold text-white">
                          {item.stokSaatIni} <span className="text-[10px] font-normal text-slate-400">{item.satuan}</span>
                        </div>
                        <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                          item.status === 'Aman' ? 'text-emerald-400 bg-emerald-500/10' :
                          item.status === 'Menipis' ? 'text-amber-400 bg-amber-500/10' :
                          'text-rose-400 bg-rose-500/10'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Action Button */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex gap-2">
          <button
            onClick={() => setActiveView('inventory')}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>Lihat Persediaan</span>
          </button>

          <button
            onClick={() => setIsQuickActionOpen(true)}
            className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-amber-600/20"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Barang Masuk</span>
          </button>
        </div>
      </div>
    </div>
  );
};
