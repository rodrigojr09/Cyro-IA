import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../shared/bridge';
export function useSpeaker(enabled) {
  const audio = useRef(null),
    epoch = useRef(0);
  const [active, setActive] = useState(false);
  const stop = useCallback(() => {
    epoch.current++;
    audio.current?.pause();
    audio.current = null;
    setActive(false);
  }, []);
  useEffect(() => {
    const unsubscribe = window.jarvisWindow?.onStopAudio?.(stop);
    return () => {
      stop();
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [stop]);
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);
  const speak = useCallback(
    async (text) => {
      stop();
      if (!enabled || !text) return;
      const generation = epoch.current;
      setActive(true);
      try {
        await window.jarvisWindow.claimAudio?.();
        if (epoch.current !== generation) return;
        const result = await api('/speak', {
          method: 'POST',
          body: JSON.stringify({ message: text.slice(0, 4000) }),
        });
        if (epoch.current !== generation) return;
        const sound = new Audio('data:audio/mp3;base64,' + result.audio_base64);
        audio.current = sound;
        sound.onended = () => {
          if (epoch.current === generation) setActive(false);
        };
        sound.onerror = () => {
          if (epoch.current === generation) setActive(false);
        };
        await sound.play();
      } catch (error) {
        if (epoch.current === generation) setActive(false);
        throw error;
      }
    },
    [enabled, stop],
  );
  return { speak, stop, active };
}
export function useDictation(onText, onStatus) {
  const [listening, setListening] = useState(false),
    recognition = useRef(null),
    latest = useRef({ onText, onStatus });
  latest.current = { onText, onStatus };
  const available =
    !!(window.SpeechRecognition || window.webkitSpeechRecognition) &&
    !!window.jarvisWindow?.permitMicrophone;
  useEffect(() => () => recognition.current?.abort(), []);
  return {
    available,
    listening,
    async toggle() {
      if (listening) {
        recognition.current?.stop();
        return;
      }
      if (!available || !(await window.jarvisWindow.permitMicrophone())) return;
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const item = new Recognition();
      recognition.current = item;
      item.lang = 'pt-BR';
      item.interimResults = false;
      item.onresult = (event) => latest.current.onText(event.results[0][0].transcript);
      item.onend = () => {
        setListening(false);
        latest.current.onStatus('Pronto');
      };
      item.onerror = () => {
        setListening(false);
        latest.current.onStatus('Entrada de voz indisponível. Use o teclado.');
      };
      try {
        item.start();
        setListening(true);
        latest.current.onStatus('Ouvindo… Clique no microfone para parar.');
      } catch {
        setListening(false);
      }
    },
  };
}
