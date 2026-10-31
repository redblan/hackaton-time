import { expect, it } from 'vitest';
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { uploadStaticBoxes, type StaticBox } from '../src/world/staticBoxes';

it('uploads world transforms and colors, then updates same-count flags and bounds correctly',()=>{
  const mesh=new InstancedMesh(new BoxGeometry(),new MeshStandardMaterial(),2);
  const box:StaticBox={kind:'box',id:'a',pos:[15,24,6],size:[2,.3,1.4],rotY:Math.PI/2,color:'#ff0000'};
  uploadStaticBoxes(mesh,[box]);
  const matrix=new Matrix4();mesh.getMatrixAt(0,matrix);
  const position=new Vector3().setFromMatrixPosition(matrix);
  expect(position.toArray()).toEqual(box.pos);
  const color=new Color();mesh.getColorAt(0,color);expect(color.getHexString()).toBe('ff0000');
  expect(mesh.boundingBox!.max.x).toBeCloseTo(15.7);
  expect(mesh.boundingBox!.max.y).toBeCloseTo(24.15);
  const version=mesh.instanceMatrix.version;
  // No per-frame writer exists: scene/camera world updates do not re-upload buffers.
  for(let i=0;i<60;i++) mesh.updateMatrixWorld();
  expect(mesh.instanceMatrix.version).toBe(version);
  uploadStaticBoxes(mesh,[{...box,id:'b',pos:[100,0,0],color:'#00ff00'}]);
  expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
  expect(mesh.boundingSphere!.containsPoint(new Vector3(100,0,0))).toBe(true);
  expect(mesh.boundingSphere!.containsPoint(position)).toBe(false);
  uploadStaticBoxes(mesh,[]);expect(mesh.count).toBe(0);expect(mesh.boundingBox!.isEmpty()).toBe(true);
  mesh.geometry.dispose();(mesh.material as MeshStandardMaterial).dispose();mesh.dispose();
});
