# eGoli-Link

Field Dispatch System for City Power Johannesburg - A PWA that digitizes electrical infrastructure PDFs and enables one-tap navigation for field technicians.

## Features

- **PDF Extraction**: Automatically extract table data from City Power operational diagrams (MSS, HVC, Load Centre schedules)
- **Auto-Geocoding**: Self-building location database - geocode once, cached forever
- **Map View**: Display jobs on an interactive map with Leaflet + OpenStreetMap
- **One-Tap Navigation**: Instant Waze/Google Maps navigation to job sites
- **Offline Support**: PWA with IndexedDB caching for field use in areas with poor connectivity
- **Job Tracking**: Track job completion with photo evidence and status updates

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| PWA | Workbox for service workers |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 15 + PostGIS extension |
| ORM | Prisma |
| PDF Extraction | pdf-parse |
| Maps | Leaflet + OpenStreetMap |
| Navigation | Waze/Google Maps deep linking |
| Geocoding | Nominatim (primary) + Google Geocoding API (fallback) |
| Auth | JWT with Passport.js |

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/KingsmanRon/eGoli-Link.git
   cd eGoli-Link
   ```

2. **Start PostgreSQL with PostGIS**
   ```bash
   docker-compose up -d postgres
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Run database migrations**
   ```bash
   npm run db:migrate -w server
   ```

6. **Seed the database**
   ```bash
   npm run db:seed -w server
   ```

7. **Start development servers**
   ```bash
   npm run dev
   ```

   - Server: http://localhost:3000
   - Client: http://localhost:5173

### Default Users

After seeding, you can log in with:

| Email | Password | Role |
|-------|----------|------|
| admin@citypower.co.za | admin123 | Admin |
| supervisor@citypower.co.za | supervisor123 | Supervisor |
| tech1@citypower.co.za | tech123 | Technician |

## Production Deployment

### Using Docker Compose

```bash
docker-compose up -d
```

This starts:
- PostgreSQL with PostGIS on port 5432
- API server on port 3000
- Nginx serving the PWA on port 80

### Environment Variables

See `.env.example` for all configuration options.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/profile` - Get current user

### Jobs
- `GET /api/jobs` - List jobs (with filters)
- `GET /api/jobs/my` - Get assigned jobs
- `GET /api/jobs/:id` - Get job details
- `PATCH /api/jobs/:id/status` - Update job status
- `POST /api/jobs/:id/photos` - Upload photo

### Locations
- `GET /api/locations/map` - Get geocoded locations for map
- `GET /api/locations/ungeocode` - Get locations needing manual geocoding
- `PATCH /api/locations/:id` - Update coordinates manually

### PDF Processing
- `POST /api/pdf/upload` - Upload and process PDF
- `GET /api/pdf/:id/status` - Check extraction progress
- `POST /api/pdf/:id/create-jobs` - Create jobs from extracted locations

## Project Structure

```
eGoli-Link/
├── client/                  # React PWA
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API and offline services
│   │   └── types/          # TypeScript types
│   └── ...
├── server/                  # Express API
│   ├── src/
│   │   ├── controllers/    # Route handlers
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   └── routes/         # API routes
│   └── prisma/             # Database schema
├── docker-compose.yml
└── package.json            # Workspace root
```

## License

Private - City Power Johannesburg
