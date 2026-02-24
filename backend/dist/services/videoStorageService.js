"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndStoreVideos = generateAndStoreVideos;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const stream_1 = require("stream");
const fs_2 = require("fs");
dotenv_1.default.config();
const streamPipeline = (0, util_1.promisify)(stream_1.pipeline);
// D-ID API configuration
const DID_API_KEY = process.env.DID_API_KEY || process.env.AVATAR_API_KEY;
// Avatar images for different levels
const AVATAR_IMAGE_LEVEL2 = 'https://tiapdsojkbqjucmjmjri.supabase.co/storage/v1/object/public/images/HitinaV2Female.png';
const AVATAR_IMAGE_LEVEL3 = 'https://create-images-results.d-id.com/api_docs/assets/noelle.jpeg';
// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://tiapdsojkbqjucmjmjri.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not found. Video uploads will fail.');
}
if (!DID_API_KEY) {
    console.warn('⚠️ DID_API_KEY or AVATAR_API_KEY not found. Video generation will fail.');
}
const supabase = supabaseServiceKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
    : null;
const BUCKET_NAME = 'videos';
const TEMP_DIR = path_1.default.join(process.cwd(), 'temp-videos');
// Ensure temp directory exists
if (!fs_1.default.existsSync(TEMP_DIR)) {
    fs_1.default.mkdirSync(TEMP_DIR, { recursive: true });
}
/**
 * Sleep/delay utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error) {
    const errorMessage = error?.message || '';
    const errorText = error?.toString() || '';
    return (errorMessage.includes('429') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests') ||
        errorText.includes('429') ||
        errorText.includes('rate limit') ||
        errorText.includes('too many requests'));
}
/**
 * Check if error is a retryable server error (5xx errors)
 */
function isRetryableError(error, statusCode) {
    if (statusCode && statusCode >= 500 && statusCode < 600) {
        return true;
    }
    const errorMessage = error?.message || '';
    const errorText = error?.toString() || '';
    return (errorMessage.includes('500') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503') ||
        errorMessage.includes('504') ||
        errorMessage.includes('Internal Server Error') ||
        errorMessage.includes('UnknownError') ||
        errorText.includes('500') ||
        errorText.includes('Internal Server Error'));
}
/**
 * Generate a video using D-ID API with retry logic and rate limit handling
 */
