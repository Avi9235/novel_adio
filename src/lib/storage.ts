import { get, set, del, keys } from 'idb-keyval';

export interface Chapter {
  id: string;
  title: string;
  text: string;
  url?: string; // For web scraping
}

export interface Bookmark {
  id: string;
  chapterIndex: number;
  position: number;
  textSnippet: string;
  timestamp: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  chapters: Chapter[];
  currentChapterIndex: number;
  currentPosition: number; // character index in the current chapter
  addedAt: number;
  bookmarks?: Bookmark[];
  sourceUrl?: string; // To identify web novels
  isFavorite?: boolean;
  status?: 'reading' | 'finished' | 'plan_to_read';
}

export const storage = {
  async getBooks(): Promise<Book[]> {
    const bookKeys = await keys();
    const books: Book[] = [];
    for (const key of bookKeys) {
      if (typeof key === 'string' && key.startsWith('book_')) {
        const book = await get<Book>(key);
        if (book) books.push(book);
      }
    }
    return books.sort((a, b) => b.addedAt - a.addedAt);
  },

  async getBook(id: string): Promise<Book | undefined> {
    return get<Book>(`book_${id}`);
  },

  async saveBook(book: Book): Promise<void> {
    await set(`book_${book.id}`, book);
  },

  async deleteBook(id: string): Promise<void> {
    await del(`book_${id}`);
  },

  async updateProgress(id: string, chapterIndex: number, position: number): Promise<void> {
    const book = await this.getBook(id);
    if (book) {
      book.currentChapterIndex = chapterIndex;
      book.currentPosition = position;
      await this.saveBook(book);
    }
  }
};
