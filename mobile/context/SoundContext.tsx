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
    tickPlayer.seekTo(0).then(() => tickPlayer.play()).catch(() => {});
  }

  function playNotification() {
    notifPlayer.seekTo(0).then(() => notifPlayer.play()).catch(() => {});
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
