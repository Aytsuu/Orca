// src/components/islands/features/PlanView.test.tsx
import { describe, it, expect } from 'vitest';
import { formatBytes } from '../../../stores/projectStore';
import { PlanView } from './PlanView';

describe('PlanView component and utilities', () => {
  describe('formatBytes helper', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('formats kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1048576 * 2.5)).toBe('2.5 MB');
    });

    it('formats gigabytes correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('PlanView component export', () => {
    it('exports PlanView React component correctly', () => {
      expect(PlanView).toBeDefined();
      expect(typeof PlanView).toBe('function');
    });
  });
});
