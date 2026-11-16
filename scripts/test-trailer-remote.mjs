import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

// Exercise the actual JS embedded in the Android Activity, without contacting YouTube.
const source = readFileSync(new URL('../android/app/src/main/java/de/matthiasennen/moviehub/TrailerPlayerActivity.java', import.meta.url), 'utf8');
const start = source.indexOf('+ "function mhFocus()');
const end = source.indexOf('+ "function mhState(', start);
assert.ok(start >= 0 && end > start);
const script = [...source.slice(start, end).matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0])).join('');

function fixture({ state = 1, time = 40, duration = 100, started = true } = {}) {
  const calls = [];
  const document = { activeElement: null };
  const iframe = { focus() { calls.push(['focus']); document.activeElement = iframe; } };
  const p = {
    getIframe: () => iframe,
    getPlayerState: () => state,
    getCurrentTime: () => time,
    getDuration: () => duration,
    playVideo: () => calls.push(['play']),
    pauseVideo: () => calls.push(['pause']),
    seekTo: (...args) => calls.push(['seek', ...args]),
  };
  const context = createContext({ p, startIssued: started, document });
  runInContext(script, context);
  return { calls, focus: () => context.mhFocus(), remote: command => context.mhRemote(command) };
}

test('focuses the iframe once and preserves focus within it', () => {
  const f = fixture();
  f.focus(); f.focus();
  assert.deepEqual(f.calls, [['focus']]);
});

test('toggle pauses playing or buffering video and resumes paused video', () => {
  for (const state of [1, 3, 2, 5, -1]) {
    const f = fixture({ state });
    f.remote('toggle');
    assert.deepEqual(f.calls, [[state === 1 || state === 3 ? 'pause' : 'play']]);
  }
});

test('direct play and pause are separate commands', () => {
  const f = fixture();
  f.remote('pause'); f.remote('play');
  assert.deepEqual(f.calls, [['pause'], ['play']]);
});

test('seeks ten seconds and clamps to valid media boundaries', () => {
  for (const [time, command, target] of [[40, 'forward', 50], [40, 'rewind', 30], [3, 'rewind', 0], [97, 'forward', 100]]) {
    const f = fixture({ time });
    f.remote(command);
    assert.deepEqual(f.calls, [['seek', target, true]]);
  }
});

test('ignores transport before startup and seeks without valid duration', () => {
  const a = fixture({ started: false });
  a.remote('toggle'); a.remote('forward');
  assert.deepEqual(a.calls, []);
  for (const duration of [0, NaN, Infinity]) {
    const b = fixture({ duration });
    b.remote('forward');
    assert.deepEqual(b.calls, []);
  }
});
