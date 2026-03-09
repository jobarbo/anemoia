// Simple global audio manager
export class AudioManager {
  private static instance: AudioManager;
  private currentAudio: HTMLAudioElement | null = null;

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public playSceneAmbient(src: string) {
    if (this.currentAudio && this.currentAudio.src.includes(src)) {
      return; // Already playing this track
    }

    this.stopCurrent();

    this.currentAudio = new Audio(src);
    this.currentAudio.loop = true;
    this.currentAudio.volume = 0; // Start at 0 for fade in
    this.currentAudio.play().catch(e => console.warn('Autoplay prevented:', e));

    // Simple fade in
    let vol = 0;
    const fadeInterval = setInterval(() => {
      if (vol < 0.5) {
        vol += 0.05;
        if (this.currentAudio) this.currentAudio.volume = vol;
      } else {
        clearInterval(fadeInterval);
      }
    }, 100);
  }

  public stopCurrent() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }
}

// In Astro, we can export the instance directly for client-side scripts to use
export const audioManager = AudioManager.getInstance();
