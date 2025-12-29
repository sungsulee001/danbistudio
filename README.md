# DanbiStudio

> Local GPU-based AI Model Platform powered by ComfyUI

DanbiStudio is a Next.js web application that provides a user-friendly interface for AI content generation using your local GPU through ComfyUI.

## 🎯 Features

- **Web-based UI** for AI generation (no command line needed)
- **Real-time status tracking** with automatic polling
- **Job management** with SQLite database
- **REST API** for automation (n8n, Make, Opal compatible)
- **Local GPU execution** via ComfyUI
- **Workflow management** with parameter injection

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │ ───> │  Next.js App │ ───> │   ComfyUI   │
│   (User)    │ <─── │   (API)      │ <─── │ (localhost) │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    SQLite    │
                     │  (Database)  │
                     └──────────────┘
```

## 📋 Prerequisites

- **Node.js** 18+
- **StabilityMatrix** with ComfyUI package
- **ComfyUI** running on `localhost:8188`
- **GPU** (NVIDIA recommended)

## 🚀 Quick Start

### 1. Setup ComfyUI (via StabilityMatrix)

See [PHASE1_SETUP_GUIDE.md](./PHASE1_SETUP_GUIDE.md) for detailed ComfyUI setup instructions.

**Quick version:**
```bash
# Install StabilityMatrix to E:\ai_tool\StabilityMatrix
# Create ComfyUI package: "DanbiStudio-ComfyUI"
# Set launch args: --listen 127.0.0.1 --port 8188
# Start ComfyUI
```

### 2. Install Dependencies

```bash
cd E:\ai_tool\Danbi_Studio
npm install
```

### 3. Setup Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Configure Environment

The `.env` file is already configured:
```env
COMFYUI_URL=http://localhost:8188
DATABASE_URL=file:./prisma/dev.db
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage

### Web Interface

1. **Home** (`/`) - System status and quick start
2. **Generate** (`/generate`) - Create new AI generation
   - Select model and workflow
   - Enter prompt and parameters
   - Submit to queue
3. **Status** (`/status/[id]`) - Track generation progress
   - Real-time polling
   - Download results
4. **Library** (`/library`) - View all generations

### API Endpoints

#### Create Generation Job
```bash
POST /api/generate
Content-Type: application/json

{
  "modelName": "wan_i2v",
  "workflowName": "test_workflow",
  "parameters": {
    "prompt": "A person talking",
    "seed": 12345,
    "steps": 20
  }
}
```

Response:
```json
{
  "id": "job-uuid",
  "status": "pending",
  "promptId": "prompt-123",
  "createdAt": "2025-12-29T..."
}
```

#### Check Job Status
```bash
GET /api/status/:jobId
```

Response:
```json
{
  "id": "job-uuid",
  "status": "completed",
  "resultPath": "/outputs/result.mp4",
  "modelName": "wan_i2v",
  "workflowName": "test_workflow"
}
```

#### Health Check
```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "services": {
    "database": true,
    "comfyui": true
  },
  "version": "0.1.0"
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Build check
npm run build
```

**Test Coverage:** 24/26 tests passing (92%)

## 📁 Project Structure

```
E:\ai_tool\Danbi_Studio\
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Landing page
│   │   ├── generate/          # Generation form
│   │   ├── status/[id]/       # Status tracking
│   │   ├── library/           # Results gallery
│   │   └── api/               # API routes
│   │       ├── generate/      # Create job
│   │       ├── status/[id]/   # Get status
│   │       └── health/        # Health check
│   └── lib/                    # Core libraries
│       ├── comfyui-client.ts  # ComfyUI API client
│       ├── workflow-loader.ts # Workflow management
│       ├── polling.ts         # Status polling
│       ├── result-handler.ts  # File management
│       └── db.ts              # Prisma client
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── dev.db                 # SQLite database
├── workflows/
│   └── test_workflow.json     # Workflow definitions
├── public/
│   └── outputs/               # Generated results
└── tests/                      # Test files
```

## 🛠️ Development

### Database Management

```bash
# Open Prisma Studio
npx prisma studio

# Reset database
rm prisma/dev.db
npx prisma db push
```

### Adding New Workflows

1. Create workflow JSON in `workflows/`
2. Test in ComfyUI first
3. Reference by filename (without .json)

Example:
```json
{
  "1": {
    "inputs": {
      "seed": 0,
      "steps": 20
    },
    "class_type": "KSampler"
  }
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMFYUI_URL` | `http://localhost:8188` | ComfyUI server URL |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite database path |
| `COMFYUI_OUTPUT` | `E:/ai_tool/StabilityMatrix/.../output` | ComfyUI output directory |
| `PORT` | `3000` | Next.js server port |

### Job Processing

- **Max Concurrent Jobs:** 1 (configurable)
- **Polling Interval:** 3 seconds (client-side)
- **Timeout:** 5 minutes (server-side)
- **Status Updates:** Automatic via polling

## 📊 Phase Progress

- ✅ **Phase 1:** Environment Setup (90%)
- ✅ **Phase 2:** Next.js Foundation (95%)
- ✅ **Phase 3:** Core Logic (95%)
- ✅ **Phase 4:** Web UI (90%)
- 🚧 **Phase 5:** Polish & Production (in progress)

## 🐛 Troubleshooting

### ComfyUI Connection Failed
```bash
# Check if ComfyUI is running
curl http://localhost:8188/system_stats

# Start ComfyUI via StabilityMatrix
# Or check launch arguments
```

### Database Errors
```bash
# Regenerate Prisma client
npx prisma generate

# Reset database
rm prisma/dev.db
npx prisma db push
```

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## 📝 License

This project is for personal use. See project documentation for details.

## 🙏 Credits

- **ComfyUI** - AI workflow execution
- **StabilityMatrix** - Model and package management
- **Next.js** - Web framework
- **Prisma** - Database ORM
- **Tailwind CSS** - Styling

## 📚 Documentation

- [Phase 1 Setup Guide](./PHASE1_SETUP_GUIDE.md) - ComfyUI installation
- [Feature Plan](./DANBI_STUDIO_FEATURE_PLAN.md) - Development roadmap
- [API Documentation](./DANBI_STUDIO_FEATURE_PLAN.md#automation-api-specification)

## 🚀 Future Features

- [ ] WebSocket real-time updates
- [ ] Image upload support
- [ ] Multiple model support
- [ ] Batch processing
- [ ] Result library with pagination
- [ ] Advanced workflow editor
- [ ] External API webhooks

---

**Built with TDD methodology** 🧪 | **Phase 4 Complete** ✅ | **92% Test Coverage** 📊
