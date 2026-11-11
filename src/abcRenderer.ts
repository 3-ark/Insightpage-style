let _abcjs: any = null;
function getAbcjs(): any {
  if (!_abcjs) {
    const loaded = require('abcjs');
    _abcjs = loaded.default ?? loaded;
  }
  return _abcjs;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgIcon(
  attrs: Record<string, string>,
  children: Array<{ tag: string; attrs: Record<string, string> }>
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  for (const [k, v] of Object.entries(attrs)) {
    svg.setAttribute(k, v);
  }
  for (const child of children) {
    const el = document.createElementNS(SVG_NS, child.tag);
    for (const [k, v] of Object.entries(child.attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

function createPlayIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' },
    [{ tag: 'polygon', attrs: { points: '6 3 20 12 6 21 6 3' } }]
  );
}

function createPauseIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' },
    [
      { tag: 'rect', attrs: { x: '6', y: '4', width: '4', height: '16' } },
      { tag: 'rect', attrs: { x: '14', y: '4', width: '4', height: '16' } },
    ]
  );
}

function createStopIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' },
    [{ tag: 'rect', attrs: { x: '5', y: '5', width: '14', height: '14', rx: '2' } }]
  );
}

function createRestartIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [
      { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' } },
      { tag: 'path', attrs: { d: 'M3 3v5h5' } },
    ]
  );
}

function createDownloadIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [
      { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
      { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
      { tag: 'line', attrs: { x1: '12', x2: '12', y1: '15', y2: '3' } },
    ]
  );
}

function createCopyIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [
      { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
      { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } },
    ]
  );
}

