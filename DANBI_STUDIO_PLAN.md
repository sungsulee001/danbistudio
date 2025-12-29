# DanbiStudio Development Plan

## Project Overview

**DanbiStudio**: Local GPU-based AI model integration web platform
- **Goal**: User-friendly interface like Kling AI / Pika Labs (but local)
- **Purpose**: Serve as backend engine for automation tools (n8n, Make, Opal)
- **Reference**: EnguiStudio (for UI/UX patterns only, not code reuse)

## Key Differences from EnguiStudio

| Item | EnguiStudio | DanbiStudio |
|------|-------------|-------------|
| Infrastructure | RunPod Serverless | Local GPU (RTX 3090) |
| Backend | RunPod API | StabilityMatrix + ComfyUI |
| Model Management | RunPod Endpoints | Local file system |
| Configuration | RunPod DB | Local SQLite/JSON |
| Target Users | Cloud users | Local + automation tools |

## Tech Stack

```
OS: Windows 11
GPU: RTX 3090 (24GB)
RAM: 128GB

Backend:
├── StabilityMatrix (ComfyUI manager)
├── ComfyUI (workflow engine)
└── Models (local files)

Frontend:
├── Next.js 14 (App Router)
├── TypeScript
├── Tailwind CSS
└── shadcn/ui

Database:
├── SQLite (development)
└── Prisma ORM

API:
├── REST (Next.js API Routes)
└── WebSocket (real-time progress)
```

## System Architecture

```
┌─────────────────────────────────────────┐
│          DanbiStudio Web UI             │
│         (Next.js + TypeScript)          │
└──────────────┬──────────────────────────┘
               │ HTTP/WebSocket
               ↓
┌─────────────────────────────────────────┐
│         API Layer (Next.js)             │
│  ├── /api/models (list models)          │
│  ├── /api/generate (start job)          │
│  ├── /api/status (check progress)       │
│  └── /api/download (get result)         │
└──────────────┬──────────────────────────┘
               │ ComfyUI API
               ↓
┌─────────────────────────────────────────┐
│  StabilityMatrix + ComfyUI (Port 8188)  │
│  ├── Workflow JSON execution            │
│  ├── Model loading                       │
│  └── GPU processing                      │
└─────────────────────────────────────────┘
```

## Phase 1: Environment Setup (Day 1)

### 1.1 StabilityMatrix Installation

**Goal**: Install ComfyUI via StabilityMatrix

**Steps**:
1. Download StabilityMatrix from https://github.com/LykosAI/StabilityMatrix
2. Install to `C:\AI\StabilityMatrix`
3. Create ComfyUI package:
   - Name: `DanbiStudio-ComfyUI`
   - Version: Stable
   - Launch Arguments: `--listen 127.0.0.1 --port 8188`
4. Install custom nodes:
   - ComfyUI-Manager (essential)
   - ComfyUI-WanVideoWrapper (for WAN models)
   - ComfyUI-VideoHelperSuite (for video processing)

**Verification**:
```bash
# Check ComfyUI is running
curl http://localhost:8188/system_stats
# Should return JSON with GPU info
```

### 1.2 Test Workflow Download

**Goal**: Get WAN official workflow and test

**Steps**:
1. Download WAN workflow:
   ```bash
   curl -o wan_i2v_test.json https://raw.githubusercontent.com/Wan-AI/wan2.1-comfyui/main/examples/image2video.json
   ```
2. Open ComfyUI web UI: http://localhost:8188
3. Load workflow: `wan_i2v_test.json`
4. Test run (without model for now)

**Expected**: Workflow loads successfully, shows model missing error (normal)

### 1.3 Model Download

**Goal**: Download WAN 2.1 model for testing

**Model Info**:
- Name: `wan2.1-i2v-14b-480p-fp8-scaled.safetensors`
- Size: ~14GB
- Location: `StabilityMatrix/Data/Packages/DanbiStudio-ComfyUI/models/diffusion_models/`

**Download via StabilityMatrix**:
1. Open StabilityMatrix
2. Model Browser → Search "WAN 2.1"
3. Download to correct folder
4. Wait for completion

**Verification**:
```bash
# Check model exists
dir "C:\AI\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI\models\diffusion_models"
# Should show wan2.1-*.safetensors file
```

---

## Phase 2: Next.js Project Setup (Day 1-2)

### 2.1 Initialize Project

```bash
# Create Next.js project
npx create-next-app@latest danbistudio
# Choose:
# - TypeScript: Yes
# - ESLint: Yes
# - Tailwind CSS: Yes
# - src/ directory: Yes
# - App Router: Yes
# - Import alias: @/*

cd danbistudio
```

