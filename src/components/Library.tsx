import React, { useState, useEffect, useRef } from 'react';
import { Book, storage } from '../lib/storage';
import { parseEpub, parseTxt } from '../lib/parser';
import { Book as BookIcon, Upload, Trash2, Play, Moon, Sun, RefreshCw, Loader2, LogIn, LogOut } from 'lucide-react';
import { auth, loginWithGoogle, logout } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface LibraryProps {
  onOpenBook: (bookId: string) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export default function Library({ onOpenBook, isDarkMode, toggleDarkMode }: LibraryProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const [refreshingBookId, setRefreshingBookId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'reading' | 'finished' | 'favorites'>('all');
  const [user, setUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      loadBooks();
    });
    return () => unsubscribe();
  }, []);

  const loadBooks = async () => {
    const loadedBooks = await storage.getBooks();
    setBooks(loadedBooks);
  };

  const handleRefreshBook = async (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    if (!book.sourceUrl) return;
    
    setRefreshingBookId(book.id);
    try {
      const res = await fetch('/api/novel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: book.sourceUrl })
      });
      const data = await res.json();
      
      if (data.chapters && data.chapters.length > 0) {
        // Append new chapters
        const existingChapterUrls = new Set(book.chapters.map(c => c.url || c.id));
        const newChapters = data.chapters.filter((c: any) => !existingChapterUrls.has(c.url || c.id));
        
        if (newChapters.length > 0) {
          const updatedBook = {
            ...book,
            chapters: [...book.chapters, ...newChapters]
          };
          await storage.saveBook(updatedBook);
          await loadBooks();
          alert(`Added ${newChapters.length} new chapters!`);
        } else {
          alert('No new chapters found.');
        }
      }
    } catch (error) {
      console.error('Failed to refresh book:', error);
      alert('Failed to refresh book.');
    } finally {
      setRefreshingBookId(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let book: Book;
      if (file.name.endsWith('.epub')) {
        book = await parseEpub(file);
      } else if (file.name.endsWith('.txt')) {
        book = await parseTxt(file);
      } else {
        // Custom alert could be added here, but for now just console error
        console.error('Unsupported file format. Please upload .epub or .txt');
        return;
      }
      
      await storage.saveBook(book);
      await loadBooks();
    } catch (error) {
      console.error('Error parsing book:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const confirmDelete = async () => {
    if (bookToDelete) {
      await storage.deleteBook(bookToDelete);
      await loadBooks();
      setBookToDelete(null);
    }
  };

  const filteredBooks = books.filter(book => {
    if (activeTab === 'favorites') return book.isFavorite;
    if (activeTab === 'reading') return book.status === 'reading' || (!book.status && book.currentChapterIndex > 0);
    if (activeTab === 'finished') return book.status === 'finished';
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Delete Book?</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to remove this book from your library? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setBookToDelete(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-[25px] md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight truncate">My Library</h1>
        </div>
        
        <div className="flex justify-center shrink-0 px-2 gap-2">
          <button 
            onClick={() => setShowSyncModal(true)}
            title="Sync Settings"
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-700 dark:text-gray-300"
          >
            <RefreshCw size={20} />
          </button>
          <button 
            onClick={toggleDarkMode} 
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            {isDarkMode ? <Sun size={20} className="text-gray-300" /> : <Moon size={20} className="text-gray-700" />}
          </button>
        </div>
        
        <div className="flex items-center justify-end flex-1">
          <input 
            type="file" 
            accept=".epub,.txt" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 md:gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 md:px-4 md:py-2 rounded-full font-medium transition-colors disabled:opacity-50 text-sm md:text-base"
          >
            <Upload size={18} />
            <span className="hidden sm:inline">{isUploading ? 'Importing...' : 'Import Book'}</span>
            <span className="sm:hidden">{isUploading ? '...' : 'Import'}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4 mb-4 hide-scrollbar">
        {(['all', 'reading', 'finished', 'favorites'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab 
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {filteredBooks.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <BookIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No books found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {activeTab === 'all' ? 'Import an EPUB or TXT file to start listening.' : `No books in ${activeTab} category.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredBooks.map(book => (
            <div 
              key={book.id} 
              onClick={() => onOpenBook(book.id)}
              className="group cursor-pointer flex flex-col"
            >
              <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden mb-3 relative shadow-sm group-hover:shadow-md transition-shadow">
                {book.cover ? (
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-800 text-blue-200 dark:text-gray-600">
                    <BookIcon size={48} />
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-white/90 dark:bg-gray-800/90 rounded-full p-3 text-gray-900 dark:text-white">
                    <Play size={24} className="ml-1" />
                  </div>
                </div>

                <div className="absolute top-2 right-2 flex flex-col gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setBookToDelete(book.id); }}
                    className="p-2 bg-white/80 dark:bg-gray-800/80 hover:bg-red-50 dark:hover:bg-red-900/50 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-full md:opacity-0 md:group-hover:opacity-100 transition-all"
                    title="Delete book"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(book, null, 2));
                      const downloadAnchorNode = document.createElement('a');
                      downloadAnchorNode.setAttribute("href",     dataStr);
                      downloadAnchorNode.setAttribute("download", book.title + ".json");
                      document.body.appendChild(downloadAnchorNode); // required for firefox
                      downloadAnchorNode.click();
                      downloadAnchorNode.remove();
                    }}
                    className="p-2 bg-white/80 dark:bg-gray-800/80 hover:bg-blue-50 dark:hover:bg-blue-900/50 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-full md:opacity-0 md:group-hover:opacity-100 transition-all"
                    title="Export book data"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  </button>
                  {book.sourceUrl && (
                    <button 
                      onClick={(e) => handleRefreshBook(e, book)}
                      disabled={refreshingBookId === book.id}
                      className="p-2 bg-white/80 dark:bg-gray-800/80 hover:bg-blue-50 dark:hover:bg-blue-900/50 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-full md:opacity-0 md:group-hover:opacity-100 transition-all disabled:opacity-50"
                      title="Check for new chapters"
                    >
                      {refreshingBookId === book.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                    </button>
                  )}
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      const updatedBook = { ...book, isFavorite: !book.isFavorite };
                      await storage.saveBook(updatedBook);
                      loadBooks();
                    }}
                    className={`p-2 bg-white/80 dark:bg-gray-800/80 hover:bg-yellow-50 dark:hover:bg-yellow-900/50 rounded-full md:opacity-0 md:group-hover:opacity-100 transition-all ${book.isFavorite ? 'text-yellow-500 md:opacity-100' : 'text-gray-600 dark:text-gray-300 hover:text-yellow-500'}`}
                    title={book.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={book.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  </button>
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newStatus = book.status === 'finished' ? 'reading' : 'finished';
                      const updatedBook = { ...book, status: newStatus };
                      await storage.saveBook(updatedBook);
                      loadBooks();
                    }}
                    className={`p-2 bg-white/80 dark:bg-gray-800/80 hover:bg-green-50 dark:hover:bg-green-900/50 rounded-full md:opacity-0 md:group-hover:opacity-100 transition-all ${book.status === 'finished' ? 'text-green-500 md:opacity-100' : 'text-gray-600 dark:text-gray-300 hover:text-green-500'}`}
                    title={book.status === 'finished' ? "Mark as reading" : "Mark as finished"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  </button>
                </div>
              </div>
              <h3 className="text-[14px] md:text-base font-medium text-gray-900 dark:text-white line-clamp-2 leading-tight mb-1">{book.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{book.author}</p>
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {book.chapters.length} chapters
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
