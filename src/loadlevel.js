import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let interactableObjects = [];

// Function to load a GLB Level
export async function loadLevel(scene, world, url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const levelMesh = gltf.scene;

  // 1. Add Visuals to Scene
  scene.add(levelMesh);

  // 2. FORCE Three.js to calculate the final positions/scales of everything right now
  levelMesh.updateMatrixWorld(true);

  // 1. Find the object by the exact name you used in Blender
  const jumpPad = levelMesh.getObjectByName("JumpPad");
  const goal = levelMesh.getObjectByName("Goal");

  if (jumpPad) {
    // 1. Create Body & Collider
    const targetPos = new THREE.Vector3();
    jumpPad.getWorldPosition(targetPos);

    const padBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z);
    const padBody = world.createRigidBody(padBodyDesc);

    const padColliderDesc = RAPIER.ColliderDesc.cylinder(0.5, 2)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const padCollider = world.createCollider(padColliderDesc, padBody);

    padCollider.interactionType = "jumppad";
  } else {
    console.log("doesn't exist!");
  }

  if (goal) {
    // 1. Create Body & Collider
    const targetPos = new THREE.Vector3();
    goal.getWorldPosition(targetPos);

    const goalBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z);
    const goalBody = world.createRigidBody(goalBodyDesc);

    const goalCollsiderDesc = RAPIER.ColliderDesc.cylinder(0.5, 2)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const goalCollider = world.createCollider(goalCollsiderDesc, goalBody);

    goalCollider.interactionType = "goal";
  } else {
    console.log("doesn't exist!");
  }

  // Find all doors in the level // second commit - door detection
  const doors = [];
  const lockedDoors = []; // fifth commit - locked doors
  levelMesh.traverse((obj) => {
    if (obj.name && obj.name.startsWith("Door_")) {
      doors.push(obj);
    }
    if (obj.name && obj.name.startsWith("LockedDoor_")) { // fifth commit - locked doors
      lockedDoors.push(obj);
    }
  });

  // Create door colliders
  doors.forEach((door) => {
    const targetPos = new THREE.Vector3();
    door.getWorldPosition(targetPos);

    const doorBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z);
    const doorBody = world.createRigidBody(doorBodyDesc);

    const doorColliderDesc = RAPIER.ColliderDesc.cuboid(2, 3, 0.5)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const doorCollider = world.createCollider(doorColliderDesc, doorBody);

    // Extract destination from door name (e.g., "Door_room2" -> "room2")
    const destination = door.name.split("_")[1] || "room2";
    doorCollider.interactionType = "door";
    doorCollider.destination = destination;
  }); // second commit - door detection

  // Create locked door colliders // fifth commit - locked door setup
  lockedDoors.forEach((door) => {
    const targetPos = new THREE.Vector3();
    door.getWorldPosition(targetPos);

    const targetRot = new THREE.Quaternion();
    door.getWorldQuaternion(targetRot);

    const targetScale = new THREE.Vector3();
    door.getWorldScale(targetScale);

    const doorBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z)
      .setRotation({
        x: targetRot.x,
        y: targetRot.y,
        z: targetRot.z,
        w: targetRot.w,
      });
    const doorBody = world.createRigidBody(doorBodyDesc);

    // Use the door's actual scale for the collider
    const doorColliderDesc = RAPIER.ColliderDesc.cuboid(
      targetScale.x,
      targetScale.y,
      targetScale.z,
    ).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    // Solid door - blocks player until unlocked

    const doorCollider = world.createCollider(doorColliderDesc, doorBody);

    // Extract required item and destination from door name
    // Format: "LockedDoor_key_room2" -> requires "key", leads to "room2"
    const parts = door.name.split("_");
    const requiredItem = parts[1] || "key";
    const destination = parts[2] || "room2";

    doorCollider.interactionType = "lockeddoor";
    doorCollider.requiredItem = requiredItem;
    doorCollider.destination = destination;
  }); // fifth commit - locked door setup

  // Find all interactable items // third commit - find interactable objects
  interactableObjects = [];
  levelMesh.traverse((obj) => {
    if (obj.name && obj.name.startsWith("Item_")) {
      obj.userData.itemType = obj.name.split("_")[1] || "unknown";
      obj.userData.interactable = true;
      interactableObjects.push(obj);
    }
  }); // third commit - find interactable objects

  levelMesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.name === "JumpPad") return;

      if (child.name === "Goal") return;

      if (child.name && child.name.startsWith("Door")) return; // second commit - skip doors in physics

      if (child.name && child.name.startsWith("LockedDoor")) return; // fifth commit - skip locked doors in physics

      // --- PHYSICS GENERATION (FIXED) ---

      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
      const rigidBody = world.createRigidBody(rigidBodyDesc);

      const clonedGeometry = child.geometry.clone();

      clonedGeometry.applyMatrix4(child.matrixWorld);

      const vertices = clonedGeometry.attributes.position.array;

      let indices;
      if (clonedGeometry.index) {
        indices = clonedGeometry.index.array;
      } else {
        const vertexCount = clonedGeometry.attributes.position.count;
        indices = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) indices[i] = i;
      }

      // F. Create the Collider
      const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      world.createCollider(colliderDesc, rigidBody);
    }
  });
}