import { describe, expect, it } from 'vitest';
import { computeResizeWidth } from './useResizable';

describe('useResizable — computeResizeWidth in LTR and RTL', () => {
  describe('LTR mode (isRtl: false)', () => {
    it('increases left-anchored width when dragged to the right (positive delta)', () => {
      const width = computeResizeWidth({
        edge: 'left',
        isRtl: false,
        startWidth: 200,
        startX: 100,
        currentX: 150,
      });
      expect(width).toBe(250);
    });

    it('decreases left-anchored width when dragged to the left (negative delta)', () => {
      const width = computeResizeWidth({
        edge: 'left',
        isRtl: false,
        startWidth: 200,
        startX: 100,
        currentX: 80,
      });
      expect(width).toBe(180);
    });

    it('decreases right-anchored width when dragged to the right', () => {
      const width = computeResizeWidth({
        edge: 'right',
        isRtl: false,
        startWidth: 300,
        startX: 500,
        currentX: 550,
      });
      // right edge: startWidth - delta = 300 - 50 = 250
      expect(width).toBe(250);
    });

    it('increases right-anchored width when dragged to the left', () => {
      const width = computeResizeWidth({
        edge: 'right',
        isRtl: false,
        startWidth: 300,
        startX: 500,
        currentX: 450,
      });
      // right edge: startWidth - (-50) = 350
      expect(width).toBe(350);
    });
  });

  describe('RTL mode (isRtl: true)', () => {
    it('inverts delta for left-anchored edge: moving right decreases width', () => {
      // In mirrored RTL, dragging rightwards towards the center/edge inverts delta
      const width = computeResizeWidth({
        edge: 'left',
        isRtl: true,
        startWidth: 200,
        startX: 100,
        currentX: 150,
      });
      // rawDelta = 50, inverted delta = -50 -> startWidth + delta = 200 - 50 = 150
      expect(width).toBe(150);
    });

    it('inverts delta for left-anchored edge: moving left increases width', () => {
      const width = computeResizeWidth({
        edge: 'left',
        isRtl: true,
        startWidth: 200,
        startX: 100,
        currentX: 60,
      });
      // rawDelta = -40, inverted delta = +40 -> startWidth + delta = 200 + 40 = 240
      expect(width).toBe(240);
    });

    it('inverts delta for right-anchored edge: moving left decreases width', () => {
      const width = computeResizeWidth({
        edge: 'right',
        isRtl: true,
        startWidth: 300,
        startX: 500,
        currentX: 450,
      });
      // rawDelta = -50, inverted delta = +50 -> startWidth - delta = 300 - 50 = 250
      expect(width).toBe(250);
    });

    it('inverts delta for right-anchored edge: moving right increases width', () => {
      const width = computeResizeWidth({
        edge: 'right',
        isRtl: true,
        startWidth: 300,
        startX: 500,
        currentX: 550,
      });
      // rawDelta = +50, inverted delta = -50 -> startWidth - delta = 300 - (-50) = 350
      expect(width).toBe(350);
    });
  });
});
