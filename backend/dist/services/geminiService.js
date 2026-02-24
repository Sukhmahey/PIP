"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDailyArticle = void 0;
const DailyArticle_1 = __importDefault(require("../models/DailyArticle"));
const articles_1 = require("../data/articles");
const generateDailyArticle = async () => {
    console.log('� Fetching article from hardcoded collection...');
    // Fetch last 30 titles to avoid repeats
    const recent = await DailyArticle_1.default.find({}, { title: 1 })
        .sort({ date: -1 })
        .limit(30)
        .lean();
    const recentTitles = recent.map((r) => r.title).filter(Boolean);
    try {
        // Get a random article that hasn't been used recently
        const article = (0, articles_1.getRandomArticle)(recentTitles);
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
    }
    catch (error) {
        console.error('❌ Error fetching article:', error.message);
        throw new Error('Failed to fetch article from collection');
    }
};
exports.generateDailyArticle = generateDailyArticle;
//# sourceMappingURL=geminiService.js.map