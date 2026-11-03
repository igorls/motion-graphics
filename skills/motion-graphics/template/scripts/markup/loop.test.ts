// bun test scripts/markup: looping the in→out range (the page's markup/loop.js).
import { test, expect, describe } from 'bun:test';
import { loopRange, startFrame, frameAt, wrapTime, playAt } from './loop.js';

const fps = 30, frames = 300;

describe('loopRange', () => {
  test('needs both marks and looping on, and puts them in order', () => {
    expect(loopRange(10, 20)).toEqual([10, 20]);
    expect(loopRange(20, 10)).toEqual([10, 20]);
    expect(loopRange(12, 12)).toEqual([12, 12]);
    expect(loopRange(10, null)).toBeNull();
    expect(loopRange(null, 20)).toBeNull();
    expect(loopRange(10, 20, false)).toBeNull();
  });
});

describe('startFrame', () => {
  test('inside the range Play carries on, outside it starts at in', () => {
    expect(startFrame(15, [10, 20], frames)).toBe(15);
    expect(startFrame(10, [10, 20], frames)).toBe(10);
    expect(startFrame(20, [10, 20], frames)).toBe(20);
    expect(startFrame(9, [10, 20], frames)).toBe(10);
    expect(startFrame(21, [10, 20], frames)).toBe(10);
  });
  test('without a range, from the playhead, or from the top at the end', () => {
    expect(startFrame(42, null, frames)).toBe(42);
    expect(startFrame(299, null, frames)).toBe(0);
  });
});

describe('wrapTime', () => {
  const loop = [30, 44]; // 1.0 s to 1.5 s: frames 30..44, 15 frames
  test('inside the range nothing moves, and the frame is the one holding t', () => {
    expect(wrapTime(1.2, loop, fps)).toEqual({ t: 1.2, frame: 36, wraps: 0 });
    expect(wrapTime(1.0, loop, fps).frame).toBe(30);
    expect(wrapTime(1.4999, loop, fps).frame).toBe(44);
  });
  test('at the end of the out frame it is back at the start of in', () => {
    const w = wrapTime(1.5, loop, fps);
    expect(w.wraps).toBe(1); expect(w.t).toBeCloseTo(1.0, 9); expect(w.frame).toBe(30);
  });
  test('the overshoot is kept, so the audio and the picture stay in step', () => {
    const w = wrapTime(1.5 + 0.017, loop, fps); // one 60 Hz tick late
    expect(w.wraps).toBe(1); expect(w.t).toBeCloseTo(1.017, 9); expect(w.frame).toBe(30);
  });
  test('several lengths past the end land in phase (a stalled tab, a long tick)', () => {
    const w = wrapTime(1.0 + 3 * 0.5 + 0.2, loop, fps);
    expect(w.wraps).toBe(3); expect(w.t).toBeCloseTo(1.2, 9); expect(w.frame).toBe(36);
  });
  test('a time before the range is left alone (playback runs into it)', () => {
    expect(wrapTime(0.5, loop, fps)).toEqual({ t: 0.5, frame: 15, wraps: 0 });
  });
  test('a one-frame range repeats that frame', () => {
    const w = wrapTime(1.0 + 1 / 30 + 0.001, [30, 30], fps);
    expect(w.wraps).toBe(1); expect(w.frame).toBe(30); expect(w.t).toBeCloseTo(1.001, 9);
  });
  test('the folded time never reaches the end, so the frame never passes out', () => {
    for (let i = 0; i < 2000; i++) {
      const t = 1.0 + i * 0.0137, w = wrapTime(t, loop, fps);
      expect(w.t).toBeGreaterThanOrEqual(1.0); expect(w.t).toBeLessThan(1.5);
      expect(w.frame).toBeGreaterThanOrEqual(30); expect(w.frame).toBeLessThanOrEqual(44);
    }
  });
});

describe('playAt', () => {
  test('wall time runs at the playback rate', () => {
    expect(playAt({ from: 1.0, elapsed: 0.4, rate: 0.25, fps, frames }).t).toBeCloseTo(1.1, 9);
    expect(playAt({ from: 1.0, elapsed: 0.4, rate: 0.25, fps, frames }).frame).toBe(33);
    expect(playAt({ from: 1.0, elapsed: 0.4, rate: 1, fps, frames }).frame).toBe(42);
  });
  test('looping a word at quarter speed: 2 s of wall time is 0.5 s of the piece, one pass of a 0.5 s range', () => {
    const p = playAt({ from: 1.0, elapsed: 2.0, rate: 0.25, fps, frames, loop: [30, 44] });
    expect(p.wraps).toBe(1); expect(p.t).toBeCloseTo(1.0, 9); expect(p.frame).toBe(30); expect(p.ended).toBe(false);
    const q = playAt({ from: 1.0, elapsed: 2.1, rate: 0.25, fps, frames, loop: [30, 44] });
    expect(q.t).toBeCloseTo(1.025, 9); expect(q.frame).toBe(30);
  });
  test('without a range it stops on the last frame', () => {
    expect(playAt({ from: 9.9, elapsed: 0.1, fps, frames })).toEqual({ t: 299 / 30, frame: 299, wraps: 0, ended: true });
    expect(playAt({ from: 9.0, elapsed: 0.1, fps, frames }).ended).toBe(false);
  });
  test('a range that ends on the last frame loops instead of stopping', () => {
    const p = playAt({ from: 9.5, elapsed: 0.6, fps, frames, loop: [285, 299] });
    expect(p.ended).toBe(false); expect(p.frame).toBe(288); expect(p.t).toBeCloseTo(9.6, 9);
  });
  test('frameAt holds a frame for its whole interval', () => {
    expect(frameAt(1.0, fps)).toBe(30);
    expect(frameAt(1.0 + 1 / 30 - 1e-4, fps)).toBe(30);
    expect(frameAt(31 / 30, fps)).toBe(31); // exact boundaries, despite float rounding
  });
});
