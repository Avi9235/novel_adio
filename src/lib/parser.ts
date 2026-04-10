import ePub from 'epubjs';
import { Book, Chapter } from './storage';

export async function parseEpub(file: File): Promise<Book> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bookData = e.target?.result as ArrayBuffer;
        const epub = ePub(bookData);
        
        await epub.ready;
        
        const metadata = await epub.loaded.metadata;
        const spine = await epub.loaded.spine;
        
        let coverUrl = '';
        try {
          coverUrl = await epub.coverUrl() || '';
        } catch (err) {
          console.warn('Could not load cover', err);
        }

        const chapters: Chapter[] = [];
        
        // Extract text from each spine item
        for (let i = 0; i < spine.length; i++) {
          const item = (spine as any).get ? (spine as any).get(i) : spine[i];
          if (!item) continue;
          const doc = await epub.load(item.href);
          const textContent = (doc as Document).body.textContent || '';
          
          // Basic cleanup of text
          const cleanText = textContent
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
            
          if (cleanText.length > 0) {
            // Try to find a title from the TOC or use a generic one
            const tocItem = epub.navigation.get(item.href);
            const title = tocItem ? tocItem.label : `Chapter ${chapters.length + 1}`;
            
            chapters.push({
              id: item.idref,
              title: title.trim(),
              text: cleanText
            });
          }
        }

        resolve({
          id: crypto.randomUUID(),
          title: metadata.title || file.name.replace('.epub', ''),
          author: metadata.creator || 'Unknown Author',
          cover: coverUrl,
          chapters,
          currentChapterIndex: 0,
          currentPosition: 0,
          addedAt: Date.now()
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function parseTxt(file: File): Promise<Book> {
  const text = await file.text();
  
  // Simple heuristic to split chapters by "Chapter X"
  const chapterRegex = /(?=^Chapter\s+\d+)/gim;
  const parts = text.split(chapterRegex);
  
  const chapters: Chapter[] = [];
  
  if (parts.length <= 1) {
    // No clear chapters found, treat as one big chapter
    chapters.push({
      id: 'ch-1',
      title: 'Chapter 1',
      text: text.trim()
    });
  } else {
    parts.forEach((part, index) => {
      if (part.trim().length === 0) return;
      
      const lines = part.trim().split('\n');
      const title = lines[0].trim();
      const content = lines.slice(1).join('\n').trim();
      
      chapters.push({
        id: `ch-${index}`,
        title: title.length < 100 ? title : `Chapter ${chapters.length + 1}`,
        text: content.length > 0 ? content : part.trim()
      });
    });
  }

  return {
    id: crypto.randomUUID(),
    title: file.name.replace('.txt', ''),
    author: 'Unknown Author',
    chapters,
    currentChapterIndex: 0,
    currentPosition: 0,
    addedAt: Date.now()
  };
}