async function generateDIDVideo(text, sourceImageUrl, retryCount = 0, maxRetries = 3) {
    if (!DID_API_KEY) {
        throw new Error('DID_API_KEY not configured');
    }
    const auth = 'Basic ' + Buffer.from(`${DID_API_KEY}:`).toString('base64');
    try {
        // Create talk
        const createResponse = await fetch('https://api.d-id.com/talks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: auth,
            },
            body: JSON.stringify({
                script: {
                    type: 'text',
                    input: text,
                    provider: { type: 'microsoft', voice_id: 'en-US-JennyNeural' },
                },
                source_url: sourceImageUrl,
                config: { stitch: true },
            }),
        });
        // Handle rate limit errors
        if (createResponse.status === 429) {
            const retryAfter = createResponse.headers.get('retry-after');
            const waitTime = retryAfter
                ? parseInt(retryAfter) * 1000
                : (retryCount + 1) * 10000; // Default: 10s, 20s, 30s
            if (retryCount < maxRetries) {
                console.log(`⏳ Rate limited. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
                await sleep(waitTime);
                return generateDIDVideo(text, sourceImageUrl, retryCount + 1, maxRetries);
            }
            else {
                throw new Error('Rate limit exceeded. Max retries reached.');
            }
        }
        // Handle server errors (5xx) - retry with exponential backoff
        if (createResponse.status >= 500 && createResponse.status < 600) {
            const errorText = await createResponse.text();
            if (retryCount < maxRetries) {
                const waitTime = (retryCount + 1) * 15000; // 15s, 30s, 45s for server errors
                console.log(`⏳ D-ID server error (${createResponse.status}). Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
                console.log(`   Error details: ${errorText.substring(0, 200)}`);
                await sleep(waitTime);
                return generateDIDVideo(text, sourceImageUrl, retryCount + 1, maxRetries);
            }
            else {
                throw new Error(`D-ID server error (${createResponse.status}): ${errorText}`);
            }
        }
        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Create talk failed (${createResponse.status}): ${errorText}`);
        }
        const { id } = await createResponse.json();
        if (!id) {
            throw new Error('No talk id returned');
        }
        // Poll for video completion
        const maxTries = 120; // 4 minutes max
        for (let tries = 0; tries < maxTries; tries++) {
            await sleep(2000); // Wait 2 seconds between polls
            const statusResponse = await fetch(`https://api.d-id.com/talks/${id}`, {
                headers: { Authorization: auth },
            });
            // Handle rate limit during polling
            if (statusResponse.status === 429) {
                const retryAfter = statusResponse.headers.get('retry-after');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 10000;
                console.log(`⏳ Rate limited during polling. Waiting ${waitTime / 1000}s...`);
                await sleep(waitTime);
                continue; // Retry the same poll
            }
            // Handle server errors during polling
            if (statusResponse.status >= 500 && statusResponse.status < 600) {
                const errorText = await statusResponse.text();
                console.log(`⏳ Server error during polling (${statusResponse.status}). Waiting 10s before retry...`);
                console.log(`   Error: ${errorText.substring(0, 200)}`);
                await sleep(10000);
                continue; // Retry the same poll
            }
            if (!statusResponse.ok) {
                const errorText = await statusResponse.text();
                throw new Error(`Status check failed (${statusResponse.status}): ${errorText}`);
            }
            const statusData = await statusResponse.json();
            if (statusData.status === 'done' && statusData.result_url) {
                return statusData.result_url;
            }
            if (statusData.status === 'error') {
                throw new Error(statusData.error?.description || statusData.error || 'D-ID job error');
            }
        }
        throw new Error('Timed out waiting for video (4 minutes)');
    }
    catch (error) {
        // Retry on rate limit errors
        if (isRateLimitError(error) && retryCount < maxRetries) {
            const waitTime = (retryCount + 1) * 10000; // Exponential backoff: 10s, 20s, 30s
            console.log(`⏳ Rate limit error. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
            await sleep(waitTime);
            return generateDIDVideo(text, sourceImageUrl, retryCount + 1, maxRetries);
        }
        // Retry on server errors (5xx)
        if (isRetryableError(error) && retryCount < maxRetries) {
            const waitTime = (retryCount + 1) * 15000; // Exponential backoff: 15s, 30s, 45s
            console.log(`⏳ Server error detected. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries}...`);
            console.log(`   Error: ${error?.message?.substring(0, 200)}`);
            await sleep(waitTime);
            return generateDIDVideo(text, sourceImageUrl, retryCount + 1, maxRetries);
        }
        throw error;
    }
}
/**
 * Download video from URL to temporary file
 */
async function downloadVideo(url, filePath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }
    if (!response.body) {
        throw new Error('Response body is null');
    }
    const fileStream = (0, fs_2.createWriteStream)(filePath);
    // @ts-ignore - response.body is a ReadableStream in Node.js 18+
    await streamPipeline(response.body, fileStream);
}
/**
 * Upload video to Supabase storage
 */
async function uploadToSupabase(filePath, storagePath) {
    if (!supabase) {
        throw new Error('Supabase client not initialized');
    }
    const fileBuffer = fs_1.default.readFileSync(filePath);
    // Upload file
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true, // Overwrite if exists
    });
    if (error) {
        throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }
    // Get public URL
    const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);
    if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL from Supabase');
    }
    return urlData.publicUrl;
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
async function generateAndStoreVideos(questions, userId, scenarioId, level, sourceImageUrl) {
    // Use level-specific avatar image if not provided
    const avatarImageUrl = sourceImageUrl || (level === 2 ? AVATAR_IMAGE_LEVEL2 : AVATAR_IMAGE_LEVEL3);
    if (!DID_API_KEY) {
        console.error('❌ DID_API_KEY not configured. Skipping video generation.');
        return questions; // Return original questions with placeholder URLs
    }
    // Supabase check removed - we're using D-ID URLs directly
    // if (!supabase) {
    //   console.error('❌ Supabase not configured. Skipping video upload.');
    //   return questions;
    // }
    const updatedQuestions = [];
    // Rate limiting: Process videos one at a time with delays
    const DELAY_BETWEEN_VIDEOS = 500; // 5 seconds between video generation requests
    const DELAY_AFTER_ERROR = 10000; // 10 seconds after an error
    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        // Add delay before each video (except the first one)
        if (i > 0) {
            console.log(`⏳ Waiting ${DELAY_BETWEEN_VIDEOS / 1000}s before next video to avoid rate limits...`);
            await sleep(DELAY_BETWEEN_VIDEOS);
        }
        try {
            console.log(`🎬 Generating video ${i + 1}/${questions.length} for question ${question.order}: "${question.text.substring(0, 50)}..."`);
            // Generate video using D-ID (with built-in retry logic)
            const didVideoUrl = await generateDIDVideo(question.text, avatarImageUrl);
            // Save D-ID URL directly to question (no download/upload needed)
            updatedQuestions.push({
                ...question,
                videoUrl: didVideoUrl,
            });
            console.log(`✅ Video generated successfully, using D-ID URL: ${didVideoUrl}`);
            // COMMENTED OUT: Download and upload to Supabase
            // // Create filename: {userId}_{scenarioId}_{level}_{order}.mp4
            // const fileName = `${userId}_${scenarioId}_level${level}_${question.order}.mp4`;
            // const storagePath = `avatar-videos/${userId}/${scenarioId}/${level}/${fileName}`;
            // const tempFilePath = path.join(TEMP_DIR, fileName);
            // try {
            //   // Download video from D-ID
            //   console.log(`📥 Downloading video from D-ID...`);
            //   await downloadVideo(didVideoUrl, tempFilePath);
            //   // Upload to Supabase
            //   console.log(`☁️ Uploading to Supabase: ${storagePath}`);
            //   const publicUrl = await uploadToSupabase(tempFilePath, storagePath);
            //   // Update question with Supabase URL
            //   updatedQuestions.push({
            //     ...question,
            //     videoUrl: publicUrl,
            //   });
            //   console.log(`✅ Video stored successfully: ${publicUrl}`);
            //   // Clean up temp file
            //   try {
            //     fs.unlinkSync(tempFilePath);
            //   } catch (cleanupError) {
            //     console.warn(`⚠️ Failed to delete temp file: ${cleanupError}`);
            //   }
            // } catch (error: any) {
            //   console.error(
            //     `❌ Failed to process video for question ${question.order}:`,
            //     error.message,
            //   );
            //   // Keep original placeholder URL
            //   updatedQuestions.push(question);
            //   // Wait after error to avoid hammering the API
            //   await sleep(DELAY_AFTER_ERROR);
            // }
        }
        catch (error) {
            const isRateLimit = isRateLimitError(error);
            console.error(`❌ Failed to generate video for question ${question.order}: ${error.message}`, isRateLimit ? '(Rate limit - will wait longer before next video)' : '');
            // Keep original placeholder URL
            updatedQuestions.push(question);
            // If rate limited, wait longer before next video
            const waitTime = isRateLimit ? DELAY_AFTER_ERROR * 2 : DELAY_AFTER_ERROR;
            console.log(`⏳ Waiting ${waitTime / 1000}s before next video...`);
            await sleep(waitTime);
        }
    }
    return updatedQuestions;
}
//# sourceMappingURL=videoStorageService.js.map