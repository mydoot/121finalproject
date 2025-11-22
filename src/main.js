import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


class Sphere extends THREE.Mesh {
  constructor({ width, height, depth }) {
    super(
      new THREE.SphereGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: 0xffff00 }),
    );
    this.height = 3;
  }
}

class Player extends Sphere {
  #movementSpeed;

  constructor({ width, height, depth }, speed) {
    super(width, height, depth)
    this.#movementSpeed = speed;
  }

  move(x, z) {
    // 1. Calculate force based on speed
    // We invoke the physics engine here
    const impulse = { x: x * this.#movementSpeed, y: 0, z: z * this.#movementSpeed };

    // 2. Apply impulse (force) to the center of the body
    // true = wake up the body if it's sleeping
    this.body.applyImpulse(impulse, true);
  }

  jump() {
    // Only jump if we are close to the ground (simplified check)
    if (Math.abs(this.body.linvel().y) < 0.1) {
      this.body.applyImpulse({ x: 0, y: 10, z: 0 }, true);
    }
  }
}

class Command {
  execute(actor) {
    return actor;
  }
}

class InputHandler {

  constructor() {
    this.keys = new Set(); // Stores 'w', 'a', 's', 'd'

    // 1. Setup Event Listeners
    // We bind(this) to ensure 'this' refers to the class, not the event
    globalThis.addEventListener('keydown', (e) => this.keys.add(e.code));
    globalThis.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  isPressed(key, check) {
    return (key == check) ? true : false;
  }

  Input(key) {
    if (this.isPressed('KeyW', key)) {
      console.log(`key ${key} pressed`);
    }
    else if (this.isPressed('KeyA', key)) {
      console.log(`key ${key} pressed`);
    }
    else if (this.isPressed('KeyS', key)) {
      console.log(`key ${key} pressed`);
    }
    else if (this.isPressed('KeyD', key)) {
      console.log(`key ${key} pressed`);
    }
    else if (this.isPressed('Space', key)) {
      console.log(`key ${key} pressed`);
    }
  }

}

class MoveCommand extends Command {
  constructor(x, z) {
    super();
    this.x = x;
    this.z = z;
  }

  execute(actor) {
    actor.move(this.x, this.z);
  }
}

class JumpCommand extends Command {
  execute(actor) {
    actor.jump();
  }
}


function notify(name) {
  observer.dispatchEvent(new Event(name));
}

async function runGame() {

  await RAPIER.init();


  console.log("Rapier is ready. Starting game...");

  const observer = new EventTarget();

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  const inputHandler = new InputHandler;

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


  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Adds momentum/smoothness to the movement
  controls.dampingFactor = 0.05; // How quickly it slows down
  controls.minDistance = 5;      // Don't let user zoom inside the ball
  controls.maxDistance = 50;     // Don't let user zoom too far away


  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0.0, 5.0, 0.0); // Start 5 units up
  const rigidBody = world.createRigidBody(rigidBodyDesc);

  // Create a collider (shape) for the physics body
  const colliderDesc = RAPIER.ColliderDesc.ball(1.0); // Radius 1.0
  world.createCollider(colliderDesc, rigidBody);

  /*  const geometry = new THREE.SphereGeometry(1, 32, 16);
   const material = new THREE.MeshStandardMaterial({ color: 0xffff00 }); */
  const player = new Player({
    width: 1,
    height: 32,
    depth: 16,
  });
  /* const sphere = new Box({
    width: 1,
    height: 32,
    depth: 16,
  }); */
  player.castShadow = true;
  scene.add(player);

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


  globalThis.addEventListener("keydown", (event) => {
    inputHandler.Input(event.code);
  })

  // 4. Start your loop ONLY after everything is ready
  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Physics step

    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();

    player.position.set(position.x, position.y, position.z);
    player.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    renderer.render(scene, camera);
  }

  animate();
}

// 5. Execute the function
runGame();
