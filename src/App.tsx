/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import Discover from './components/Discover';
import { BookOpen, Search } from 'lucide-react';

export default function App() {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'library' | 'discover'>('library');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    localStorage.setItem('darkMode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  if (activeBookId) {
    return (
      <div className={`min-h-screen font-sans transition-colors duration-200 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
        <Reader 
          bookId={activeBookId} 
          onClose={() => setActiveBookId(null)} 
          isDarkMode={isDarkMode}
          toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <main className="flex-1 overflow-y-auto pb-20">
        {currentTab === 'library' ? (
          <Library 
            onOpenBook={setActiveBookId} 
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          />
        ) : (
          <Discover 
            onOpenBook={setActiveBookId} 
            isDarkMode={isDarkMode}
          />
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around p-3 pb-safe z-40">
        <button 
          onClick={() => setCurrentTab('library')}
          className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-colors ${currentTab === 'library' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
        >
          <BookOpen size={24} />
          <span className="text-xs font-medium">Library</span>
        </button>
        <button 
          onClick={() => setCurrentTab('discover')}
          className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-colors ${currentTab === 'discover' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
        >
          <Search size={24} />
          <span className="text-xs font-medium">Discover</span>
        </button>
      </nav>
    </div>
  );
}