function createCheckIcon(): SVGSVGElement {
  return createSvgIcon(
    { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [{ tag: 'polyline', attrs: { points: '20 6 9 17 4 12' } }]
  );
}

function setButtonIcon(btn: HTMLElement, iconEl: Node): void {
  btn.replaceChildren(iconEl);
}

export function renderAbcBlock(source: string, container: HTMLElement): void {
  const abcjs = getAbcjs();
  const wrapper = createDiv();
  wrapper.className = 'abcjs-wrapper';

  const sheetContainer = createDiv();
  sheetContainer.className = 'abcjs-sheet-container';

  let visualObj: any = null;
  try {
    const renderResult = abcjs.renderAbc(sheetContainer, source.trim(), {
      responsive: 'resize',
      add_classes: true,
    });
    if (renderResult && renderResult.length > 0) {
      visualObj = renderResult[0];
    }
  } catch (err) {
    const errDiv = createDiv();
    errDiv.className = 'chart-error';
    errDiv.textContent = `ABC Render Error: ${err}`;
    container.appendChild(errDiv);
    return;
  }

  wrapper.appendChild(sheetContainer);

  // Audio Context and Synth Controller state
  let synthController: any = null;
  let audioContext: AudioContext | null = null;
  let playbackState: 'idle' | 'loading' | 'playing' | 'paused' = 'idle';
  let totalDuration = 0;
  let animId: number | null = null;
  let highlightedElements: SVGElement[] = [];

  const clearHighlights = () => {
    highlightedElements.forEach((el) => {
      try {
        el.classList.remove('abcjs-highlight');
      } catch {
        // ignore
      }
    });
    highlightedElements = [];
  };

  const stopPlayback = () => {
    if (synthController) {
      try {
        synthController.pause();
        synthController.isStarted = false;
        synthController.restart();
      } catch {
        // ignore
      }
    }
    clearHighlights();
    playbackState = 'idle';
    updateControlsUI();
    if (animId) {
      window.cancelAnimationFrame(animId);
      animId = null;
    }
  };

  const controlsBar = createDiv();
  controlsBar.className = 'abcjs-controls-bar';

  // Left controls group (Play / Stop / Restart)
  const leftBtns = createDiv();
  leftBtns.className = 'abcjs-left-controls';

  // Play / Pause Button
  const playPauseBtn = createEl('button');
  playPauseBtn.className = 'abcjs-btn abcjs-play-btn';
  playPauseBtn.title = 'Play';
  setButtonIcon(playPauseBtn, createPlayIcon());

  // Stop Button
  const stopBtn = createEl('button');
  stopBtn.className = 'abcjs-btn abcjs-stop-btn';
  stopBtn.title = 'Stop';
  setButtonIcon(stopBtn, createStopIcon());
  stopBtn.disabled = true;

  // Restart Button
  const restartBtn = createEl('button');
  restartBtn.className = 'abcjs-btn abcjs-restart-btn';
  restartBtn.title = 'Start from beginning';
  setButtonIcon(restartBtn, createRestartIcon());
  restartBtn.disabled = true;

  leftBtns.appendChild(playPauseBtn);
  leftBtns.appendChild(stopBtn);
  leftBtns.appendChild(restartBtn);

  // Progress container group (Time Label / Progress Slider / Duration Label)
  const progressContainer = createDiv();
  progressContainer.className = 'abcjs-progress-container';

  // Current Time Label
  const currentTimeEl = createSpan();
  currentTimeEl.className = 'abcjs-time-label';
  currentTimeEl.textContent = '0:00';

  // Progress Bar
  const progressSlider = createEl('input');
  progressSlider.type = 'range';
  progressSlider.className = 'abcjs-progress-slider';
  progressSlider.min = '0';
  progressSlider.max = '100';
  progressSlider.step = '0.1';
  progressSlider.value = '0';
  progressSlider.disabled = true;

  // Duration Label
  const durationEl = createSpan();
  durationEl.className = 'abcjs-time-label';
  durationEl.textContent = '0:00';

  progressContainer.appendChild(currentTimeEl);
  progressContainer.appendChild(progressSlider);
  progressContainer.appendChild(durationEl);

  // Right side buttons container
  const rightBtns = createDiv();
  rightBtns.className = 'abcjs-right-controls';

  // MIDI Download Button
  const downloadBtn = createEl('button');
  downloadBtn.className = 'abcjs-btn abcjs-download-btn';
  downloadBtn.title = 'Download MIDI';
  setButtonIcon(downloadBtn, createDownloadIcon());

  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      const midiData = abcjs.synth.getMidiFile(source.trim(), { midiOutputType: 'encoded' });
      if (!midiData) return;
      const dataUrl = Array.isArray(midiData) ? midiData[0] : midiData;
      const a = createEl('a');
      a.href = dataUrl;
      a.download = 'sheet-music.midi';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('MIDI export failed', err);
    }
  });

  // Copy Sheet Music Button
  const copyBtn = createEl('button');
  copyBtn.className = 'abcjs-btn abcjs-copy-btn';
  copyBtn.title = 'Copy ABC source';
  setButtonIcon(copyBtn, createCopyIcon());

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void (async () => {
      try {
        await navigator.clipboard.writeText(source.trim());
        setButtonIcon(copyBtn, createCheckIcon());
        window.setTimeout(() => {
          setButtonIcon(copyBtn, createCopyIcon());
        }, 1500);
      } catch {
        // ignore
      }
    })();
  });

  rightBtns.appendChild(copyBtn);
  rightBtns.appendChild(downloadBtn);

  controlsBar.appendChild(leftBtns);
  controlsBar.appendChild(progressContainer);
  controlsBar.appendChild(rightBtns);

  wrapper.appendChild(controlsBar);
  container.appendChild(wrapper);

  function updateControlsUI() {
    if (playbackState === 'playing') {
      setButtonIcon(playPauseBtn, createPauseIcon());
      playPauseBtn.title = 'Pause';
      stopBtn.disabled = false;
      restartBtn.disabled = false;
      progressSlider.disabled = false;
    } else if (playbackState === 'paused') {
      setButtonIcon(playPauseBtn, createPlayIcon());
      playPauseBtn.title = 'Play';
      stopBtn.disabled = false;
      restartBtn.disabled = false;
      progressSlider.disabled = false;
    } else if (playbackState === 'loading') {
      setButtonIcon(playPauseBtn, createPlayIcon());
      playPauseBtn.title = 'Loading...';
      stopBtn.disabled = true;
      restartBtn.disabled = true;
      progressSlider.disabled = true;
    } else {
      setButtonIcon(playPauseBtn, createPlayIcon());
      playPauseBtn.title = 'Play';
      stopBtn.disabled = true;
      restartBtn.disabled = true;
      progressSlider.disabled = true;
      progressSlider.value = '0';
      currentTimeEl.textContent = '0:00';
    }
  }

  const syncProgress = () => {
    if (synthController && synthController.midiBuffer) {
      totalDuration = synthController.midiBuffer.duration || totalDuration || 0;
      if (totalDuration > 0) {
        progressSlider.max = totalDuration.toString();
        durationEl.textContent = formatTime(totalDuration);
      }
      const pct = synthController.percent || 0;
      const curTime = pct * totalDuration;
      currentTimeEl.textContent = formatTime(curTime);
      progressSlider.value = curTime.toString();
    }
    if (playbackState === 'playing') {
      animId = window.requestAnimationFrame(syncProgress);
    }
  };

  const initSynth = async () => {
    if (synthController) return synthController;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (abcjs.synth.registerAudioContext) {
      abcjs.synth.registerAudioContext(audioContext);
    }

    const sc = new abcjs.synth.SynthController();

    const cursorControl = {
      onStart: () => {
        clearHighlights();
      },
      onEvent: (ev: any) => {
        clearHighlights();
        if (ev && ev.elements) {
          ev.elements.forEach((group: any[]) => {
            if (Array.isArray(group)) {
              group.forEach((el: SVGElement) => {
                if (el && el.classList) {
                  el.classList.add('abcjs-highlight');
                  highlightedElements.push(el);
                }
              });
            }
          });
        }
      },
      onFinished: () => {
        clearHighlights();
        playbackState = 'idle';
        updateControlsUI();
        if (animId) window.cancelAnimationFrame(animId);
      },
    };

    sc.cursorControl = cursorControl;

    await sc.setTune(visualObj, false, {});

    synthController = sc;
    totalDuration = sc.midiBuffer?.duration || 0;
    if (totalDuration > 0) {
      durationEl.textContent = formatTime(totalDuration);
      progressSlider.max = totalDuration.toString();
    }
    return sc;
  };

  playPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!visualObj) return;

    if (playbackState === 'playing') {
      if (synthController) {
        synthController.pause();
        synthController.isStarted = false;
      }
      playbackState = 'paused';
      updateControlsUI();
      if (animId) window.cancelAnimationFrame(animId);
      return;
    }

    if (playbackState === 'paused' && synthController) {
      playbackState = 'playing';
      updateControlsUI();
      synthController.play();
      animId = window.requestAnimationFrame(syncProgress);
      return;
    }

    // Idle: Initialize and play
    playbackState = 'loading';
    updateControlsUI();
    void (async () => {
      try {
        const sc = await initSynth();
        if (!sc) {
          playbackState = 'idle';
          updateControlsUI();
          return;
        }
        playbackState = 'playing';
        updateControlsUI();
        await sc.play();
        totalDuration = sc.midiBuffer?.duration || totalDuration;
        durationEl.textContent = formatTime(totalDuration);
        progressSlider.max = totalDuration.toString();
        animId = window.requestAnimationFrame(syncProgress);
      } catch (err) {
        console.error('AbcJS playback error:', err);
        stopPlayback();
      }
    })();
  });

  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopPlayback();
  });

  restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearHighlights();
    if (synthController) {
      synthController.seek(0);
      currentTimeEl.textContent = '0:00';
      progressSlider.value = '0';
      if (playbackState !== 'playing') {
        playbackState = 'playing';
        updateControlsUI();
        synthController.play();
        animId = window.requestAnimationFrame(syncProgress);
      }
    }
  });

  progressSlider.addEventListener('input', () => {
    const val = parseFloat(progressSlider.value);
    currentTimeEl.textContent = formatTime(val);
    if (synthController && totalDuration > 0) {
      clearHighlights();
      synthController.seek(val / totalDuration);
    }
  });
}
