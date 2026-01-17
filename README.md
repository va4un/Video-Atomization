# Video Atom - AI-Powered Video Clipping Platform

An intelligent video processing platform that automatically identifies key moments in long-form videos and generates multi-format clips optimized for different social media platforms.

## 🚀 Features

- **Video Upload**: Accept single long video files (10-30 minute talking-head videos) up to 10GB
- **AI-Powered Transcription**: Generate timestamped transcripts using AssemblyAI
- **Smart Moment Detection**: Automatically identify 3-5 key moments based on topic changes
- **Automated Clipping**: Use ffmpeg to slice exact time ranges from videos
- **Multi-Format Export**: Output each clip in both horizontal (16:9) and vertical (9:16) formats
- **Real-Time Status**: Live processing updates with terminal-style status logs
- **Batch Download**: Download all clips as a single ZIP file

## 📋 Prerequisites

- Node.js 18+ and npm
- Wasabi S3 account (or compatible S3 storage)
- AssemblyAI API key (free tier available)

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd video-atom
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# AssemblyAI API Key (Required)
# Get your free API key at: https://www.assemblyai.com/
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

# Wasabi S3 Configuration (Required)
# Note: Currently configured in code, but can be moved to env vars
WASABI_ACCESS_KEY_ID=your_wasabi_access_key
WASABI_SECRET_ACCESS_KEY=your_wasabi_secret_key
WASABI_BUCKET_NAME=your_bucket_name
WASABI_REGION=ap-southeast-1
WASABI_ENDPOINT=https://s3.ap-southeast-1.wasabisys.com
```

### 4. Get AssemblyAI API Key

1. Visit [AssemblyAI](https://www.assemblyai.com/)
2. Sign up for a free account
3. Navigate to your dashboard and copy your API key
4. Add it to your `.env.local` file

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Build for Production

```bash
npm run build
npm start
```

## 🏗️ System Architecture

### High-Level Flow

```
User Upload → Wasabi S3 → Automatic Processing → Multi-Format Clips → Download
```

### Detailed Architecture

#### 1. **Upload Layer** (`app/api/upload/route.ts`)

- Uses `@better-upload/server` for efficient multipart uploads
- Supports files up to 10GB
- Automatically triggers processing after upload completes
- Uploads directly to Wasabi S3 storage

#### 2. **Processing Pipeline** (`lib/services/process-video.ts`)

The core processing orchestrator that coordinates:

- **Video Download**: Retrieves video from Wasabi S3
- **Audio Extraction**: Uses ffmpeg to extract audio track
- **Transcription**: Sends audio to AssemblyAI for timestamped transcription
- **Moment Detection**: Local algorithm identifies 3-5 key moments
- **Video Clipping**: Creates clips in both 16:9 and 9:16 formats
- **Upload Clips**: Stores processed clips back to Wasabi S3

#### 3. **Transcription Service** (`lib/services/transcript-openai.ts`)

- Extracts audio from video using ffmpeg
- Uploads audio to AssemblyAI
- Receives timestamped transcript with word-level precision
- Detects key moments using local topic-change algorithm

#### 4. **Key Moment Detection** (`lib/services/transcript-openai.ts`)

Local algorithm that identifies key moments based on:

- **Semantic Similarity**: Calculates word overlap between adjacent segments
- **Transition Phrases**: Detects topic change indicators ("now", "next", "however", etc.)
- **Question Patterns**: Identifies questions as potential key moments
- **Distribution**: Ensures moments are well-distributed throughout the video

#### 5. **Video Clipping** (`lib/services/video-clipping.ts`)

- Uses `fluent-ffmpeg` with `ffmpeg-static` for cross-platform support
- Creates clips in two formats simultaneously:
  - **Horizontal (16:9)**: 1920x1080 resolution for YouTube, standard videos
  - **Vertical (9:16)**: 1080x1920 resolution for TikTok, Instagram Reels, YouTube Shorts
- Uses intelligent scaling and padding to maintain aspect ratios

#### 6. **Storage Layer** (`lib/services/wasabi-client.ts`)

- S3-compatible storage operations
- File existence checks for polling
- Object listing for clip detection
- Optimized for frequent status checks

#### 7. **API Endpoints**

- **`/api/upload`**: Handles video uploads via better-upload
- **`/api/processing-status`**: Real-time status checking (optimized for speed)
- **`/api/download-clips`**: Downloads all clips as a ZIP file
- **`/api/retry-process`**: Manual retry for failed processing

#### 8. **UI Components**

- **`/Better-upload`**: Main upload interface with drag-and-drop
- **`ProcessingStatus`**: Real-time status display with terminal-style logs
- Auto-updates every 3 seconds during processing

### Technology Stack

- **Framework**: Next.js 16.1.1 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Video Processing**: ffmpeg (via fluent-ffmpeg)
- **Storage**: Wasabi S3 (S3-compatible)
- **Upload**: @better-upload/server
- **File Compression**: archiver

## 🤖 AI API Choice: AssemblyAI

### Why AssemblyAI?

We chose **AssemblyAI** as our transcription service for several key reasons:

#### 1. **Accuracy & Reliability**

- Industry-leading transcription accuracy
- Handles various accents, languages, and audio qualities
- Word-level timestamp precision for exact clip boundaries

#### 2. **Developer Experience**

- Simple, well-documented SDK
- Straightforward API with clear error handling
- Excellent TypeScript support

#### 3. **Cost-Effectiveness**

- Generous free tier (5 hours/month)
- Transparent pricing model
- Pay-as-you-go for production use
- More cost-effective than alternatives for video transcription

#### 4. **Performance**

- Fast processing times
- Reliable polling mechanism
- Handles long-form content efficiently
- Automatic retry and error handling

#### 5. **Features**

- Automatic word-level timestamps (no extra configuration)
- Supports various audio formats
- Handles large files efficiently
- Real-time status updates

#### 6. **Open Source Alternative**

- Unlike proprietary solutions, AssemblyAI provides an open API
- No vendor lock-in
- Can be easily replaced if needed
- Active community and support

### Comparison with Alternatives

| Feature          | AssemblyAI       | Google Speech-to-Text | AWS Transcribe |
| ---------------- | ---------------- | --------------------- | -------------- |
| Free Tier        | ✅ 5 hours/month | ❌ Limited            | ❌ Limited     |
| Word Timestamps  | ✅ Included      | ✅ Available          | ✅ Available   |
| Ease of Use      | ⭐⭐⭐⭐⭐       | ⭐⭐⭐                | ⭐⭐⭐         |
| Cost             | 💰💰 Low         | 💰💰💰 Medium         | 💰💰💰💰 High  |
| Setup Complexity | ⭐ Very Easy     | ⭐⭐ Moderate         | ⭐⭐ Moderate  |

### Implementation Details

The transcription service (`lib/services/transcript-openai.ts`):

- Extracts audio using ffmpeg (reduces upload size by ~90%)
- Uploads audio file to AssemblyAI
- Polls for completion (max 3 minutes)
- Receives word-level timestamps automatically
- Converts to segment-based format for processing

## 📁 Project Structure

```
video-atom/
├── app/
│   ├── api/
│   │   ├── upload/              # Video upload endpoint
│   │   ├── processing-status/   # Status checking endpoint
│   │   ├── download-clips/      # ZIP download endpoint
│   │   └── retry-process/       # Retry processing endpoint
│   ├── Better-upload/           # Main upload page
│   └── page.tsx                  # Home page
├── lib/
│   ├── services/
│   │   ├── process-video.ts      # Main processing orchestrator
│   │   ├── transcript-openai.ts # AssemblyAI transcription + moment detection
│   │   ├── video-clipping.ts    # Multi-format clip creation
│   │   ├── wasabi-client.ts     # S3 storage operations
│   │   └── ffmpeg.ts            # FFmpeg configuration
│   └── config/
│       └── wasabi.ts            # Wasabi S3 configuration
└── components/
    └── ui/
        ├── processing-status.tsx # Real-time status UI
        └── upload-dropzone.tsx   # Upload component
