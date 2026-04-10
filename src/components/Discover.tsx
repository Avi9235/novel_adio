import React, { useState } from 'react';
import { Search, Loader2, BookOpen, Globe } from 'lucide-react';
import { Book, storage } from '../lib/storage';

interface DiscoverProps {
  onOpenBook: (bookId: string) => void;
  isDarkMode: boolean;
}

interface SearchResult {
  title: string;
  url: string;
  cover: string;
  author: string;
  sourceId: string;
  sourceName: string;
}

export default function Discover({ onOpenBook, isDarkMode }: DiscoverProps) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingNovelUrl, setLoadingNovelUrl] = useState<string | null>(null);
  const [selectedNovel, setSelectedNovel] = useState<any | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, source })
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePreviewNovel = async (url: string) => {
    setLoadingNovelUrl(url);
    try {
      const res = await fetch('/api/novel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      
      if (!data.chapters || data.chapters.length === 0) {
        throw new Error('No chapters found');
      }

      setSelectedNovel({ ...data, url });
    } catch (error) {
      console.error('Failed to load novel details:', error);
      alert('Failed to load novel details. The website might be blocking the request.');
    } finally {
      setLoadingNovelUrl(null);
    }
  };

  const handleAddToLibrary = async () => {
    if (!selectedNovel) return;
    try {
      const newBook: Book = {
        id: crypto.randomUUID(),
        title: selectedNovel.title,
        author: selectedNovel.author,
        cover: selectedNovel.cover,
        chapters: selectedNovel.chapters,
        currentChapterIndex: 0,
        currentPosition: 0,
        addedAt: Date.now(),
        sourceUrl: selectedNovel.url
      };

      await storage.saveBook(newBook);
      setSelectedNovel(null);
      onOpenBook(newBook.id);
    } catch (error) {
      console.error('Failed to add to library:', error);
      alert('Failed to add to library.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-6">Discover</h1>
        
        <form onSubmit={handleSearch} className="relative flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for novels (e.g., Martial God Asura)..."
              className="w-full pl-12 pr-4 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:text-white transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
          </div>
          <div className="flex gap-3">
            <select 
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="px-4 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-gray-700 dark:text-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Sources</option>
              <option value="novelfire">NovelFire</option>
              <option value="lightnovelpub">LightNovelPub</option>
              <option value="noveltrust">NovelTrust</option>
              <option value="wuxiaworldeu">WuxiaWorld.eu</option>
              <option value="royalroad">Royal Road</option>
            </select>
            <button 
              type="submit"
              disabled={isSearching || !query.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center min-w-[120px]"
            >
              {isSearching ? <Loader2 className="animate-spin" size={20} /> : 'Search'}
            </button>
          </div>
        </form>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 ml-2 flex items-center gap-1">
          <Globe size={14} /> Searching across multiple novel databases
        </p>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {results.map((novel, idx) => (
            <div 
              key={idx} 
              onClick={() => handlePreviewNovel(novel.url)}
              className="group flex flex-col relative cursor-pointer"
            >
              <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden mb-3 relative shadow-sm group-hover:shadow-md transition-shadow">
                {novel.cover ? (
                  <img src={novel.cover} alt={novel.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-800 text-blue-200 dark:text-gray-600">
                    <BookOpen size={48} />
                  </div>
                )}
                
                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider z-10">
                  {novel.sourceName}
                </div>
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-full font-medium flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all">
                    {loadingNovelUrl === novel.url ? (
                      <><Loader2 className="animate-spin" size={18} /> Loading...</>
                    ) : (
                      <><BookOpen size={18} /> Preview</>
                    )}
                  </div>
                </div>
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2 leading-tight mb-1" title={novel.title}>{novel.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{novel.author}</p>
            </div>
          ))}
        </div>
      )}

      {selectedNovel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 flex gap-6">
              <div className="w-1/3 shrink-0">
                <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-md">
                  {selectedNovel.cover ? (
                    <img src={selectedNovel.cover} alt={selectedNovel.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <BookOpen size={40} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 leading-tight">{selectedNovel.title}</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-4">{selectedNovel.author}</p>
                <div className="mt-auto">
                  <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg text-sm font-medium mb-4">
                    <BookOpen size={16} />
                    {selectedNovel.chapters.length} Chapters
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center gap-3">
              <a 
                href={selectedNovel.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium flex items-center gap-1"
              >
                <Globe size={16} /> Open Website
              </a>
              <div className="flex gap-3">
                <button 
                  onClick={() => setSelectedNovel(null)}
                  className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddToLibrary}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  Add to Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
