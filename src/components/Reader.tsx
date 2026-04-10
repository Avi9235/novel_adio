import { useState, useEffect, useRef, useMemo } from 'react';
import { Book, Bookmark, storage } from '../lib/storage';
import { useTTS, PREMIUM_VOICES, EDGE_VOICES } from '../lib/tts';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Settings, List, Volume2, Moon, Sun, BookmarkPlus, Bookmark as BookmarkIcon, Rewind, FastForward, Loader2, Clock, Lock, Unlock, Sparkles, Key, Globe, ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ReaderProps {
  bookId: string;
  onClose: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export default function Reader({ bookId, onClose, isDarkMode, toggleDarkMode }: ReaderProps) {
  const [book, setBook] = useState<Book | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(true);
  
  const textContainerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const isInitialLoad = useRef(true);
  const pendingBookmarkJumpRef = useRef<number | null>(null);

  const [isLoadingText, setIsLoadingText] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [premiumApiKeyInput, setPremiumApiKeyInput] = useState(localStorage.getItem('premiumApiKey') || '');
  const [premiumBaseUrlInput, setPremiumBaseUrlInput] = useState(localStorage.getItem('premiumBaseUrl') || 'https://api.openai.com/v1');

  const handleSetSleepTimer = (minutes: number | null) => {
    setSleepTimer(minutes);
    setSleepTimerRemaining(minutes ? minutes * 60 : null);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    storage.getBook(bookId).then(b => {
      if (b) {
        setBook(b);
        setChapterIndex(b.currentChapterIndex);
      }
    });
  }, [bookId]);

  const currentChapter = book?.chapters[chapterIndex];
  const text = currentChapter?.text || '';

  useEffect(() => {
    const fetchChapterText = async () => {
      if (book && currentChapter && !currentChapter.text && currentChapter.url) {
        setIsLoadingText(true);
        try {
          const res = await fetch('/api/chapter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: currentChapter.url })
          });
          const data = await res.json();
          
          if (data.text) {
            const updatedBook = { ...book };
            updatedBook.chapters[chapterIndex].text = data.text;
            setBook(updatedBook);
            await storage.saveBook(updatedBook);
          }
        } catch (error) {
          console.error('Failed to fetch chapter text:', error);
        } finally {
          setIsLoadingText(false);
        }
      }
    };
    
    fetchChapterText();
  }, [chapterIndex, book?.id, currentChapter?.url]);

  const sentences = useMemo(() => {
    if (!text) return [];
    
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
    
    return combinedSents;
  }, [text]);

  const handleBoundary = (charIndex: number) => {
    if (book) {
      storage.updateProgress(book.id, chapterIndex, charIndex);
    }
  };

  const tts = useTTS(text, handleBoundary);

  useEffect(() => {
    if (autoScroll && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [tts.currentCharIndex, autoScroll]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sleepTimer !== null && tts.isPlaying && !tts.isPaused) {
      interval = setInterval(() => {
        setSleepTimerRemaining(prev => {
          if (prev === null || prev <= 1) {
            tts.pause();
            setSleepTimer(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sleepTimer, tts.isPlaying, tts.isPaused, tts]);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (tts.isPlaying && !tts.isPaused) {
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
    return () => clearTimeout(timeout);
  }, [tts.isPlaying, tts.isPaused]);

  useEffect(() => {
    if (book && isInitialLoad.current) {
      tts.seek(book.currentPosition);
      isInitialLoad.current = false;
      
      setTimeout(() => {
        if (activeWordRef.current) {
          activeWordRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
      }, 100);
    } else if (book) {
      if (pendingBookmarkJumpRef.current !== null && !isLoadingText) {
        tts.seek(pendingBookmarkJumpRef.current);
        pendingBookmarkJumpRef.current = null;
      } else if (!isLoadingText) {
        tts.seek(0);
      }
      
      setTimeout(() => {
        if (activeWordRef.current) {
          activeWordRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }, 100);
    }
  }, [chapterIndex, book?.id, isLoadingText]);

  const handlePlayPause = () => {
    if (tts.isPlaying) {
      if (tts.isPaused) {
        tts.resume();
      } else {
        tts.pause();
      }
    } else {
      tts.play(book?.currentPosition || 0);
    }
  };

  const handleNextChapter = () => {
    if (book && chapterIndex < book.chapters.length - 1) {
      setChapterIndex(prev => prev + 1);
      storage.updateProgress(book.id, chapterIndex + 1, 0);
    }
  };

  const handlePrevChapter = () => {
    if (book && chapterIndex > 0) {
      setChapterIndex(prev => prev - 1);
      storage.updateProgress(book.id, chapterIndex - 1, 0);
    }
  };

  const handleSentenceClick = (startChar: number) => {
    if (book) {
      storage.updateProgress(book.id, chapterIndex, startChar);
    }
    tts.seek(startChar);
  };

  const handleSkip = (direction: 'forward' | 'backward') => {
    const currentSentenceIdx = sentences.findIndex(s => tts.currentCharIndex >= s.start && tts.currentCharIndex < s.end);
    let targetIdx = currentSentenceIdx;
    if (direction === 'forward') {
      targetIdx = Math.min(sentences.length - 1, currentSentenceIdx + 1);
    } else {
      targetIdx = Math.max(0, currentSentenceIdx - 1);
    }
    const newPos = sentences[targetIdx]?.start || 0;
    tts.seek(newPos);
    if (book) storage.updateProgress(book.id, chapterIndex, newPos);
  };

  const handleAddBookmark = async () => {
    if (!book) return;
    const currentSentence = sentences.find(s => tts.currentCharIndex >= s.start && tts.currentCharIndex < s.end);
    const snippet = currentSentence ? currentSentence.text.substring(0, 60) + '...' : 'Bookmark';
    
    const newBookmark: Bookmark = {
      id: crypto.randomUUID(),
      chapterIndex,
      position: tts.currentCharIndex,
      textSnippet: snippet,
      timestamp: Date.now()
    };
    
    const updatedBook = { ...book, bookmarks: [...(book.bookmarks || []), newBookmark] };
    setBook(updatedBook);
    await storage.saveBook(updatedBook);
  };

  const jumpToBookmark = (bm: Bookmark) => {
    if (bm.chapterIndex !== chapterIndex) {
      pendingBookmarkJumpRef.current = bm.position;
      setChapterIndex(bm.chapterIndex);
    } else {
      tts.seek(bm.position);
    }
    setShowBookmarks(false);
  };

  if (!book || !currentChapter) {
    return <div className="flex items-center justify-center h-screen dark:text-white">Loading...</div>;
  }

  return (
    <div className="relative h-screen bg-white dark:bg-gray-900 transition-colors duration-200 overflow-hidden">
      <header className={cn(
        "absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-2 md:px-4 md:py-3 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-40 transition-transform duration-300",
        showControls ? "translate-y-0" : "-translate-y-full"
      )}>
        <div className="flex items-center gap-1 md:gap-2 overflow-hidden">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors shrink-0">
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{book.title}</h2>
            <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">{currentChapter.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={handleAddBookmark} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" title="Add Bookmark">
            <BookmarkPlus size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <button onClick={() => { setShowBookmarks(!showBookmarks); setShowToc(false); setShowSettings(false); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors hidden md:block">
            <BookmarkIcon size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <button onClick={() => { setShowToc(!showToc); setShowBookmarks(false); setShowSettings(false); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <List size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <button onClick={() => { setShowSettings(!showSettings); setShowBookmarks(false); setShowToc(false); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <Settings size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      </header>

      <div className="absolute inset-0 flex">
        {showHint && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 text-xs px-4 py-2 rounded-full shadow-lg z-30 pointer-events-none transition-opacity duration-500">
            Tap screen to hide/show controls
          </div>
        )}
        <div 
          ref={textContainerRef}
          onClick={() => setShowControls(prev => !prev)}
          className="flex-1 overflow-y-auto px-6 pt-20 pb-40 md:px-12 lg:px-24 touch-manipulation"
        >
          {isLoadingText ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p>Downloading chapter text...</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6 text-lg leading-relaxed text-gray-800 dark:text-gray-200 font-serif whitespace-pre-wrap">
              {sentences.map((sentence, idx) => {
                const isActive = tts.currentCharIndex >= sentence.start && tts.currentCharIndex < sentence.end;
                return (
                  <span 
                    key={idx}
                    ref={isActive ? activeWordRef : null}
                    className={cn(
                      "transition-colors duration-200 rounded px-1",
                      isActive ? "bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-50 font-medium shadow-sm" : ""
                    )}
                  >
                    {sentence.text}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile Floating Menu Button */}
        {!showControls && (
          <button 
            onClick={() => setShowControls(true)}
            className="md:hidden absolute bottom-6 right-6 w-12 h-12 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full shadow-xl flex items-center justify-center z-30 opacity-80 hover:opacity-100 transition-opacity"
          >
            <Settings size={20} />
          </button>
        )}

        {showToc && (
          <div className="w-64 border-l border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-y-auto absolute right-0 top-0 bottom-0 z-20 shadow-xl md:relative md:shadow-none pt-16 md:pt-0">
            <div className="p-4 font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-800">Chapters</div>
            <div className="py-2">
              {book.chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setChapterIndex(idx);
                    setShowToc(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 text-sm transition-colors",
                    idx === chapterIndex ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  {ch.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {showBookmarks && (
          <div className="w-72 border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto absolute right-0 top-0 bottom-0 z-20 shadow-xl p-4 pt-20 md:pt-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BookmarkIcon size={18} /> Bookmarks
            </h3>
            {(!book.bookmarks || book.bookmarks.length === 0) ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No bookmarks yet.</p>
            ) : (
              <div className="space-y-3">
                {book.bookmarks.sort((a,b) => b.timestamp - a.timestamp).map(bm => (
                  <div key={bm.id} onClick={() => jumpToBookmark(bm)} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                      Chapter {bm.chapterIndex + 1}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 italic">"{bm.textSnippet}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showSettings && (
          <>
            {/* Mobile backdrop */}
            <div 
              className="fixed inset-0 bg-black/20 dark:bg-black/40 z-20 md:hidden" 
              onClick={() => setShowSettings(false)}
            />
            <div className="w-80 border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto absolute right-0 top-0 bottom-0 z-30 shadow-2xl p-6 pt-20 pb-32 md:pt-6 md:pb-32">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings size={18} /> Settings
                </h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Appearance */}
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Sun size={16} className="text-blue-500 dark:hidden" />
                    <Moon size={16} className="text-blue-500 hidden dark:block" />
                    Appearance & Reading
                  </h4>
                  <button
                    onClick={toggleDarkMode}
                    className="w-full flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <span>{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
                    <div className={cn("w-10 h-5 rounded-full relative transition-colors", isDarkMode ? "bg-blue-600" : "bg-gray-300")}>
                      <div className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform", isDarkMode ? "translate-x-5" : "translate-x-0")} />
                    </div>
                  </button>
                  <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    className="w-full flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <span>Auto-Scroll & Highlight</span>
                    <div className={cn("w-10 h-5 rounded-full relative transition-colors", autoScroll ? "bg-blue-600" : "bg-gray-300")}>
                      <div className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform", autoScroll ? "translate-x-5" : "translate-x-0")} />
                    </div>
                  </button>
                </div>

              {/* Sleep Timer */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Clock size={16} className="text-blue-500" /> Sleep Timer
                  {sleepTimerRemaining !== null && (
                    <span className="ml-auto text-xs font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                      {formatTime(sleepTimerRemaining)}
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 60, 120].map(mins => (
                    <button
                      key={mins}
                      onClick={() => handleSetSleepTimer(sleepTimer === mins ? null : mins)}
                      className={cn(
                        "text-xs py-2 rounded-lg font-medium transition-colors border",
                        sleepTimer === mins 
                          ? "bg-blue-600 text-white border-blue-600" 
                          : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                      )}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                {sleepTimer !== null && (
                  <button 
                    onClick={() => handleSetSleepTimer(null)}
                    className="w-full mt-2 text-xs text-red-500 hover:text-red-600 font-medium py-1"
                  >
                    Cancel Timer
                  </button>
                )}
              </div>

              {/* Audio Settings */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                <button 
                  onClick={() => setIsAudioSettingsOpen(!isAudioSettingsOpen)}
                  className="w-full flex items-center justify-between text-sm font-medium text-gray-900 dark:text-white"
                >
                  <div className="flex items-center gap-2">
                    <Volume2 size={16} className="text-blue-500" /> Audio Playback
                  </div>
                  {isAudioSettingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                
                {isAudioSettingsOpen && (
                  <div className="space-y-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Reading Speed ({tts.rate}x)</label>
                      <input 
                        type="range" 
                        min="0.5" max="3" step="0.1" 
                        value={tts.rate}
                        onChange={(e) => tts.setRate(parseFloat(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>0.5x</span>
                        <span>1x</span>
                        <span>2x</span>
                        <span>3x</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Standard Voices (Free)</label>
                      <select 
                        value={tts.engine === 'web' ? (tts.voice?.name || '') : ''}
                        onChange={(e) => {
                          const voice = tts.voices.find(v => v.name === e.target.value);
                          if (voice) tts.setVoice(voice);
                        }}
                        className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="" disabled>Select standard voice...</option>
                        {tts.voices.map(v => (
                          <option key={v.name} value={v.name}>
                            {v.name.includes('Natural') || v.name.includes('Neural') ? '⭐ ' : ''}{v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Premium TTS */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50 p-4 rounded-xl">
                <h4 className="text-sm font-medium text-indigo-900 dark:text-indigo-300 mb-3 flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-500" /> Premium Voices
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-indigo-600 dark:text-indigo-400 mb-1 uppercase font-semibold tracking-wider">Provider</label>
                    <select 
                      value={tts.premiumProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value as 'openai' | 'edge';
                        const defaultVoice = newProvider === 'openai' ? 'alloy' : 'en-US-AriaNeural';
                        tts.setPremiumConfig(defaultVoice, premiumApiKeyInput, premiumBaseUrlInput, newProvider);
                      }}
                      className="w-full border border-indigo-200 dark:border-indigo-800/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none mb-3"
                    >
                      <option value="openai">OpenAI / Compatible API</option>
                      <option value="edge">Microsoft Edge TTS (Free)</option>
                    </select>
                  </div>

                  {tts.premiumProvider === 'openai' && (
                    <>
                      <div>
                        <label className="block text-[10px] text-indigo-600 dark:text-indigo-400 mb-1 uppercase font-semibold tracking-wider">API Base URL</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="https://api.openai.com/v1"
                            value={premiumBaseUrlInput}
                            onChange={(e) => {
                              setPremiumBaseUrlInput(e.target.value);
                              if (tts.engine === 'premium') {
                                tts.setPremiumConfig(tts.premiumVoice, premiumApiKeyInput, e.target.value, 'openai');
                              }
                            }}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-indigo-200 dark:border-indigo-800/50 bg-white dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                          />
                          <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-indigo-600 dark:text-indigo-400 mb-1 uppercase font-semibold tracking-wider">API Key</label>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder="sk-..."
                            value={premiumApiKeyInput}
                            onChange={(e) => {
                              setPremiumApiKeyInput(e.target.value);
                              if (tts.engine === 'premium') {
                                tts.setPremiumConfig(tts.premiumVoice, e.target.value, premiumBaseUrlInput, 'openai');
                              }
                            }}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-indigo-200 dark:border-indigo-800/50 bg-white dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                          />
                          <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[10px] text-indigo-600 dark:text-indigo-400 mb-1 uppercase font-semibold tracking-wider">Voice Model</label>
                    <select 
                      value={tts.engine === 'premium' ? tts.premiumVoice : ''}
                      onChange={(e) => tts.setPremiumConfig(e.target.value, premiumApiKeyInput, premiumBaseUrlInput, tts.premiumProvider)}
                      className="w-full border border-indigo-200 dark:border-indigo-800/50 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="" disabled>Select premium voice...</option>
                      {tts.premiumProvider === 'openai' ? (
                        PREMIUM_VOICES.map(v => (
                          <option key={v} value={v}>
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </option>
                        ))
                      ) : (
                        EDGE_VOICES.map(v => (
                          <option key={v} value={v}>
                            {v.replace('Neural', '').replace('en-', '')}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                    {tts.premiumProvider === 'openai' 
                      ? 'Use OpenAI or any compatible API (like Chinese models). Enter the base URL and Key.'
                      : 'Free high-quality voices from Microsoft Edge.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-40 transition-transform duration-300",
        showControls ? "translate-y-0" : "translate-y-full md:translate-y-0"
      )}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button 
            onClick={handlePrevChapter}
            disabled={chapterIndex === 0}
            className="p-3 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full disabled:opacity-30 transition-colors"
          >
            <SkipBack size={20} />
          </button>

          <button 
            onClick={() => handleSkip('backward')}
            className="p-3 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <Rewind size={24} />
          </button>
          
          <button 
            onClick={handlePlayPause}
            className="w-16 h-16 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-600/30 transition-transform active:scale-95"
          >
            {tts.isPlaying && !tts.isPaused ? (
              <Pause size={28} className="fill-current" />
            ) : (
              <Play size={28} className="fill-current ml-1" />
            )}
          </button>

          <button 
            onClick={() => handleSkip('forward')}
            className="p-3 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <FastForward size={24} />
          </button>
          
          <button 
            onClick={handleNextChapter}
            disabled={chapterIndex === book.chapters.length - 1}
            className="p-3 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full disabled:opacity-30 transition-colors"
          >
            <SkipForward size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
