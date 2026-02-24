/**
 * Hardcoded articles for daily delivery
 * Each article focuses on social anxiety and personal growth
 */
export interface Article {
    title: string;
    content: string;
    keywords: string[];
    author: string;
    sourceUrl: string;
}
export declare const ARTICLES: Article[];
/**
 * Get a random article that hasn't been used recently
 */
export declare const getRandomArticle: (excludeTitles: string[]) => Article;
//# sourceMappingURL=articles.d.ts.map