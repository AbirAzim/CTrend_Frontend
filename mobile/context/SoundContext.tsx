import { useAudioPlayer } from "expo-audio";
import { createContext, useContext, useEffect, type ReactNode } from "react";

type SoundCtx = {
  playTick: () => void;
  playNotification: () => void;
};

const SoundContext = createContext<SoundCtx>({
  playTick: () => {},
  playNotification: () => {},
});

export function SoundProvider({ children }: { children: ReactNode }) {
  const tickPlayer = useAudioPlayer(require("../assets/vote-tick.wav"));
  const notifPlayer = useAudioPlayer(require("../assets/notification.wav"));

  // Prime both players shortly after mount so first real play works instantly.
  // We start → wait 120ms → pause+rewind. The gap is too short for the user to
  // hear anything but forces the OS audio pipeline to fully initialise.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        tickPlayer.play();
        notifPlayer.play();
        setTimeout(() => {
          try {
            tickPlayer.pause();
            tickPlayer.seekTo(0).catch(() => {});
            notifPlayer.pause();
            notifPlayer.seekTo(0).catch(() => {});
          } catch { /* ignore */ }
        }, 120);
      } catch { /* ignore */ }
    }, 600); // wait for app to finish initial render
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function playTick() {
    try { tickPlayer.play(); } catch { /* ignore */ }
    // Seek back to start after sound finishes so next call fires instantly
    setTimeout(() => tickPlayer.seekTo(0).catch(() => {}), 220);
  }

  function playNotification() {
    try { notifPlayer.play(); } catch { /* ignore */ }
    setTimeout(() => notifPlayer.seekTo(0).catch(() => {}), 2500);
  }

  return (
    <SoundContext.Provider value={{ playTick, playNotification }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSounds() {
  return useContext(SoundContext);
}
