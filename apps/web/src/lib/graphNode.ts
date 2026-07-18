import { Group, Sprite, SpriteMaterial, CanvasTexture } from 'three';
import SpriteText from 'three-spritetext';

/** Fallback node border colour when a node has no explicit colour. */
export const DEFAULT_NODE_COLOR = '#e8a838';

export const LABEL_HEIGHT = 2.5;
export const ROOT_LABEL_HEIGHT = 4.5;

/** The circle sprite depends only on the border colour, but `nodeThreeObject`
 *  is re-invoked for every node on each force-graph `refresh()`. Painting a
 *  128×128 canvas and uploading a GPU texture per node made a recolor of a
 *  large graph rasterize hundreds of canvases. The palette has only a handful
 *  of colours, so cache the texture (and its material) by colour — one paint
 *  per distinct colour for the app's lifetime. */
const circleMaterialCache = new Map<string, SpriteMaterial>();

function circleMaterial(borderColor: string): SpriteMaterial {
  const cached = circleMaterialCache.get(borderColor);
  if (cached) return cached;

  const hex = borderColor.replace('#', '');
  const rb = parseInt(hex.substring(0, 2), 16);
  const gb = parseInt(hex.substring(2, 4), 16);
  const bb = parseInt(hex.substring(4, 6), 16);
  const fillColor = `rgb(${Math.round(rb + (255 - rb) * 0.82)}, ${Math.round(gb + (255 - gb) * 0.82)}, ${Math.round(bb + (255 - bb) * 0.82)})`;

  const res = 128;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const c = res / 2;
  const r = res / 2 - 6;

  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  // Sharing one material across every sprite of a colour is safe: per-node
  // state (scale) lives on the Sprite, not the material.
  const material = new SpriteMaterial({
    map: new CanvasTexture(canvas),
    transparent: true,
    depthTest: false,
  });
  circleMaterialCache.set(borderColor, material);
  return material;
}

export interface GraphNodeView {
  id: string;
  name: string;
  isRoot: boolean;
  hasTitle: boolean;
}

/** Build a node's three.js object: a cached circle sprite plus, when the node
 *  has a title, a text label. */
export function makeNodeObject(node: GraphNodeView, borderColor: string): Group {
  const group = new Group();
  group.renderOrder = 10;

  const circle = new Sprite(circleMaterial(borderColor));
  const scale = node.isRoot ? 14 : 9;
  circle.scale.set(scale, scale, 1);
  circle.renderOrder = 1;
  group.add(circle);

  if (node.hasTitle) {
    const label = new SpriteText(node.name);
    label.color = '#111111';
    label.fontFace = 'Syne, sans-serif';
    label.textHeight = node.isRoot ? ROOT_LABEL_HEIGHT : LABEL_HEIGHT;
    label.material.depthTest = false;
    label.renderOrder = 2;
    group.add(label);
  }

  return group;
}
