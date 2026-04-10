import { collection, doc, setDoc, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import { storage, Book } from './storage';

let unsubscribe: (() => void) | null = null;
let currentSyncCode: string | null = null;

// Helper to strip chapter text before saving to Firestore to stay under 1MB limit
const stripChapterText = (book: Book): Book => {
  return {
    ...book,
    chapters: book.chapters.map(ch => ({ ...ch, text: '' }))
  };
};

export const syncService = {
  getSyncCode: () => {
    return localStorage.getItem('novel_sync_code');
  },

  setSyncCode: async (code: string) => {
    if (!code) {
      localStorage.removeItem('novel_sync_code');
      syncService.stopSync();
      return;
    }
    localStorage.setItem('novel_sync_code', code);
    await syncService.startSync(code);
  },

  startSync: async (code: string) => {
    if (unsubscribe) {
      unsubscribe();
    }
    currentSyncCode = code;

    // Wait for auth to be ready
    if (!auth.currentUser) {
      await new Promise(resolve => {
        const unsubAuth = auth.onAuthStateChanged(user => {
          if (user) {
            unsubAuth();
            resolve(user);
          }
        });
      });
    }

    const booksRef = collection(db, 'libraries', code, 'books');

    // Initial sync: Local to Cloud (for books that aren't in cloud yet)
    const localBooks = await storage.getBooks();
    const cloudDocs = await getDocs(booksRef);
    const cloudBookIds = new Set(cloudDocs.docs.map(d => d.id));

    for (const localBook of localBooks) {
      if (!cloudBookIds.has(localBook.id)) {
        await setDoc(doc(booksRef, localBook.id), stripChapterText(localBook));
      }
    }

    // Listen to cloud changes and update local
    unsubscribe = onSnapshot(booksRef, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const cloudBook = change.doc.data() as Book;
          const localBook = await storage.getBook(cloudBook.id);
          
          if (!localBook || localBook.addedAt < cloudBook.addedAt || localBook.currentChapterIndex !== cloudBook.currentChapterIndex || localBook.currentPosition !== cloudBook.currentPosition || localBook.isFavorite !== cloudBook.isFavorite || localBook.status !== cloudBook.status) {
            // Merge cloud book with local chapter text if available
            const mergedBook = { ...cloudBook };
            if (localBook) {
              mergedBook.chapters = mergedBook.chapters.map((ch, idx) => ({
                ...ch,
                text: localBook.chapters[idx]?.text || ch.text
              }));
            }
            // Save to local storage without triggering another cloud sync
            await storage.saveBookLocalOnly(mergedBook);
            // Dispatch event to update UI
            window.dispatchEvent(new Event('library_updated'));
          }
        } else if (change.type === 'removed') {
          await storage.deleteBookLocalOnly(change.doc.id);
          window.dispatchEvent(new Event('library_updated'));
        }
      }
    });
  },

  stopSync: () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    currentSyncCode = null;
  },

  syncBookToCloud: async (book: Book) => {
    const code = syncService.getSyncCode();
    if (!code || !auth.currentUser) return;
    
    try {
      const bookRef = doc(db, 'libraries', code, 'books', book.id);
      await setDoc(bookRef, stripChapterText(book));
    } catch (error) {
      console.error('Failed to sync book to cloud:', error);
    }
  },

  deleteBookFromCloud: async (bookId: string) => {
    const code = syncService.getSyncCode();
    if (!code || !auth.currentUser) return;

    try {
      const bookRef = doc(db, 'libraries', code, 'books', bookId);
      await deleteDoc(bookRef);
    } catch (error) {
      console.error('Failed to delete book from cloud:', error);
    }
  }
};

// Initialize sync if code exists
const existingCode = localStorage.getItem('novel_sync_code');
if (existingCode) {
  syncService.startSync(existingCode).catch(console.error);
}