```

## 🔄 Processing Flow

1. **Upload**: User uploads video → Wasabi S3
2. **Trigger**: Upload completion triggers automatic processing
3. **Download**: Video downloaded from Wasabi for processing
4. **Audio Extraction**: FFmpeg extracts audio track
5. **Transcription**: AssemblyAI generates timestamped transcript
6. **Moment Detection**: Local algorithm identifies 3-5 key moments
7. **Clipping**: FFmpeg creates clips for each moment (both formats)
8. **Upload**: Clips uploaded back to Wasabi S3
9. **Status**: Real-time UI updates show progress
10. **Download**: User can download all clips as ZIP

## 🎯 Key Moments Detection Algorithm

The system uses a local algorithm (no external AI calls) to detect key moments:

1. **Semantic Similarity**: Calculates word overlap between segments
2. **Transition Detection**: Identifies topic change phrases
3. **Question Detection**: Flags questions as potential moments
4. **Scoring**: Combines factors to score topic changes
5. **Distribution**: Selects well-distributed moments (3-5 total)

This approach is:

- **Fast**: No API calls needed
- **Cost-Effective**: No per-request charges
- **Reliable**: Works offline, no external dependencies
- **Customizable**: Easy to tune for different content types

## 📦 Output Format

Each processed video generates:

- **N key moments** → **2N clip files** (N horizontal + N vertical)
- Files named: `clip-{index}-{title}-horizontal.mp4` and `clip-{index}-{title}-vertical.mp4`
- All clips stored in: `clips/{video-name}/` directory in Wasabi

## 🚨 Troubleshooting

### FFmpeg Not Found

- Ensure `ffmpeg-static` is installed: `npm install ffmpeg-static`
- The system automatically resolves the correct path

### AssemblyAI Errors

- Verify your API key is set in `.env.local`
- Check your API quota at https://www.assemblyai.com/dashboard
- Ensure audio extraction is working (check logs)

### Upload Timeout

- Large files may take time to upload
- Processing starts automatically after upload completes
- Check Wasabi bucket permissions

### Clips Not Found

- Processing may still be in progress
- Check server logs for errors
- Use retry endpoint if processing failed

## 📝 License

This project is private and proprietary.

## 🤝 Contributing

This is a private project. For issues or questions, please contact the maintainers.