### 2.2 Install Dependencies

```bash
# Core dependencies
npm install prisma @prisma/client
npm install @tanstack/react-query
npm install uuid
npm install ws

# UI dependencies
npm install @radix-ui/react-dialog
npm install @radix-ui/react-select
npm install @radix-ui/react-slider
npm install class-variance-authority clsx tailwind-merge

# Dev dependencies
npm install -D @types/uuid @types/ws
```

### 2.3 Project Structure

Create the following structure:

```
danbistudio/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx (home)
│   │   ├── generate/
│   │   │   └── page.tsx (generation UI)
│   │   ├── library/
│   │   │   └── page.tsx (results history)
│   │   ├── settings/
│   │   │   └── page.tsx (configuration)
│   │   └── api/
│   │       ├── models/route.ts (list available models)
│   │       ├── generate/route.ts (start generation)
│   │       ├── status/[id]/route.ts (check progress)
│   │       └── workflows/route.ts (manage workflows)
│   │
│   ├── components/
│   │   ├── ui/ (shadcn components)
│   │   ├── ModelSelector.tsx
│   │   ├── PromptInput.tsx
│   │   ├── GenerationProgress.tsx
│   │   └── ResultGallery.tsx
│   │
│   ├── lib/
│   │   ├── comfyui-client.ts (ComfyUI API wrapper)
│   │   ├── workflow-loader.ts (JSON workflow handling)
│   │   ├── db.ts (Prisma client)
│   │   └── utils.ts (helpers)
│   │
│   └── types/
│       ├── comfyui.ts
│       └── workflow.ts
│
├── prisma/
│   └── schema.prisma
├── workflows/ (ComfyUI workflow JSONs)
│   └── wan_i2v.json
└── public/
    └── outputs/ (generated results)
```

---

## Phase 3: Core Implementation (Day 2-3)

### 3.1 Database Schema

**File**: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model GenerationJob {
  id          String   @id @default(uuid())
  status      String   @default("pending") // pending, running, completed, failed
  modelName   String
  workflowName String
  parameters  String   // JSON string
  promptId    String?  // ComfyUI prompt ID
  resultPath  String?
  error       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  completedAt DateTime?
}

model AppSettings {
  id    String @id @default(uuid())
  key   String @unique
  value String // JSON string
}

model WorkflowPreset {
  id          String   @id @default(uuid())
  name        String
  modelType   String   // "wan_video", "flux_image", etc.
  workflow    String   // JSON workflow
  description String?
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

**Initialize**:
```bash
npx prisma generate
npx prisma db push
```

### 3.2 ComfyUI API Client

**File**: `src/lib/comfyui-client.ts`

```typescript
export class ComfyUIClient {
  private baseUrl: string;
  private ws: WebSocket | null = null;

  constructor(baseUrl = 'http://localhost:8188') {
    this.baseUrl = baseUrl;
  }

  /**
   * Queue a workflow for execution
   */
  async queuePrompt(workflow: any, clientId: string) {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to queue prompt: ${response.statusText}`);
    }

    return response.json(); // { prompt_id: string, number: number }
  }

  /**
   * Get execution history
   */
  async getHistory(promptId: string) {
    const response = await fetch(`${this.baseUrl}/history/${promptId}`);
    if (!response.ok) return null;
    return response.json();
  }

  /**
   * Upload an image
   */
  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    return data.name; // Filename in ComfyUI
  }

  /**
   * Connect WebSocket for real-time updates
   */
  connectWebSocket(clientId: string, onMessage: (data: any) => void) {
    const wsUrl = this.baseUrl.replace('http', 'ws');
    this.ws = new WebSocket(`${wsUrl}/ws?clientId=${clientId}`);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };

    return this.ws;
  }

  /**
   * Wait for workflow completion with polling
   */
  async waitForCompletion(promptId: string, timeout = 300000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const history = await this.getHistory(promptId);

      if (history?.[promptId]) {
        const status = history[promptId].status;

        if (status?.status_str === 'success') {
          return history[promptId].outputs;
        } else if (status?.status_str === 'error') {
          throw new Error('Workflow execution failed');
        }
      }

      // Wait 1 second before next check
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Workflow execution timeout');
  }
}

