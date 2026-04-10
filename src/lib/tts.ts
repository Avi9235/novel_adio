import { useState, useEffect, useCallback, useRef } from 'react';

interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentWordIndex: number;
  currentCharIndex: number;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  engine: 'web' | 'premium';
  premiumVoice: string;
  premiumApiKey: string;
  premiumBaseUrl: string;
  premiumProvider: 'openai' | 'edge';
}

export const PREMIUM_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
export const EDGE_VOICES = [
  'en-US-AriaNeural',
  'en-US-GuyNeural',
  'en-US-JennyNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-MichelleNeural',
  'en-US-RogerNeural',
  'en-US-SteffanNeural',
  'en-GB-SoniaNeural',
  'en-GB-RyanNeural',
  'en-GB-LibbyNeural',
  'en-AU-NatashaNeural',
  'en-AU-WilliamNeural',
  'en-CA-ClaraNeural',
  'en-CA-LiamNeural'
];

export function useTTS(text: string, onBoundary?: (charIndex: number) => void) {
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    currentWordIndex: 0,
    currentCharIndex: 0,
    rate: 1.0,
    voice: null,
    engine: 'web',
    premiumVoice: 'alloy',
    premiumApiKey: localStorage.getItem('premiumApiKey') || '',
    premiumBaseUrl: localStorage.getItem('premiumBaseUrl') || 'https://api.openai.com/v1',
    premiumProvider: (localStorage.getItem('premiumProvider') as 'openai' | 'edge') || 'openai',
  });
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSentenceIndexRef = useRef<number>(0);
  const sentencesRef = useRef<{start: number, end: number, text: string}[]>([]);
  const generationIdRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const prefetchQueueRef = useRef<Record<number, Promise<string | null>>>({});

  // Parse sentences for Premium TTS chunking
  useEffect(() => {
    if (!text) {
      sentencesRef.current = [];
      return;
    }
    
    // Chunk by paragraphs first for more natural reading flow
    const paragraphRegex = /\n+/g;
    let match;
    let lastIndex = 0;
    const chunks = [];
    
    while ((match = paragraphRegex.exec(text)) !== null) {
      const end = match.index + match[0].length;
      const chunkText = text.slice(lastIndex, end);
      if (chunkText.trim()) {
        chunks.push({ start: lastIndex, end, text: chunkText });
      }
      lastIndex = end;
    }
    if (lastIndex < text.length) {
      const chunkText = text.slice(lastIndex);
      if (chunkText.trim()) {
        chunks.push({ start: lastIndex, end: text.length, text: chunkText });
      }
    }
    
    // If a paragraph is too long (> 1500 chars), split it by sentences
    const finalChunks = [];
    for (const chunk of chunks) {
      if (chunk.text.length > 1500) {
        const sentenceRegex = /([.?!])\s+(?=[A-Z])/g;
        let sMatch;
        let sLastIndex = 0;
        while ((sMatch = sentenceRegex.exec(chunk.text)) !== null) {
          const sEnd = sMatch.index + sMatch[1].length;
          finalChunks.push({
            start: chunk.start + sLastIndex,
            end: chunk.start + sEnd,
            text: chunk.text.slice(sLastIndex, sEnd)
          });
          sLastIndex = sEnd;
        }
        if (sLastIndex < chunk.text.length) {
          finalChunks.push({
            start: chunk.start + sLastIndex,
            end: chunk.end,
            text: chunk.text.slice(sLastIndex)
          });
        }
      } else {
        finalChunks.push(chunk);
      }
    }
    
    // Combine very short chunks to make it sound more natural and reduce API calls
    const combinedSents = [];
    let currentSent = null;
    for (const sent of finalChunks) {
      if (!currentSent) {
        currentSent = { ...sent };
      } else if (currentSent.text.length < 150) {
        currentSent.text += ' ' + sent.text;
        currentSent.end = sent.end;
      } else {
        combinedSents.push(currentSent);
        currentSent = { ...sent };
      }
    }
    if (currentSent) combinedSents.push(currentSent);
    
    sentencesRef.current = combinedSents;
    prefetchQueueRef.current = {}; // Clear queue on text change
  }, [text]);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const sortedVoices = [...availableVoices].sort((a, b) => {
        const aIsAndrew = a.name.includes('Andrew');
        const bIsAndrew = b.name.includes('Andrew');
        if (aIsAndrew && !bIsAndrew) return -1;
        if (!aIsAndrew && bIsAndrew) return 1;
        const aIsNatural = a.name.includes('Natural') || a.name.includes('Neural') || a.name.includes('Premium');
        const bIsNatural = b.name.includes('Natural') || b.name.includes('Neural') || b.name.includes('Premium');
        if (aIsNatural && !bIsNatural) return -1;
        if (!aIsNatural && bIsNatural) return 1;
        const aIsEn = a.lang.startsWith('en');
        const bIsEn = b.lang.startsWith('en');
        if (aIsEn && !bIsEn) return -1;
        if (!aIsEn && bIsEn) return 1;
        return a.name.localeCompare(b.name);
      });
      setVoices(sortedVoices);
      setState(s => {
        if (!s.voice && sortedVoices.length > 0) {
          return { ...s, voice: sortedVoices[0] };
        }
        return s;
      });
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      // Cleanup object URLs
      Object.values(prefetchQueueRef.current).forEach(p => {
        p.then(url => { if (url) URL.revokeObjectURL(url); });
      });
    };
  }, []);

  const fetchAudioUrl = useCallback(async (sentenceIndex: number, genId: number): Promise<string | null> => {
    if (sentenceIndex >= sentencesRef.current.length) return null;
    const sentence = sentencesRef.current[sentenceIndex];
    
    try {
      // Strip out symbols that TTS engines might read out loud inappropriately
      const cleanText = sentence.text.replace(/[*_#~]/g, '').trim();
      
      if (!cleanText) {
        // If the sentence is empty after stripping, just skip to the next one
        return null;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voice: state.premiumVoice,
          apiKey: state.premiumApiKey,
          baseUrl: state.premiumBaseUrl,
          provider: state.premiumProvider
        })
      });

      if (!res.ok) {
        const err = await res.json();
        console.error(`Premium TTS Error: ${err.error}`);
        return null;
      }

      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Premium TTS fetch failed:', error);
      return null;
    }
  }, [state.premiumVoice, state.premiumApiKey, state.premiumBaseUrl, state.premiumProvider]);

  const getAudioUrl = useCallback((sentenceIndex: number, genId: number): Promise<string | null> => {
    if (!prefetchQueueRef.current[sentenceIndex]) {
      prefetchQueueRef.current[sentenceIndex] = fetchAudioUrl(sentenceIndex, genId);
    }
    return prefetchQueueRef.current[sentenceIndex];
  }, [fetchAudioUrl]);

  const playPremiumSentence = useCallback(async (sentenceIndex: number) => {
    const currentGenId = generationIdRef.current;
    
    if (sentenceIndex >= sentencesRef.current.length) {
      setState(s => ({ ...s, isPlaying: false, isPaused: false }));
      return;
    }

    const sentence = sentencesRef.current[sentenceIndex];
    currentSentenceIndexRef.current = sentenceIndex;
    
    setState(s => ({ ...s, isPlaying: true, isPaused: false, currentCharIndex: sentence.start }));
    isPausedRef.current = false;
    if (onBoundary) onBoundary(sentence.start);

    // Start prefetching the next sentence immediately
    if (sentenceIndex + 1 < sentencesRef.current.length) {
      getAudioUrl(sentenceIndex + 1, currentGenId);
    }

    try {
      const url = await getAudioUrl(sentenceIndex, currentGenId);

      if (currentGenId !== generationIdRef.current) return;
      if (!url) {
        // If url is null (e.g. empty text after stripping symbols), skip to next sentence
        if (!isPausedRef.current && currentGenId === generationIdRef.current) {
          playPremiumSentence(sentenceIndex + 1);
        }
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        // Don't revoke immediately as it might still be playing slightly or needed
      }

      const audio = new Audio(url);
      audio.playbackRate = state.rate;
      audioRef.current = audio;

      audio.onended = () => {
        if (!isPausedRef.current && currentGenId === generationIdRef.current) {
          playPremiumSentence(sentenceIndex + 1);
        }
      };

      if (!isPausedRef.current) {
        await audio.play();
      }
    } catch (error) {
      if (currentGenId !== generationIdRef.current) return;
      console.error('Premium TTS playback failed:', error);
      setState(s => ({ ...s, isPlaying: false, isPaused: false }));
    }
  }, [getAudioUrl, state.rate, onBoundary]);

  const play = useCallback((startCharIndex: number = 0) => {
    generationIdRef.current++;
    isPausedRef.current = false;
    window.speechSynthesis.cancel();
    if (audioRef.current) audioRef.current.pause();
    
    if (!text) return;

    if (state.engine === 'premium') {
      // Find which sentence contains startCharIndex
      let sIndex = sentencesRef.current.findIndex(s => startCharIndex >= s.start && startCharIndex < s.end);
      if (sIndex === -1) sIndex = 0;
      
      // Clear old queue entries to save memory
      Object.keys(prefetchQueueRef.current).forEach(key => {
        const k = parseInt(key);
        if (k < sIndex) {
          prefetchQueueRef.current[k].then(url => { if (url) URL.revokeObjectURL(url); });
          delete prefetchQueueRef.current[k];
        }
      });
      
      playPremiumSentence(sIndex);
      return;
    }

    // Web Speech API
    const textToPlay = text.slice(startCharIndex);
    const utterance = new SpeechSynthesisUtterance(textToPlay);
    
    if (state.voice) utterance.voice = state.voice;
    utterance.rate = state.rate;

    utterance.onstart = () => {
      setState(s => ({ ...s, isPlaying: true, isPaused: false, currentCharIndex: startCharIndex }));
    };

    utterance.onend = () => {
      setState(s => ({ ...s, isPlaying: false, isPaused: false }));
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        console.error('TTS Error:', e);
        setState(s => ({ ...s, isPlaying: false, isPaused: false }));
      }
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.name === 'sentence') {
        const absoluteCharIndex = startCharIndex + event.charIndex;
        setState(s => ({ ...s, currentCharIndex: absoluteCharIndex }));
        if (onBoundary) {
          onBoundary(absoluteCharIndex);
        }
      }
    };

    utteranceRef.current = utterance;
    // Small delay helps prevent Web Speech API from getting stuck
    setTimeout(() => window.speechSynthesis.speak(utterance), 50);
  }, [text, state.voice, state.rate, state.engine, playPremiumSentence, onBoundary]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    if (state.engine === 'premium') {
      if (audioRef.current) audioRef.current.pause();
      setState(s => ({ ...s, isPaused: true }));
    } else {
      window.speechSynthesis.cancel(); // Cancel instead of pause to fix bugs
      setState(s => ({ ...s, isPaused: true }));
    }
  }, [state.engine]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    if (state.engine === 'premium') {
      if (audioRef.current && !audioRef.current.ended) {
        audioRef.current.play();
        setState(s => ({ ...s, isPaused: false }));
      } else {
        // If the audio ended while paused, we need to play the next sentence
        const nextIndex = audioRef.current?.ended ? currentSentenceIndexRef.current + 1 : currentSentenceIndexRef.current;
        playPremiumSentence(nextIndex);
      }
    } else {
      // Restart from current char index to avoid resume bugs
      play(state.currentCharIndex);
    }
  }, [state.engine, state.currentCharIndex, play, playPremiumSentence]);

  const stop = useCallback(() => {
    generationIdRef.current++;
    isPausedRef.current = false;
    window.speechSynthesis.cancel();
    if (audioRef.current) audioRef.current.pause();
    setState(s => ({ ...s, isPlaying: false, isPaused: false }));
  }, []);

  const seek = useCallback((charIndex: number) => {
    setState(s => {
      if (s.isPlaying && !s.isPaused) {
        setTimeout(() => play(charIndex), 50);
      }
      return { ...s, currentCharIndex: charIndex };
    });
  }, [play]);

  const setRate = useCallback((rate: number) => {
    setState(s => ({ ...s, rate }));
    if (state.engine === 'premium' && audioRef.current) {
      audioRef.current.playbackRate = rate;
    } else if (state.isPlaying && !state.isPaused) {
      setTimeout(() => play(state.currentCharIndex), 50);
    }
  }, [state.engine, state.isPlaying, state.isPaused, state.currentCharIndex, play]);

  const setVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setState(s => ({ ...s, voice, engine: 'web' }));
    if (state.isPlaying && !state.isPaused) {
      setTimeout(() => play(state.currentCharIndex), 50);
    }
  }, [state.isPlaying, state.isPaused, state.currentCharIndex, play]);

  const setPremiumConfig = useCallback((voice: string, apiKey?: string, baseUrl?: string, provider?: 'openai' | 'edge') => {
    setState(s => {
      const newKey = apiKey !== undefined ? apiKey : s.premiumApiKey;
      const newBaseUrl = baseUrl !== undefined ? baseUrl : s.premiumBaseUrl;
      const newProvider = provider !== undefined ? provider : s.premiumProvider;
      localStorage.setItem('premiumApiKey', newKey);
      localStorage.setItem('premiumBaseUrl', newBaseUrl);
      localStorage.setItem('premiumProvider', newProvider);
      return { ...s, premiumVoice: voice, premiumApiKey: newKey, premiumBaseUrl: newBaseUrl, premiumProvider: newProvider, engine: 'premium' };
    });
    if (state.isPlaying && !state.isPaused) {
      setTimeout(() => play(state.currentCharIndex), 50);
    }
  }, [state.isPlaying, state.isPaused, state.currentCharIndex, play]);

  return {
    ...state,
    voices,
    play,
    pause,
    resume,
    stop,
    seek,
    setRate,
    setVoice,
    setPremiumConfig
  };
}
