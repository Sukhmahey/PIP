interface Question {
    order: number;
    text: string;
    videoUrl: string;
}
/**
 * Generate and store videos for questions
 * @param questions - Array of questions with placeholder videoUrls
 * @param userId - MongoDB ObjectId string
 * @param scenarioId - MongoDB ObjectId string
 * @param level - Level number (2 or 3)
 * @param sourceImageUrl - Optional custom avatar image URL
 * @returns Updated questions array with D-ID video URLs
 */
export declare function generateAndStoreVideos(questions: Question[], userId: string, scenarioId: string, level: 2 | 3, sourceImageUrl?: string): Promise<Question[]>;
export {};
//# sourceMappingURL=videoStorageService.d.ts.map