// Helper function to generate client ID
export function generateClientId(): string {
  return `danbi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

### 3.3 Workflow Loader

**File**: `src/lib/workflow-loader.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';

export async function loadWorkflow(name: string): Promise<any> {
  const workflowPath = path.join(process.cwd(), 'workflows', `${name}.json`);
  const content = await fs.readFile(workflowPath, 'utf-8');
  return JSON.parse(content);
}

export async function listWorkflows(): Promise<string[]> {
  const workflowDir = path.join(process.cwd(), 'workflows');
  const files = await fs.readdir(workflowDir);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

export function injectParameters(workflow: any, params: Record<string, any>): any {
  const modifiedWorkflow = JSON.parse(JSON.stringify(workflow));

  // Example: Modify specific nodes
  if (params.seed !== undefined) {
    // Find KSampler node and update seed
    Object.keys(modifiedWorkflow).forEach(nodeId => {
      const node = modifiedWorkflow[nodeId];
      if (node.class_type === 'KSampler' || node.class_type === 'WanVideoSampler') {
        node.inputs.seed = params.seed;
      }
    });
  }

  if (params.steps !== undefined) {
    Object.keys(modifiedWorkflow).forEach(nodeId => {
      const node = modifiedWorkflow[nodeId];
      if (node.class_type === 'KSampler' || node.class_type === 'WanVideoSampler') {
        node.inputs.steps = params.steps;
      }
    });
  }

  return modifiedWorkflow;
}
```

### 3.4 API Route - Generate

**File**: `src/app/api/generate/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ComfyUIClient, generateClientId } from '@/lib/comfyui-client';
import { loadWorkflow, injectParameters } from '@/lib/workflow-loader';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowName, parameters, modelName } = body;

    // Load workflow
    const workflow = await loadWorkflow(workflowName);

    // Inject user parameters
    const modifiedWorkflow = injectParameters(workflow, parameters);

    // Create job record
    const job = await prisma.generationJob.create({
      data: {
        modelName,
        workflowName,
        parameters: JSON.stringify(parameters),
        status: 'pending'
      }
    });

    // Queue to ComfyUI
    const client = new ComfyUIClient();
    const clientId = generateClientId();
    const { prompt_id } = await client.queuePrompt(modifiedWorkflow, clientId);

    // Update job with prompt_id
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        promptId: prompt_id,
        status: 'running'
      }
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      promptId: prompt_id
    });

  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
