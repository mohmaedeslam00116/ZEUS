import { describe, expect, it } from 'vitest';
import { ACTIVITY_TAB_IDS } from '@shared/constants';
import { ACTIVITY_TABS, TOP_TABS, RAIL_TABS } from './tabs';

describe('activity tabs consistency', () => {
  it('ACTIVITY_TABS and ACTIVITY_TAB_IDS match in length and elements', () => {
    const tabIds = ACTIVITY_TABS.map((t) => t.id);
    expect(tabIds).toEqual([...ACTIVITY_TAB_IDS]);
    expect(tabIds).not.toContain('terminal');
  });

  it('partitions into top bar tabs and rail tabs without overlap or loss', () => {
    expect(TOP_TABS.length + RAIL_TABS.length).toBe(ACTIVITY_TABS.length);
  });
});
