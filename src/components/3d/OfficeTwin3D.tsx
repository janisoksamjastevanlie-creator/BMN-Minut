import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '../../context/AppContext';
import { BmnAsset, OfficeRoom } from '../../types';
import { canAccessView } from '../../utils/rbac';
import { Building2, Layers, ZoomIn, ZoomOut, RotateCcw, AlertTriangle, CheckCircle2, XCircle, Info, ArrowRight } from 'lucide-react';

export const OfficeTwin3D: React.FC<{ onSelectRoom?: (room: OfficeRoom) => void; assets?: BmnAsset[] }> = ({ onSelectRoom, assets: displayedAssets }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { rooms, assets: allAssets, performance3D, setActiveView, updateRoom, currentUser, hasPermission } = useApp();
  const assets = displayedAssets ?? allAssets;
  const updateRoomRef = useRef(updateRoom);
  updateRoomRef.current = updateRoom;
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(rooms[0]?.id || null);
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [hoveredRoomName, setHoveredRoomName] = useState<string | null>(null);
  const canManageRooms = canAccessView('rooms', hasPermission, currentUser);

  // References for Three.js instance
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const roomMeshesRef = useRef<{ [key: string]: THREE.Mesh }>({});
  const animationFrameRef = useRef<number | null>(null);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const roomAssets = assets.filter(a => a.ruanganId === selectedRoomId);
  const baikCount = roomAssets.filter(a => a.kondisi === 'Baik').length;
  const rusakRinganCount = roomAssets.filter(a => a.kondisi === 'Rusak Ringan').length;
  const rusakBeratCount = roomAssets.filter(a => a.kondisi === 'Rusak Berat').length;
  const totalNilai = roomAssets.reduce((acc, curr) => acc + curr.nilaiPerolehan, 0);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.025);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(12, 10, 14);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: performance3D !== 'low',
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, performance3D === 'low' ? 1 : 2));
    renderer.shadowMap.enabled = performance3D === 'normal';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;

    container.replaceChildren(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    dirLight.position.set(15, 20, 10);
    dirLight.castShadow = performance3D === 'normal';
    scene.add(dirLight);

    const bluePointLight = new THREE.PointLight(0x38bdf8, 2, 20);
    bluePointLight.position.set(0, 5, 0);
    scene.add(bluePointLight);

    // 5. Ground Grid & Foundation
    const grid = new THREE.GridHelper(24, 24, 0x1e3a8a, 0x1e293b);
    grid.position.y = -0.01;
    scene.add(grid);

    // Building Foundation Slab
    const foundationGeo = new THREE.BoxGeometry(16, 0.2, 12);
    const foundationMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.2
    });
    const foundation = new THREE.Mesh(foundationGeo, foundationMat);
    foundation.position.y = -0.1;
    scene.add(foundation);

    // 6. Create Room Meshes
    roomMeshesRef.current = {};
    rooms.forEach(room => {
      const isFloorVisible = selectedFloor === 'all' || room.floor === selectedFloor;
      if (!isFloorVisible) return;

      const [w, h, d] = room.size3D;
      const [x, y, z] = room.position3D;

      // Outer room box (semi-transparent glass walls)
      const roomGeo = new THREE.BoxGeometry(w, h, d);
      const isSelected = room.id === selectedRoomId;

      // Color by health: check if has damaged assets
      const assetsInRoom = assets.filter(a => a.ruanganId === room.id);
      const hasRusakBerat = assetsInRoom.some(a => a.kondisi === 'Rusak Berat');
      const hasRusakRingan = assetsInRoom.some(a => a.kondisi === 'Rusak Ringan');
      
      let baseColor = new THREE.Color(room.color);
      if (hasRusakBerat) baseColor = new THREE.Color('#ef4444');
      else if (hasRusakRingan) baseColor = new THREE.Color('#eab308');

      const roomMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: isSelected ? 0.85 : 0.45,
        wireframe: performance3D === 'low'
      });

      const roomGroup = new THREE.Group();
      roomGroup.position.set(x, y, z);
      const mesh = new THREE.Mesh(roomGeo, roomMat);
      mesh.position.set(0, 0, 0);
      mesh.userData = { roomId: room.id, roomName: room.name };
      mesh.castShadow = performance3D === 'normal';
      mesh.receiveShadow = performance3D === 'normal';
      roomGroup.add(mesh);
      roomMeshesRef.current[room.id] = mesh;

      // Inner office furniture representation (low-poly desks)
      if (performance3D !== 'low') {
        const deskGeo = new THREE.BoxGeometry(w * 0.45, 0.3, d * 0.4);
        const deskMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
        const desk = new THREE.Mesh(deskGeo, deskMat);
        desk.position.set(0, -(h / 2) + 0.25, 0);
        roomGroup.add(desk);

        // Status beacon on top of the room
        const beaconGeo = new THREE.SphereGeometry(0.18, 12, 12);
        const beaconColor = hasRusakBerat ? 0xef4444 : hasRusakRingan ? 0xeab308 : 0x10b981;
        const beaconMat = new THREE.MeshBasicMaterial({ color: beaconColor });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(0, (h / 2) + 0.25, 0);
        roomGroup.add(beacon);
      }
      scene.add(roomGroup);
    });

    // 7. Interactive Orbiting & Raycasting
    let isDragging = false;
    let draggedRoomId: string | null = null;
    let draggedRoomGroup: THREE.Group | null = null;
    let dragPlane: THREE.Plane | null = null;
    let dragOffset: THREE.Vector3 | null = null;
    let roomDragMoved = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 19, theta: 0.8, phi: 1.0 };

    const updateCameraFromSpherical = () => {
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, 1.5, 0);
    };
    updateCameraFromSpherical();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const dragIntersection = new THREE.Vector3();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(Object.values(roomMeshesRef.current));
      const hit = intersects[0]?.object as THREE.Mesh | undefined;
      const roomGroup = hit?.parent;

      if (canManageRooms && e.target === renderer.domElement && hit && roomGroup instanceof THREE.Group) {
        const roomId = hit.userData.roomId as string;
        const roomPosition = roomGroup.position;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -roomPosition.y);
        const hitPoint = raycaster.ray.intersectPlane(plane, dragIntersection);
        if (hitPoint) {
          draggedRoomId = roomId;
          draggedRoomGroup = roomGroup;
          dragPlane = plane;
          dragOffset = roomPosition.clone().sub(hitPoint);
          dragOffset.y = 0;
          roomDragMoved = false;
          container.style.cursor = 'grabbing';
          return;
        }
      }

      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (draggedRoomId && draggedRoomGroup && dragPlane && dragOffset) {
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
          const nextX = dragIntersection.x + dragOffset.x;
          const nextZ = dragIntersection.z + dragOffset.z;
          if (Math.abs(nextX - draggedRoomGroup.position.x) > 0.001 || Math.abs(nextZ - draggedRoomGroup.position.z) > 0.001) {
            roomDragMoved = true;
          }
          draggedRoomGroup.position.x = nextX;
          draggedRoomGroup.position.z = nextZ;
        }
        return;
      }

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        spherical.theta -= deltaX * 0.007;
        spherical.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, spherical.phi - deltaY * 0.007));
        updateCameraFromSpherical();
      } else {
        // Hover Raycast
        raycaster.setFromCamera(mouse, camera);
        const meshes = Object.values(roomMeshesRef.current);
        const intersects = raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          setHoveredRoomName(hit.userData.roomName);
          container.style.cursor = canManageRooms ? 'grab' : 'pointer';
        } else {
          setHoveredRoomName(null);
          container.style.cursor = 'default';
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (draggedRoomId && draggedRoomGroup) {
        const roomId = draggedRoomId;
        const roomGroup = draggedRoomGroup;
        const moved = roomDragMoved;
        draggedRoomId = null;
        draggedRoomGroup = null;
        dragPlane = null;
        dragOffset = null;
        roomDragMoved = false;
        container.style.cursor = canManageRooms ? 'grab' : 'pointer';

        if (moved) {
          try {
            updateRoomRef.current(roomId, {
              position3D: [roomGroup.position.x, roomGroup.position.y, roomGroup.position.z]
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan posisi ruangan.';
            console.error('Gagal menyimpan posisi ruangan 3D:', error);
            window.alert(message);
          }
        }

        setSelectedRoomId(roomId);
        const roomObj = rooms.find(r => r.id === roomId);
        if (roomObj && onSelectRoom) onSelectRoom(roomObj);
        return;
      }
      if (!isDragging) return;
      isDragging = false;

      // Click detection if not dragged much
      const rect = container.getBoundingClientRect();
      const clickMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(clickMouse, camera);
      const meshes = Object.values(roomMeshesRef.current);
      const intersects = raycaster.intersectObjects(meshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const clickedId = hit.userData.roomId;
        setSelectedRoomId(clickedId);
        const roomObj = rooms.find(r => r.id === clickedId);
        if (roomObj && onSelectRoom) {
          onSelectRoom(roomObj);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(7, Math.min(28, spherical.radius + e.deltaY * 0.015));
      updateCameraFromSpherical();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // 8. Animation Loop
    let rotAngle = 0;
    const animate = () => {
      if (performance3D === 'normal' && !isDragging) {
        // subtle idle breathing rotation
        rotAngle += 0.0008;
      }
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
  }, [rooms, selectedRoomId, selectedFloor, performance3D, assets, canManageRooms]);

  return (
    <div className="relative w-full h-[540px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl flex flex-col md:flex-row">
      {/* 3D Canvas Viewport */}
      <div className="relative flex-1 h-full min-h-[340px]" ref={containerRef}>
        {/* Overlay Controls */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-xs font-semibold text-slate-200 flex items-center gap-1.5 shadow-lg">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Digital Twin Gedung BPS Minahasa Utara</span>
          </div>

          {hoveredRoomName && (
            <div className="px-3 py-1.5 rounded-lg bg-blue-600/90 backdrop-blur-md text-white text-xs font-bold animate-pulse shadow-lg flex items-center gap-1.5">
              <span>{hoveredRoomName}</span>
            </div>
          )}
        </div>

        {/* Floor Filter Buttons */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-xl">
          <Layers className="w-3.5 h-3.5 text-slate-400 ml-2" />
          <button
            onClick={() => setSelectedFloor('all')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              selectedFloor === 'all' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Semua Lt
          </button>
          <button
            onClick={() => setSelectedFloor(1)}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              selectedFloor === 1 ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Lantai 1
          </button>
          <button
            onClick={() => setSelectedFloor(2)}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              selectedFloor === 2 ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Lantai 2
          </button>
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-4 z-10 hidden sm:flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-700/60 text-[11px] shadow-lg">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500"></span>
            <span>Baik</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500"></span>
            <span>Rusak Ringan</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500"></span>
            <span>Rusak Berat</span>
          </div>
        </div>

        {/* Quick Nav hint */}
        <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-400 bg-slate-900/60 backdrop-blur-sm px-2.5 py-1 rounded-md">
          Geser untuk memutar • Scroll untuk zoom • Klik ruangan
        </div>
      </div>

      {/* Selected Room Details Panel */}
      <div className="w-full md:w-80 bg-slate-900/95 backdrop-blur-xl border-t md:border-t-0 md:border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto">
        {selectedRoom ? (
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                  {selectedRoom.code} • Lt. {selectedRoom.floor}
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5 leading-snug">{selectedRoom.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedRoom.building}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
              {selectedRoom.description}
            </p>

            <div className="mb-4">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Penanggung Jawab:</span>
              <div className="text-xs font-semibold text-slate-200 mt-0.5">{selectedRoom.picName}</div>
              <div className="text-[11px] text-slate-400 font-mono">NIP: {selectedRoom.picNip}</div>
            </div>

            {/* Asset Metrics */}
            <div className="space-y-2 mb-4">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400">Total Aset BMN</div>
                  <div className="text-xl font-bold text-white">{roomAssets.length} <span className="text-xs font-normal text-slate-400">Unit</span></div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Total Nilai Buku</div>
                  <div className="text-sm font-bold text-emerald-400">
                    Rp {(totalNilai).toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              {/* Breakdown Status */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-emerald-950/30 border border-emerald-900/50 p-2 rounded-lg">
                  <div className="flex items-center justify-center text-emerald-400 mb-0.5">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    <span>Baik</span>
                  </div>
                  <div className="text-base font-bold text-emerald-300">{baikCount}</div>
                </div>

                <div className="bg-amber-950/30 border border-amber-900/50 p-2 rounded-lg">
                  <div className="flex items-center justify-center text-amber-400 mb-0.5">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    <span>R. Ringan</span>
                  </div>
                  <div className="text-base font-bold text-amber-300">{rusakRinganCount}</div>
                </div>

                <div className="bg-rose-950/30 border border-rose-900/50 p-2 rounded-lg">
                  <div className="flex items-center justify-center text-rose-400 mb-0.5">
                    <XCircle className="w-3 h-3 mr-1" />
                    <span>R. Berat</span>
                  </div>
                  <div className="text-base font-bold text-rose-300">{rusakBeratCount}</div>
                </div>
              </div>
            </div>

            {/* Room Asset Sample */}
            <div className="mb-4">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Daftar Aset Teratas</span>
                <span className="text-slate-500 font-normal">Top 3 unit</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {roomAssets.slice(0, 3).map(asset => (
                  <div key={asset.id} className="text-xs p-2 rounded-lg bg-slate-950/50 border border-slate-800/80 flex items-center justify-between">
                    <div className="truncate mr-2">
                      <div className="font-medium text-slate-200 truncate">{asset.namaBarang}</div>
                      <div className="text-[10px] text-slate-400 font-mono">NUP {asset.nup} • {asset.merkType}</div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      asset.kondisi === 'Baik' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      asset.kondisi === 'Rusak Ringan' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {asset.kondisi}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-6">
            <Info className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs">Klik salah satu ruangan pada gedung 3D untuk melihat rincian inventaris BMN.</p>
          </div>
        )}

        {/* Action Button */}
        {selectedRoom && (
          <button
            onClick={() => setActiveView('assets')}
            className="w-full mt-3 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <span>Buka Inventaris Ruangan Ini</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
