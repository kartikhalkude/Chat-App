// Audio context for managing sounds
let audioContext: AudioContext | null = null;
let ringtoneSource: AudioBufferSourceNode | null = null;
let ringtoneAudio: HTMLAudioElement | null = null;

// Create and cache the audio context
const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

const RINGTONE_URL = 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_345b0be092.mp3';

// Initialize the audio element with the local ringtone
const initRingtone = () => {
  if (!ringtoneAudio) {
    ringtoneAudio = new Audio();
    // Use the local audio file from assets
    ringtoneAudio.src = '/src/assets/Yo Phone Linging-Downringtone.com.mp3';
    ringtoneAudio.loop = true;
    ringtoneAudio.volume = 0.7;
    ringtoneAudio.preload = 'auto';

    // Add error handling
    ringtoneAudio.onerror = (e) => {
      console.error('Ringtone error:', e);
      console.error('Failed to load local ringtone');
    };
  }
  return ringtoneAudio;
};

// Play ringtone with user interaction handling
export const playRingtone = async () => {
  try {
    const audio = initRingtone();
    
    // Reset the audio to start
    audio.currentTime = 0;
    
    // Play with user interaction handling
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error('Playback failed:', error);
        // Handle autoplay restrictions
        const playOnInteraction = () => {
          audio.play().catch(console.error);
          document.removeEventListener('click', playOnInteraction);
        };
        document.addEventListener('click', playOnInteraction);
      });
    }
  } catch (error) {
    console.error('Failed to play ringtone:', error);
  }
};

// Stop ringtone
export const stopRingtone = () => {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
  }
};

// Function to test if audio can be played
export const testAudio = async () => {
  try {
    const audio = new Audio('/src/assets/Yo Phone Linging-Downringtone.com.mp3');
    await audio.play();
    audio.pause();
    return true;
  } catch (error) {
    console.error('Audio test failed:', error);
    return false;
  }
}; 