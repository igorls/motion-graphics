// Scene API. A scene owns a window of the timeline and renders linear HDR colour into the
// target it is given. Its output must be a pure function of time: the exporter renders
// sub-frames out of order for motion blur, and the preview seeks anywhere.
import type * as THREE from 'three';
import type { Audio, AudioSample } from './audio';
import type { Compositor } from './gl';
import type { PostParams } from './post';
import type { Rect } from './format';

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  audio: Audio;
  comp: Compositor;
  /** Logical frame size and the area where text/logos/faces may go. */
  W: number;
  H: number;
  SAFE: Rect;
  /** Timeline entry id, its free-form params (one module can serve several entries) and its window. */
  id: string;
  params: Record<string, any>;
  start: number;
  end: number;
}

export interface Frame {
  /** Piece time (s). */
  t: number;
  /** Time since this scene started, and 0..1 progress through its window. */
  lt: number;
  p: number;
  start: number;
  end: number;
  /** Continuous beat and bar indices, and their fractional phases. */
  beat: number;
  bar: number;
  beatPhase: number;
  barPhase: number;
  /** Music features at t (envelopes 0..1, decaying hit pulses). */
  a: AudioSample;
  /** While this scene overlaps the previous one: that scene's frame, and 0..1 progress through the overlap. */
  under: THREE.Texture | null;
  tin: number;
  /** 0..1 progress through the overlap with the next scene (0 when not overlapping). */
  tout: number;
}

export type PostOverrides = Partial<PostParams>;

export abstract class Scene {
  /** If true, this scene composites f.under itself during its incoming overlap (custom transition). */
  handlesTransition = false;
  constructor(protected ctx: SceneCtx) {}
  /** Load images, build geometry, precompute text layout. Called once before the first render. */
  init(): Promise<void> | void {}
  /** Render into `out` (linear HDR). Must fully overwrite it. May return post overrides. */
  abstract render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides | void;
  dispose(): void {}
}

export type SceneClass = new (ctx: SceneCtx) => Scene;
