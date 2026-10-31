import { Color, InstancedMesh, Object3D } from 'three';
import type { WorldObject } from '@game/shared';

export type StaticBox = Extract<WorldObject, {kind:'box'}>;

/** Upload only when the visible set changes, never from useFrame. */
export function uploadStaticBoxes(mesh: InstancedMesh, boxes: readonly StaticBox[]) {
  const transform = new Object3D(), color = new Color();
  mesh.count = boxes.length;
  for (let i=0; i<boxes.length; i++) {
    const box=boxes[i];
    transform.position.set(...box.pos);
    transform.rotation.set(0,box.rotY??0,0);
    transform.scale.set(...box.size);
    transform.updateMatrix();
    mesh.setMatrixAt(i,transform.matrix);
    mesh.setColorAt(i,color.set(box.color));
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  // Recompute on flag changes too: the last visible object may be far away.
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}