```

### 3.5 API Route - Status

**File**: `src/app/api/status/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ComfyUIClient } from '@/lib/comfyui-client';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await prisma.generationJob.findUnique({
      where: { id: params.id }
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // If still running, check ComfyUI status
    if (job.status === 'running' && job.promptId) {
      const client = new ComfyUIClient();
      const history = await client.getHistory(job.promptId);

      if (history?.[job.promptId]) {
        const status = history[job.promptId].status;

        if (status?.status_str === 'success') {
          const outputs = history[job.promptId].outputs;
          // Extract result path from outputs
          const resultPath = extractResultPath(outputs);

          await prisma.generationJob.update({
            where: { id: job.id },
            data: {
              status: 'completed',
              resultPath,
              completedAt: new Date()
            }
          });

          return NextResponse.json({
            success: true,
            status: 'completed',
            resultPath
          });
        } else if (status?.status_str === 'error') {
          await prisma.generationJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              error: 'ComfyUI execution failed'
            }
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: job.status,
      resultPath: job.resultPath
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

function extractResultPath(outputs: any): string | null {
  // Extract first output image/video path
  for (const nodeId in outputs) {
    const output = outputs[nodeId];
    if (output.images?.[0]) {
      return output.images[0].filename;
    }
    if (output.videos?.[0]) {
      return output.videos[0].filename;
    }
  }
  return null;
}
```

---

## Phase 4: UI Implementation (Day 3-4)

### 4.1 Home Page

**File**: `src/app/page.tsx`

Simple landing page with:
- Quick start button → `/generate`
- Model status (online/offline)
- Recent generations preview

### 4.2 Generation Page

**File**: `src/app/generate/page.tsx`

**Features**:
- Model selector (WAN I2V, WAN T2V, etc.)
- Workflow preset selector
- Parameter inputs:
  - Prompt (text)
  - Image upload (if I2V)
  - Advanced settings (steps, seed, etc.)
- Generate button
- Real-time progress indicator

**UI Components Needed**:
- `<ModelSelector />` - Dropdown of available models
- `<PromptInput />` - Textarea with character count
- `<ImageUpload />` - Drag & drop zone
- `<AdvancedSettings />` - Collapsible panel with sliders
- `<GenerateButton />` - Loading state + progress

### 4.3 Library Page

**File**: `src/app/library/page.tsx`

**Features**:
- Grid view of generated results
- Filter by: status, date, model
- Download button
- Delete button
- Re-generate with same parameters

### 4.4 Settings Page

**File**: `src/app/settings/page.tsx`

**Settings**:
- ComfyUI connection (URL, port)
- Default parameters
- Output directory
- Auto-cleanup old files

---

## Phase 5: Testing & Polish (Day 4-5)

### 5.1 Test Workflow

**End-to-end test**:
1. Open http://localhost:3000
2. Go to Generate page
3. Select "WAN Image-to-Video"
4. Upload test image
5. Enter prompt: "A person talking naturally"
6. Click Generate
7. Watch progress bar
8. View result in Library

### 5.2 Error Handling

**Add checks for**:
- ComfyUI offline → Show connection error
- Model not found → Guide to download
- Workflow failed → Show ComfyUI error
- Timeout → Allow retry

### 5.3 Performance

**Optimizations**:
- Cache workflow JSONs
- Debounce parameter updates
- Lazy load result images
- WebSocket for real-time updates

---

## Phase 6: Future Enhancements

### 6.1 Model Management UI

- Scan models from StabilityMatrix
- Download models via UI
- Model info (size, VRAM, speed)

### 6.2 Custom Workflows

- Visual workflow editor (future)
- Import workflow JSON
- Save custom presets

### 6.3 Batch Processing

- Queue multiple jobs
- Priority system
- Scheduled generation

### 6.4 Automation API

- REST API for n8n/Make
- Webhook notifications
- API key authentication

---

## Critical Requirements

### Must Have (MVP)
- ✅ StabilityMatrix + ComfyUI working
- ✅ WAN I2V workflow functional
- ✅ Basic web UI (generate + view)
- ✅ Job queue system
- ✅ Real-time progress

### Should Have (V1.0)
- ✅ Multiple workflows
- ✅ Parameter presets
- ✅ Library management
- ✅ Error handling

### Nice to Have (V2.0)
- ⏳ Model auto-download
- ⏳ Visual workflow editor
- ⏳ Batch processing
- ⏳ External API

---

## Development Order

**Priority 1 (Week 1)**:
1. StabilityMatrix setup ✓
2. ComfyUI test ✓
3. Next.js project init ✓
4. ComfyUI client library
5. Basic generate page
6. Test with WAN I2V

**Priority 2 (Week 2)**:
1. Library page
2. Settings page
3. Error handling
4. UI polish

**Priority 3 (Week 3+)**:
1. Multiple workflows
2. Model management
3. Advanced features

---

## Commands Reference

### Development
```bash
# Start Next.js dev server
npm run dev

# Start ComfyUI (via StabilityMatrix GUI)
# OR manually:
cd "C:\AI\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI"
python main.py --listen 127.0.0.1 --port 8188

# Database
npx prisma studio     # View data
npx prisma generate   # Update client
npx prisma db push    # Apply schema changes
```

### Testing
```bash
# Test ComfyUI connection
curl http://localhost:8188/system_stats

# Test Next.js API
curl http://localhost:3000/api/models
```

---

## Troubleshooting

### ComfyUI won't start
- Check StabilityMatrix logs
- Verify Python installation
- Check GPU drivers (CUDA)

### Workflow fails
- Open ComfyUI web UI directly
- Test workflow manually
- Check missing models/nodes

### Database locked
- Close Prisma Studio
- Restart Next.js dev server

### Port already in use
- Change ComfyUI port: `--port 8189`
- Update baseUrl in code

---

## Success Criteria

**Phase 1 Complete**:
- ✅ ComfyUI running on localhost:8188
- ✅ WAN workflow generates video
- ✅ Can view result in ComfyUI UI

**Phase 2 Complete**:
- ✅ Next.js project builds
- ✅ Database schema applied
- ✅ Can access http://localhost:3000

**Phase 3 Complete**:
- ✅ Generate page UI loads
- ✅ Can queue job to ComfyUI
- ✅ Job status updates in real-time

**Phase 4 Complete**:
- ✅ Full generate → view workflow works
- ✅ Results save to database
- ✅ Library shows past generations

**MVP Ready**:
- ✅ End-to-end generation working
- ✅ Error handling in place
- ✅ Basic UI polished
- ✅ Ready for automation API

---

## Notes for Claude Code

**Execution Strategy**:
1. **Phase 1**: Terminal commands + manual steps
2. **Phase 2**: File creation + npm commands
3. **Phase 3**: Implement core files
4. **Phase 4**: Build UI components
5. **Phase 5**: Integration testing

**Key Files First**:
- prisma/schema.prisma
- src/lib/comfyui-client.ts
- src/app/api/generate/route.ts
- src/app/generate/page.tsx

**Test After Each Phase**:
- Don't move to next phase until current works
- Use curl/browser to verify each API
- Check database after each operation

**Ask for Feedback**:
- After Phase 1 (environment working?)
- After Phase 3 (API working?)
- After Phase 4 (UI usable?)
