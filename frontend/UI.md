I want you to build the frontend for a distributed video transcoding and streaming platform.

The backend will eventually use FastAPI, Kafka, PostgreSQL, S3, FFmpeg and CloudFront. For now, ONLY build the frontend and create clean abstractions/interfaces for future backend integration. Do not implement or mock backend infrastructure inside the frontend.

==================================================
1. TECH STACK
==================================================

Use:

- Next.js with App Router
- TypeScript
- Tailwind CSS
- Aceternity UI components where they genuinely improve the interface
- shadcn/ui for standard UI primitives if needed
- Lucide React for icons
- Framer Motion / Motion for subtle animations
- hls.js for eventual HLS playback
- react-dropzone for video drag-and-drop
- sonner for toast notifications

Install only libraries that are actually required.

Before coding, install the required dependencies using the package manager already being used by the project.

Do NOT introduce unnecessary state-management libraries such as Redux.

Use React state/context where necessary. We will introduce something stronger later only if there is an actual need.

==================================================
2. PRODUCT / DESIGN DIRECTION
==================================================

The application is a professional distributed video processing platform.

It should feel like a real developer/infrastructure product rather than a college project.

Design principles:

- Clean
- Minimal
- Professional
- Developer-oriented
- Consistent
- Spacious
- Strong typography
- One coherent visual theme
- No visual clutter
- No excessive gradients
- No excessive glassmorphism
- No random colors
- No huge hero sections
- No unnecessary animations
- No excessive rounded cards everywhere
- No emoji icons
- No fake analytics

Use Aceternity-style visual elements ONLY where they add something meaningful.

Fancy elements should be reserved for:
- upload interaction
- processing animation
- loading states
- subtle page transitions
- important status visualization

Everything else should remain restrained.

Use one dark theme initially.

Suggested visual direction:
near-black/slate background,
slightly lighter surfaces,
subtle borders,
white/off-white primary text,
muted secondary text,
one consistent accent color.

Keep the same spacing, border radius, typography hierarchy and accent treatment throughout the application.

==================================================
3. APPLICATION STRUCTURE
==================================================

Create these primary routes:

/
    Dashboard / video library

/upload
    Upload new video

/video/[id]
    Video processing / playback page

Do NOT create unnecessary pages.

Use a persistent minimal sidebar or top navigation containing:

- Product logo/name
- Library
- Upload

Keep navigation compact.

==================================================
4. DASHBOARD / LIBRARY
==================================================

The home page should show the user's uploaded videos.

Header:

"Video Library"

Small secondary text explaining that uploaded videos are processed into adaptive streaming renditions.

Include a prominent but clean:
"Upload Video"
button.

Display videos using a responsive grid/list.

Each VideoCard should contain:

- thumbnail placeholder
- filename/title
- original resolution if known
- file size
- upload date
- duration
- processing status

Possible statuses:

UPLOADING
QUEUED
PROCESSING
READY
FAILED

Status indicators must be visually consistent.

For PROCESSING videos, show useful information such as:

Processing
720p completed
1080p processing
480p completed

Do not show meaningless progress percentages unless actual backend progress exists.

Empty state:

If no videos exist, create a polished empty state directing the user toward uploading their first video.

==================================================
5. UPLOAD PAGE
==================================================

This should be one of the strongest pieces of the UI.

Create a large but restrained drag-and-drop upload zone.

Support:

- drag and drop
- click to browse
- video files only
- selected file preview information

After selecting a file show:

Filename
File size
Video type

If browser metadata is available:
Duration
Resolution

Provide:

"Start Upload"

button.

The future architecture will be:

Browser
    ↓
FastAPI requests presigned URL
    ↓
Browser uploads DIRECTLY to S3

Therefore design the frontend upload logic so this can later be connected cleanly.

Do NOT upload large video bytes through Next.js API routes.

Create a unique upload progress UI.

Example:

Uploading video

██████████████░░░░░ 72%

342 MB / 475 MB

But keep it professional rather than flashy.

After upload completion transition into:

Upload complete
Preparing processing jobs...

Then navigate to the video processing page.

For now use clearly isolated mock/demo data where backend data would normally exist.

Do NOT scatter hardcoded mock values throughout components.

==================================================
6. VIDEO DETAILS / PROCESSING PAGE
==================================================

Route:

/video/[id]

This page should visually demonstrate the distributed processing lifecycle.

Top section:

Video title
Original file information
Overall processing status

Main section:

Video preview/player area.

If processing is incomplete, instead of showing a broken player create a polished processing state.

Example:

Preparing your video

Transcoding into streaming formats...

Below it show rendition jobs:

480p      Ready
720p      Processing
1080p     Queued

Each rendition should have:

resolution
status
optional processing time
error state if processing failed

Use subtle animations for active processing.

Do NOT fake constantly changing percentages.

Once status becomes READY, render the HLS video player.

