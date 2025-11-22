import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Classes
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

  constructor({ width, height, depth, speed, rigidBody, world }) {
    super(width, height, depth);
    this.world = world;
    this.#movementSpeed = speed;
    this.body = rigidBody;
  }

  move(x, z) {
    const impulse = {
      x: x * this.#movementSpeed,
      y: 0,
      z: z * this.#movementSpeed,
    };

    this.body.setLinearDamping(2.0);
    this.body.applyImpulse(impulse, true);
  }

  jump() {
    // Jump is using raycasts
    const translation = this.body.translation();
    const origin = { x: translation.x, y: translation.y, z: translation.z };

    const direction = { x: 0, y: -1, z: 0 };
    const ray = new RAPIER.Ray(origin, direction);

    const maxToi = 1.1;
    const solid = true;

    const hit = this.world.castRay(
      ray,
      maxToi,
      solid,
      0xffffffff, // Default groups (hit everything)
      null,
      null,
      this.body, // ray ignores player body
    );

    if (hit) {
      this.body.setLinearDamping(0.1);
      this.body.applyImpulse({ x: 0, y: 35, z: 0 }, true);
    }
  }
}

class Command {
  execute(actor) {
    return actor;
  }
}

class JumpCommand extends Command {
  execute(actor) {
    actor.jump();
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

class InputHandler {
  constructor() {
    this.keys = new Set(); // Stores 'w', 'a', 's', 'd'

    //These event listeners are always listening once InputHandler object is created in runGame()
    //Whenever a key is pressed, add it to this.keys
    globalThis.addEventListener("keydown", (e) => this.keys.add(e.code));
    globalThis.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  isPressed(key, check) {
    return (key == check) ? true : false;
  }

  //Below is ran every frame in animate(). If this.keys has a keycode when Input() is ran, performs a command
  Input() {
    let x = 0;
    let z = 0;

    if (this.keys.has("KeyW")) {
      z -= 1;
    }
    if (this.keys.has("KeyA")) {
      x -= 1;
    }
    if (this.keys.has("KeyS")) {
      z += 1;
    }
    if (this.keys.has("KeyD")) {
      x += 1;
    }
    if (this.keys.has("Space")) {
      return new JumpCommand();
    }

    if (x !== 0 || z !== 0) {
      return new MoveCommand(x, z);
    }

    return null;
  }
}

// Event caller function
function notify(name) {
  observer.dispatchEvent(new Event(name));
}

async function runGame() {
  // Must wait for rapier physics engine first
  await RAPIER.init();

  console.log("Rapier is ready. Starting game...");

  const observer = new EventTarget();

  const inputHandler = new InputHandler();

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

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

  // Temp camera
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Adds momentum/smoothness to the movement
  controls.dampingFactor = 0.05; // How quickly it slows down
  controls.minDistance = 5; // Don't let user zoom inside the ball
  controls.maxDistance = 50; // Don't let user zoom too far away

  // Player rigid body and physics
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0.0, 5.0, 0.0)
    .setLinearDamping(2.0); // Start 5 units up
  const rigidBody = world.createRigidBody(rigidBodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(1.0); // Radius 1.0
  world.createCollider(colliderDesc, rigidBody);

  const player = new Player({
    width: 1,
    height: 32,
    depth: 16,
    speed: 1,
    rigidBody: rigidBody,
    world: world,
  });
  player.castShadow = true;
  scene.add(player);

  // Create the ground mesh and add rigidbody collider
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(50, 0.5, 40),
    new THREE.MeshStandardMaterial({ color: 0xF54927 }),
  );
  ground.receiveShadow = true;
  ground.position.y = -3;
  scene.add(ground);

  const box = new THREE.Box3().setFromObject(ground);
  const size = new THREE.Vector3();
  box.getSize(size);

  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(ground.position.x, ground.position.y, ground.position.z);
  const groundBody = world.createRigidBody(groundBodyDesc);

  const groundCollider = RAPIER.ColliderDesc.cuboid(
    size.x / 2,
    size.y / 2,
    size.z / 2,
  );
  world.createCollider(groundCollider, groundBody);

  // Simple lighting
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.z = 1;
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  camera.position.z = 10;

  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Physics step

    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();

    player.position.set(position.x, position.y, position.z);
    player.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // Player Input
    const command = inputHandler.Input();
    if (command) {
      command.execute(player);
    }

    renderer.render(scene, camera);
  }

  animate();
}

runGame();
