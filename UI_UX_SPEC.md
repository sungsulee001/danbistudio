# DanbiStudio UI/UX Design Specification

## Design System

### Colors
```css
Primary: #3B82F6 (Blue)
Success: #10B981 (Green)
Warning: #F59E0B (Orange)
Error: #EF4444 (Red)
Background: #FFFFFF
Card: #F9FAFB
Text: #111827
Secondary Text: #6B7280
```

### Typography
```css
Title: 3xl, Bold
Heading: 2xl, Semibold
Body: base, Regular
Small: sm, Regular
```

### Spacing
```
Container: max-w-6xl, mx-auto, px-4
Section Gap: space-y-8
Card Padding: p-6
Button Padding: px-6 py-3
```

---

## Page Layouts

### Home Page (localhost:3001)

```
┌─────────────────────────────────────────┐
│          DanbiStudio (3xl)              │
│   Local GPU-based AI Model Platform     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Quick Start                             │
│                                          │
│  Generate AI videos and images using     │
│  your local GPU with ComfyUI             │
│                                          │
│  [Start Generation] [View Library]       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  System Status                           │
│                                          │
│  Next.js         [Running] (green)       │
│  Database        [Connected] (green)     │
│  ComfyUI         [Ready] (green)         │
│  Phase Progress  [3/5 Complete] (green)  │
└─────────────────────────────────────────┘
```

### Generate Page

```
┌─────────────────────────────────────────┐
│  Generate                                │
└─────────────────────────────────────────┘

┌──────────────────┐ ┌────────────────────┐
│  Model Selection │ │  Preview           │
│                  │ │                    │
│ [WAN I2V    ▼]  │ │  [Upload Image]    │
│                  │ │                    │
│  Prompt          │ │  or                │
│  ┌─────────────┐│ │                    │
│  │             ││ │  [Drag & Drop]     │
│  │             ││ │                    │
│  └─────────────┘│ │                    │
│                  │ │                    │
│  Advanced ▼      │ │                    │
│  Steps: 25       │ │                    │
│  Seed: 12345     │ │                    │
│                  │ │                    │
│  [Generate]      │ │                    │
└──────────────────┘ └────────────────────┘

┌─────────────────────────────────────────┐
│  Progress                                │
│  ████████░░░░░░░░░░░░░░░░░ 40%          │
│  Generating frame 32/81...               │
└─────────────────────────────────────────┘
```

### Library Page

```
┌─────────────────────────────────────────┐
│  Library          [Filter ▼] [Sort ▼]   │
└─────────────────────────────────────────┘

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ IMG  │ │ IMG  │ │ IMG  │ │ IMG  │
│      │ │      │ │      │ │      │
│ WAN  │ │ FLUX │ │ WAN  │ │ FLUX │
│ 2m   │ │ 5m   │ │ 1m   │ │ 3m   │
│ ⬇ 🗑  │ │ ⬇ 🗑  │ │ ⬇ 🗑  │ │ ⬇ 🗑  │
└──────┘ └──────┘ └──────┘ └──────┘

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ ...  │ │ ...  │ │ ...  │ │ ...  │
└──────┘ └──────┘ └──────┘ └──────┘
```

### Settings Page

```
┌─────────────────────────────────────────┐
│  Settings                                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ComfyUI Connection                      │
│                                          │
│  URL: [http://localhost:8188        ]   │
│  Status: ● Connected                     │
│  [Test Connection]                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Default Parameters                      │
│                                          │
│  Steps: [25        ]                     │
│  Seed: [Random     ]                     │
│  Output Format: [MP4 ▼]                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Storage                                 │
│                                          │
│  Auto-cleanup: [✓] After 30 days         │
│  [Clear Old Files]                       │
└─────────────────────────────────────────┘
```

---

## Component Specifications

### System Status Component

```typescript
interface SystemStatusProps {
  services: {
    name: string;
    status: 'running' | 'connected' | 'ready' | 'offline';
  }[];
  progress?: {
    current: number;
    total: number;
  };
}
```

**Behavior**:
- Green dot + text for online
- Red dot + text for offline
- Auto-refresh every 5 seconds
- Click to see details

### Progress Bar Component

```typescript
interface ProgressBarProps {
  value: number; // 0-100
  status: string; // e.g. "Generating frame 32/81..."
  variant: 'primary' | 'success' | 'warning';
}
```

**Behavior**:
- Animated fill
- WebSocket real-time update
- Shows percentage + status text
- Pulse animation when active

### Card Component

```css
.card {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.card:hover {
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}
```

---

## Responsive Design

### Breakpoints
```css
Mobile: < 768px
Tablet: 768px - 1024px
Desktop: > 1024px
```

### Mobile Layout (< 768px)
- Stack sections vertically
- Full-width buttons
- Collapse advanced settings
- Single column gallery

### Tablet Layout (768px - 1024px)
- 2-column gallery
- Side-by-side buttons
- Expandable panels

### Desktop Layout (> 1024px)
- Current layout (shown in screenshot)
- 4-column gallery
- All features visible

---

## Animations

### Page Transitions
```css
fade-in: 200ms ease-in
slide-up: 300ms ease-out
```

### Interactive Elements
```css
button:hover - scale(1.02) + shadow
card:hover - lift + shadow
progress - smooth fill animation
```

---

## Accessibility

- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation (Tab, Enter, Esc)
- [ ] Focus visible styles
- [ ] Screen reader support
- [ ] Color contrast ≥ 4.5:1

---

## Dark Mode (Future)

### Colors (Dark)
```css
Background: #111827
Card: #1F2937
Text: #F9FAFB
Secondary: #9CA3AF
Primary: #60A5FA
```

Toggle in Settings page

---

## Implementation Priority

**Phase 4 (Current)**:
- ✅ Home page layout
- ✅ System Status component
- ⏳ Generate page (in progress)
- ⏳ Library page
- ⏳ Settings page

**Phase 5 (Polish)**:
- Animations
- Loading states
- Error boundaries
- Responsive design
- Accessibility