==================================================
7. HLS PLAYER
==================================================

Create an abstract reusable:

components/video/video-player.tsx

Use native HLS where supported and hls.js otherwise.

The component should eventually accept something similar to:

<VideoPlayer
    src={masterPlaylistUrl}
/>

Do not hardcode CloudFront/S3 URLs.

The backend will eventually return the playback URL.

Handle:

- loading
- playback error
- unsupported browser
- missing URL

cleanly.

==================================================
8. COMPONENT ARCHITECTURE
==================================================

Keep components small and understandable.

Suggested structure:

components/
    layout/
        navbar.tsx
        sidebar.tsx

    video/
        video-card.tsx
        video-grid.tsx
        video-player.tsx
        video-status-badge.tsx
        rendition-status.tsx

    upload/
        video-dropzone.tsx
        upload-progress.tsx
        selected-video.tsx

    processing/
        processing-state.tsx
        processing-animation.tsx

    ui/
        reusable generic primitives

Do NOT over-abstract.

A component should be extracted when:
- it has clear responsibility
- it is reused
- or extracting it significantly improves readability

Avoid creating wrappers around wrappers around wrappers.

==================================================
9. DATA TYPES
==================================================

Create centralized TypeScript models.

Example:

type VideoStatus =
    | "uploading"
    | "queued"
    | "processing"
    | "ready"
    | "failed";

type RenditionStatus =
    | "queued"
    | "processing"
    | "ready"
    | "failed";

interface Video {
    id: string;
    filename: string;
    size: number;
    duration?: number;
    width?: number;
    height?: number;
    status: VideoStatus;
    thumbnailUrl?: string;
    playbackUrl?: string;
    createdAt: string;
    renditions: Rendition[];
}

interface Rendition {
    resolution: "480p" | "720p" | "1080p";
    status: RenditionStatus;
    processingTime?: number;
}

Place models somewhere such as:

types/video.ts

==================================================
10. API ABSTRACTION
==================================================

Prepare a clean API layer.

For example:

lib/api/videos.ts

Future functions:

createVideo()
getVideos()
getVideo(id)
requestUploadUrl()
completeUpload()

Components should NOT directly contain fetch calls everywhere.

All backend communication should eventually pass through this layer.

For now, create a clean development/mock implementation so the frontend can be demonstrated without FastAPI.

Keep replacing the mock API with FastAPI later extremely straightforward.

==================================================
11. ENVIRONMENT VARIABLES
==================================================

All configurable URLs must come from environment variables.

Use .env.local for local frontend configuration.

For example:

NEXT_PUBLIC_API_URL=

Do NOT hardcode:

localhost URLs
AWS URLs
S3 bucket names
CloudFront URLs
API endpoints tied to environments

Never expose AWS secrets or backend credentials through NEXT_PUBLIC variables.

Only browser-safe configuration belongs in Next.js public environment variables.

==================================================
12. LOADING / ERROR STATES
==================================================

This is important.

Every page that loads remote information must have:

- loading state
- empty state
- error state
- success state

Create proper skeletons instead of generic "Loading..." text.

For video processing, create a unique but subtle animation that visually suggests chunks/jobs being processed.

Do not use a generic spinning loader everywhere.

==================================================
13. RESPONSIVENESS
==================================================

The application should work properly on:

- desktop
- laptop
- tablet
- mobile

Desktop is the priority, but mobile must not break.

Upload controls and video player must resize correctly.

==================================================
14. CODE QUALITY
==================================================

Use:

- strict TypeScript
- meaningful names
- clean folder structure
- reusable components
- server components where appropriate
- client components only where browser interaction/state requires them

Do not put "use client" everywhere.

Avoid:
- giant components
- duplicated UI
- inline hardcoded configuration
- unnecessary useEffects
- unnecessary dependencies
- premature abstractions

==================================================
15. IMPORTANT SCOPE LIMIT
==================================================

DO NOT implement:

- authentication
- payments
- user profiles
- admin panel
- Kafka
- FastAPI
- PostgreSQL
- AWS SDK backend logic
- actual transcoding
- fake complex analytics

Those belong to later stages.

The frontend should simply be designed so those systems can be connected cleanly.

==================================================
16. FINAL RESULT
==================================================

When finished I should be able to:

1. Open the Video Library
2. Navigate to Upload
3. Drag/select a video
4. See its metadata
5. Simulate upload progress
6. Navigate to its processing page
7. See 480p / 720p / 1080p processing states
8. See the completed video player state
9. Navigate back to my video library

The result should look production-quality but remain easy for another developer to understand.

Before implementing, inspect the existing scaffold and preserve its conventions where reasonable.

Then:
1. install dependencies
2. establish theme/design tokens
3. create types
4. create reusable components
5. build pages
6. add mock API/data layer
7. verify responsive behavior
8. run lint/typecheck/build
9. fix all issues before finishing

Do not modify unrelated files unnecessarily.