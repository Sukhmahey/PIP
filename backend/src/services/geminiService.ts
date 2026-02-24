import DailyArticle from '../models/DailyArticle';
import { getRandomArticle } from '../data/articles';

interface GeneratedArticle {
  title: string;
  content: string;
  keywords: string[];
  readTime: number;
  author?: string;
  sourceUrl?: string;
}

export const generateDailyArticle = async (): Promise<GeneratedArticle> => {
  console.log('� Fetching article from hardcoded collection...');

  // Fetch last 30 titles to avoid repeats
  const recent = await DailyArticle.find({}, { title: 1 })
    .sort({ date: -1 })
    .limit(30)
    .lean();
  const recentTitles = recent.map((r: any) => r.title).filter(Boolean);

  try {
    // Get a random article that hasn't been used recently
    const article = getRandomArticle(recentTitles);

    console.log('✅ Selected article:', article.title);

    // Calculate read time based on content
    const wordCount = article.content.split(/\s+/).length;
    const readTime = Math.max(1, Math.ceil(wordCount / 180));

    console.log('📊 Word count:', wordCount, '| Read time:', readTime, 'min');

    return {
      title: article.title,
      content: article.content,
      keywords: article.keywords || [],
      readTime,
      author: article.author || 'Anonymous',
      sourceUrl: article.sourceUrl || ''
    };
  } catch (error: any) {
    console.error('❌ Error fetching article:', error.message);
    throw new Error('Failed to fetch article from collection');
  }
};
