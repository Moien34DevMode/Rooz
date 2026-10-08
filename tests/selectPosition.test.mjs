import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { placeSelectMenu } = await server.ssrLoadModule('/src/components/selectPosition.ts');

const viewport = { width: 800, height: 600 };
const rect = (left, top, width = 100, height = 40) => ({ left, top, right: left + width, bottom: top + height, width });
const place = (overrides = {}) => placeSelectMenu({ trigger: rect(200, 200), viewport, menuHeight: 120, ...overrides });

function inBounds(position, viewport, padding = 12) {
  const left = (viewport.offsetLeft ?? 0) + Math.min(padding, viewport.width / 2);
  const top = (viewport.offsetTop ?? 0) + Math.min(padding, viewport.height / 2);
  const right = (viewport.offsetLeft ?? 0) + viewport.width - Math.min(padding, viewport.width / 2);
  const bottom = (viewport.offsetTop ?? 0) + viewport.height - Math.min(padding, viewport.height / 2);
  assert.ok(position.left >= left);
  assert.ok(position.top >= top);
  assert.ok(position.left + position.width <= right + 1e-9);
  assert.ok(position.top + position.height <= bottom + 1e-9);
  assert.ok(position.height >= 0 && position.height <= position.maxHeight);
}

test('short menus fit below instead of flipping based on an arbitrary threshold', () => {
  const position = place({ trigger: rect(200, 450), menuHeight: 60 });
  assert.equal(position.side, 'below');
  assert.equal(position.top, 496);
  assert.equal(position.height, 60);
  assert.equal(position.maxHeight, 92);
});

test('actual wrapped menu height flips above and anchors its bottom to the trigger', () => {
  const position = place({ trigger: rect(200, 450), menuHeight: 170 });
  assert.equal(position.side, 'above');
  assert.equal(position.top, 274);
  assert.equal(position.height, 170);
  assert.equal(position.top + position.height, 444);
});

test('oversized lists choose the larger side and scroll within the available height', () => {
  const position = place({ trigger: rect(200, 290), menuHeight: 1000 });
  assert.equal(position.side, 'above');
  assert.equal(position.maxHeight, 272);
  assert.equal(position.height, 272);
  assert.equal(position.top, 12);
  inBounds(position, viewport);
});

test('the height cap does not prevent a capped list from fitting below', () => {
  const position = place({ trigger: rect(200, 150), menuHeight: 1000 });
  assert.equal(position.side, 'below');
  assert.equal(position.height, 280);
  assert.equal(position.maxHeight, 280);
  assert.equal(place({ menuHeight: 90 }).height, 90);
});

test('LTR aligns the left edge and RTL aligns the right edge before clamping', () => {
  assert.equal(place().left, 200);
  assert.equal(place({ direction: 'rtl' }).left, 140);
  assert.equal(place({ trigger: rect(200, 200, 240), direction: 'rtl' }).left, 200);
});

test('horizontal edges clamp in either direction without shrinking ordinary triggers', () => {
  assert.equal(place({ trigger: rect(-30, 200), direction: 'rtl' }).left, 12);
  assert.equal(place({ trigger: rect(760, 200), direction: 'ltr' }).left, 628);
  const position = place({ trigger: rect(10, 200, 1200) });
  assert.equal(position.width, 776);
  assert.equal(position.left, 12);
  inBounds(position, viewport);
});

test('narrow mobile viewports clamp the menu width, including its minimum width', () => {
  const viewport = { width: 140, height: 240 };
  const position = place({ viewport, trigger: rect(100, 100, 300), menuHeight: 800 });
  assert.equal(position.width, 116);
  assert.equal(position.left, 12);
  inBounds(position, viewport);
});

test('visual viewport pan offsets apply to alignment, vertical space and clamping', () => {
  const viewport = { width: 320, height: 240, offsetLeft: 100, offsetTop: 250 };
  const position = place({ viewport, trigger: rect(360, 410, 50, 30), menuHeight: 100, direction: 'rtl' });
  assert.equal(position.side, 'above');
  assert.equal(position.left, 248);
  assert.equal(position.top, 304);
  assert.equal(position.height, 100);
  inBounds(position, viewport);
  const below = place({ viewport, trigger: rect(80, 270, 80, 30), menuHeight: 70 });
  assert.equal(below.left, 112);
  assert.equal(below.top, 306);
  assert.equal(below.side, 'below');
  inBounds(below, viewport);
});

test('offscreen triggers and collapsed viewports cannot generate negative sizes or overflow', () => {
  for (const viewport of [{ width: 0, height: 0 }, { width: 10, height: 8 }, { width: 250, height: 120, offsetLeft: 60, offsetTop: 70 }]) {
    for (const trigger of [rect(-500, -500), rect(2000, 2000), rect(100, 80)]) {
      const position = place({ viewport, trigger, menuHeight: 900 });
      inBounds(position, viewport);
    }
  }
});

test('zero-height menus and exact fits preserve below preference', () => {
  assert.equal(place({ menuHeight: 0 }).height, 0);
  const position = place({ trigger: rect(200, 450), menuHeight: 92 });
  assert.equal(position.side, 'below');
  assert.equal(position.top + position.height, 588);
});

test('variable heights, RTL, custom gaps and visual viewport sizes always stay in bounds', () => {
  for (const direction of ['ltr', 'rtl']) {
    for (const width of [30, 160, 390, 1440]) {
      for (const height of [20, 120, 500, 900]) {
        const viewport = { width, height, offsetLeft: 37, offsetTop: 91 };
        for (const menuHeight of [0, 36, 73, 181, 450, 1500]) {
          for (const trigger of [rect(0, 0), rect(50, 120, 230), rect(width, height, 80)]) {
            const position = place({ viewport, trigger, menuHeight, direction, gap: 8, maxHeight: 350 });
            inBounds(position, viewport);
          }
        }
      }
    }
  }
});
