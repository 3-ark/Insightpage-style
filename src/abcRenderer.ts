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

const PLAY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const PAUSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const STOP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
const RESTART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
const DOWNLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export function renderAbcBlock(source: string, container: HTMLElement): void {
  const abcjs = getAbcjs();
  const wrapper = document.createElement('div');
  wrapper.className = 'abcjs-wrapper';

  const sheetContainer = document.createElement('div');
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
    const errDiv = document.createElement('div');
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
      cancelAnimationFrame(animId);
      animId = null;
    }
  };

  const controlsBar = document.createElement('div');
  controlsBar.className = 'abcjs-controls-bar';

  // Left controls group (Play / Stop / Restart)
  const leftBtns = document.createElement('div');
  leftBtns.className = 'abcjs-left-controls';

  // Play / Pause Button
  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'abcjs-btn abcjs-play-btn';
  playPauseBtn.title = 'Play';
  playPauseBtn.innerHTML = PLAY_ICON;

  // Stop Button
  const stopBtn = document.createElement('button');
  stopBtn.className = 'abcjs-btn abcjs-stop-btn';
  stopBtn.title = 'Stop';
  stopBtn.innerHTML = STOP_ICON;
  stopBtn.disabled = true;

  // Restart Button
  const restartBtn = document.createElement('button');
  restartBtn.className = 'abcjs-btn abcjs-restart-btn';
  restartBtn.title = 'Start from beginning';
  restartBtn.innerHTML = RESTART_ICON;
  restartBtn.disabled = true;

  leftBtns.appendChild(playPauseBtn);
  leftBtns.appendChild(stopBtn);
  leftBtns.appendChild(restartBtn);

  // Progress container group (Time Label / Progress Slider / Duration Label)
  const progressContainer = document.createElement('div');
  progressContainer.className = 'abcjs-progress-container';

  // Current Time Label
  const currentTimeEl = document.createElement('span');
  currentTimeEl.className = 'abcjs-time-label';
  currentTimeEl.textContent = '0:00';

  // Progress Bar
  const progressSlider = document.createElement('input');
  progressSlider.type = 'range';
  progressSlider.className = 'abcjs-progress-slider';
  progressSlider.min = '0';
  progressSlider.max = '100';
  progressSlider.step = '0.1';
  progressSlider.value = '0';
  progressSlider.disabled = true;

  // Duration Label
  const durationEl = document.createElement('span');
  durationEl.className = 'abcjs-time-label';
  durationEl.textContent = '0:00';

  progressContainer.appendChild(currentTimeEl);
  progressContainer.appendChild(progressSlider);
  progressContainer.appendChild(durationEl);

  // Right side buttons container
  const rightBtns = document.createElement('div');
  rightBtns.className = 'abcjs-right-controls';

  // MIDI Download Button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'abcjs-btn abcjs-download-btn';
  downloadBtn.title = 'Download MIDI';
  downloadBtn.innerHTML = DOWNLOAD_ICON;

  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      const midiData = abcjs.synth.getMidiFile(source.trim(), { midiOutputType: 'encoded' });
      if (!midiData) return;
      const dataUrl = Array.isArray(midiData) ? midiData[0] : midiData;
      const a = document.createElement('a');
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
  const copyBtn = document.createElement('button');
  copyBtn.className = 'abcjs-btn abcjs-copy-btn';
  copyBtn.title = 'Copy ABC source';
  copyBtn.innerHTML = COPY_ICON;

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(source.trim());
      copyBtn.innerHTML = CHECK_ICON;
      setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON;
      }, 1500);
    } catch {
      // ignore
    }
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
      playPauseBtn.innerHTML = PAUSE_ICON;
      playPauseBtn.title = 'Pause';
      stopBtn.disabled = false;
      restartBtn.disabled = false;
      progressSlider.disabled = false;
    } else if (playbackState === 'paused') {
      playPauseBtn.innerHTML = PLAY_ICON;
      playPauseBtn.title = 'Play';
      stopBtn.disabled = false;
      restartBtn.disabled = false;
      progressSlider.disabled = false;
    } else if (playbackState === 'loading') {
      playPauseBtn.innerHTML = PLAY_ICON;
      playPauseBtn.title = 'Loading...';
      stopBtn.disabled = true;
      restartBtn.disabled = true;
      progressSlider.disabled = true;
    } else {
      playPauseBtn.innerHTML = PLAY_ICON;
      playPauseBtn.title = 'Play';
      stopBtn.disabled = true;
      restartBtn.disabled = true;
      progressSlider.disabled = true;
      progressSlider.value = '0';
      currentTimeEl.textContent = '0:00';
    }
  }

  const syncProgress = () => {
    if (synthController && (synthController as any).midiBuffer) {
      totalDuration = (synthController as any).midiBuffer.duration || totalDuration || 0;
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
      animId = requestAnimationFrame(syncProgress);
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
        if (animId) cancelAnimationFrame(animId);
      },
    };

    (sc as any).cursorControl = cursorControl;

    await sc.setTune(visualObj, false, {});

    synthController = sc;
    totalDuration = (sc as any).midiBuffer?.duration || 0;
    if (totalDuration > 0) {
      durationEl.textContent = formatTime(totalDuration);
      progressSlider.max = totalDuration.toString();
    }
    return sc;
  };

  playPauseBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!visualObj) return;

    if (playbackState === 'playing') {
      if (synthController) {
        synthController.pause();
        synthController.isStarted = false;
      }
      playbackState = 'paused';
      updateControlsUI();
      if (animId) cancelAnimationFrame(animId);
      return;
    }

    if (playbackState === 'paused' && synthController) {
      playbackState = 'playing';
      updateControlsUI();
      synthController.play();
      animId = requestAnimationFrame(syncProgress);
      return;
    }

    // Idle: Initialize and play
    playbackState = 'loading';
    updateControlsUI();
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
      animId = requestAnimationFrame(syncProgress);
    } catch (err) {
      console.error('AbcJS playback error:', err);
      stopPlayback();
    }
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
        animId = requestAnimationFrame(syncProgress);
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
