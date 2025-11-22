import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

/* class Command {
  execute() {
  }
}

class InputHandler {
} */

// 1. Define the async starter
async function runGame() {
  // --- CRITICAL STEP ---
  // You must wait for this promise to resolve before doing ANYTHING else.
  await RAPIER.init();
  //await THREE.init();
  // ---------------------

  console.log("Rapier is ready. Starting game...");

  // 2. NOW it is safe to create the world
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  // 3. Setup Three.js Scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    globalThis.innerWidth / globalThis.innerHeight,
    0.1,
    1000,
  );
  const renderer = new THREE.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
  document.body.appendChild(renderer.domElement);

  // 3. Create the Physics Body (The "Soul")
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0.0, 5.0, 0.0); // Start 5 units up
  const rigidBody = world.createRigidBody(rigidBodyDesc);

  // Create a collider (shape) for the physics body
  const colliderDesc = RAPIER.ColliderDesc.ball(1.0); // Radius 1.0
  world.createCollider(colliderDesc, rigidBody);

  class Box extends THREE.Mesh {
    constructor({ width, height, depth }) {
      super(
        new THREE.SphereGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: 0xffff00 }),
      );
      this.height = 3;
    }
  }

  /*  const geometry = new THREE.SphereGeometry(1, 32, 16);
   const material = new THREE.MeshStandardMaterial({ color: 0xffff00 }); */
  const sphere = new Box({
    width: 1,
    height: 32,
    depth: 16,
  });
  sphere.castShadow = true;
  scene.add(sphere);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 15),
    new THREE.MeshStandardMaterial({ color: 0xF54927 }),
  );
  ground.receiveShadow = true;
  ground.position.y = -3;
  scene.add(ground);

  // 1. Create a FIXED body (Mass = 0, it won't move)
  // We set the position to (0, 3, 0) to match the visual mesh
  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, ground.position.y, 0);

  const groundBody = world.createRigidBody(groundBodyDesc);

  // 2. Create the Collider shape
  // IMPORTANT: Rapier takes "Half-Extents" (Half the size)
  // Three.js Box: 5 (width), 0.5 (height), 15 (depth)
  // Rapier Box:   2.5,       0.25,          7.5
  const groundCollider = RAPIER.ColliderDesc.cuboid(2.5, 0.25, 7.5)
    .setRestitution(0.7); // Add 70% bounciness
  world.createCollider(groundCollider, groundBody);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.z = 1;
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  camera.position.z = 10;

  // 4. Start your loop ONLY after everything is ready
  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Physics step

    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();

    sphere.position.set(position.x, position.y, position.z);
    sphere.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    renderer.render(scene, camera);
  }

  animate();
}

// 5. Execute the function
runGame();
