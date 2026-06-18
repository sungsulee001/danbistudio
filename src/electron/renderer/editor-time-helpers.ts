export function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.round((safeSeconds - wholeSeconds) * fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(secs)}:${padTime(Math.min(frames, fps - 1))}`;
}

export function formatClockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatRulerTime(seconds: number): string {
  if (seconds < 60) {
    return `${Number(seconds.toFixed(2))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${padTime(secs)}`;
}

export function formatSignedEditDelta(seconds: number): string {
  const sign = seconds < -0.001 ? '-' : '+';
  return `${sign}${formatRulerTime(Math.abs(seconds))}`;
}

function padTime(value: number): string {
  return Math.floor(value).toString().padStart(2, '0');
}
