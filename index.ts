import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Options for image compression
 */
interface CompressionOptions {
    /**
     * Compression quality percentage (0-100)
     */
    compressionPercentage: number;
    /**
     * Optional custom output path
     */
    outputPath?: string;
    /**
     * Optional lossless compression (default: false)
     */
    lossless?: boolean;
}

/**
 * Compress an image to AVIF format with specified options
 * 
 * @param inputPath - Path to the input image file
 * @param options - Compression options
 * @returns Promise resolving to the path of the compressed AVIF file
 */
async function compressToAvif(
    inputPath: string,
    options: CompressionOptions
): Promise<string> {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
        throw new Error('Input file does not exist');
    }

    // Destructure options with default values
    const {
        compressionPercentage,
        outputPath: customOutputPath,
        lossless = false
    } = options;

    // Validate compression percentage
    if (compressionPercentage < 0 || compressionPercentage > 100) {
        throw new Error('Compression percentage must be between 0 and 100');
    }

    // Calculate Sharp quality (Sharp uses inverse scale where lower is worse quality)
    const sharpQuality = Math.round(100 - compressionPercentage);

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'compressed');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate output path if not provided
    const outputPath = customOutputPath || path.join(
        outputDir,
        `${path.parse(inputPath).name}_compressed_${compressionPercentage}%.avif`
    );

    try {
        // Compress and convert to AVIF
        await sharp(inputPath)
            .avif({
                quality: sharpQuality,
                lossless
            })
            .toFile(outputPath);

        return outputPath;
    } catch (error) {
        console.error('Compression failed:', error);
        throw error;
    }
}

// Server implementation
const server = Bun.serve({
    port: 3000,
    async fetch(req, server) {
        // Handle file compression route
        if (req.method === 'POST' && new URL(req.url).pathname === '/compress') {
            return handleCompression(req);
        }

        // Serve the HTML file for the root route
        if (req.method === 'GET' && new URL(req.url).pathname === '/') {
            return new Response(Bun.file('index.html'), {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        // 404 for other routes
        return new Response('Not Found', { status: 404 });
    }
});

/**
 * Handle image compression request
 * @param req - Incoming request
 * @returns Response with compressed image
 */
async function handleCompression(req: Request): Promise<Response> {
    try {
        // Parse form data
        const formData = await req.formData();
        const image = formData.get('image') as File;
        const compressionPercentage = parseInt(formData.get('compressionPercentage') as string);

        // Save uploaded file temporarily
        const inputPath = await saveTemporaryFile(image);

        // Compress image
        const outputPath = await compressToAvif(inputPath, {
            compressionPercentage,
            lossless: false
        });

        // Return compressed image
        return new Response(Bun.file(outputPath), {
            headers: {
                'Content-Type': 'image/avif',
                'Content-Disposition': `attachment; filename=compressed.avif`
            }
        });
    } catch (error) {
        console.error('Compression error:', error);
        return new Response('Compression failed', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Save uploaded file to a temporary location
 * @param file - Uploaded file
 * @returns Path to saved file
 */
async function saveTemporaryFile(file: File): Promise<string> {
    // Ensure temporary directory exists
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Generate unique filename
    const tempPath = path.join(tmpDir, `${Date.now()}_${file.name}`);

    // Write file
    await Bun.write(tempPath, file);

    return tempPath;
}

// Cleanup temporary and compressed files periodically
setInterval(() => {
    const tmpDir = path.join(process.cwd(), 'tmp');
    const compressedDir = path.join(process.cwd(), 'compressed');

    // Remove files older than 1 hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    [tmpDir, compressedDir].forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(file => {
                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);

                if (stats.mtime.getTime() < oneHourAgo) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (error) {
                        console.error(`Error deleting ${filePath}:`, error);
                    }
                }
            });
        }
    });
}, 60 * 60 * 1000); // Run every hour

console.log(`Visit: http://localhost:${server.port}`);
