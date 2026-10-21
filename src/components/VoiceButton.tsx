import clsx from 'clsx';
import { Mic, MicOff } from 'lucide-react';
import { useRef, useState } from 'react';

/** Web Speech dictation where available; otherwise a hint to use the keyboard's mic. */
type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const Ctor = (typeof window !== 'undefined' && ((window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition)) || null;
  const [on, setOn] = useState(false);
  const rec = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  if (!Ctor) return <span className="px-2 text-xs text-muted">Tip: use your keyboard's mic to dictate</span>;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Stop dictation' : 'Dictate'}
      onClick={() => {
        if (on) {
          rec.current?.stop();
          return;
        }
        const r = new Ctor();
        r.lang = navigator.language || 'en-IN';
        r.interimResults = false;
        r.continuous = true;
        r.onresult = (e) => {
          const last = e.results[e.results.length - 1];
          if (last?.[0]) onText(last[0].transcript);
        };
        r.onend = () => setOn(false);
        r.onerror = () => setOn(false);
        rec.current = r;
        r.start();
        setOn(true);
      }}
      className={clsx('flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold', on ? 'bg-protein text-white' : 'bg-accent-soft text-accent-ink')}
    >
      {on ? <MicOff size={18} /> : <Mic size={18} />} {on ? 'Listening…' : 'Speak'}
    </button>
  );
}

