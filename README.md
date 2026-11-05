# StudioSpace — Backend API

The backend API for **StudioSpace**, a peer-to-peer creative workspace and production studio sharing platform. It powers studio listings, workspace bookings, authentication, and user-specific operations.

## Project Overview

StudioSpace allows creative professionals, photographers, filmmakers, podcasters, and other creators to discover and book creative workspaces. Studio owners can list their spaces, manage listings, and receive booking requests.

This repository contains the Express.js backend API, MongoDB database integration, and JWT-based authentication middleware.

## Features

- **Studio Management:** Create, retrieve, update, and delete studio listings.
- **Studio Discovery:** Retrieve all studios and featured studios.
- **Booking System:** Create bookings and retrieve user-specific bookings.
- **Booking Management:** Cancel pending bookings.
- **Authentication & Authorization:** Verify Better Auth JWT tokens using JWKS.
- **Protected API Routes:** Restrict studio creation, deletion, and booking operations to authenticated users.
- **MongoDB Integration:** Store studio, booking, and authentication-related data.
- **RESTful API:** Organized API endpoints for frontend integration.
- **CORS Support:** Allow secure communication with the StudioSpace frontend.

## Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend framework |
| MongoDB | NoSQL database |
| Better Auth | Authentication |
| JOSE | JWT verification |
| Cookie Parser | Cookie parsing |
| CORS | Cross-origin resource sharing |
| Vercel | Backend deployment |

## Project Structure

```text
studio-space-server/
│
├── joss/
│   └── verifyToken.js
│
├── index.js
├── package.json
├── package-lock.json
├── .env
└── README.md
```

*Additional project files and folders may be present.*

## Installation & Setup

### 1. Clone the Repository

```bash
git clone YOUR_BACKEND_GITHUB_REPOSITORY_URL
```

### 2. Navigate to the Project Directory

```bash
cd studio-space-server
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory.

```env
MONGODB_URI=your_mongodb_connection_string

AUTH_BASE_URL=http://localhost:3000
```

Optional JWT configuration:

```env
JWT_ISSUER=http://localhost:3000
JWT_AUDIENCE=http://localhost:3000
```

For production, use the deployed frontend URL:

```env
AUTH_BASE_URL=https://studio-space-one.vercel.app
JWT_ISSUER=https://studio-space-one.vercel.app
JWT_AUDIENCE=https://studio-space-one.vercel.app
```

**Important:** Never commit your `.env` file or expose database credentials and authentication secrets in the repository.

### 5. Run the Development Server

```bash
npm run dev
```

The backend runs locally at:

```text
http://localhost:8000
```

## API Endpoints

Base URL:

```text
/api
```

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check backend server status |
| GET | `/api/protected` | Test protected API access |

### Studio Endpoints

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/api/studios` | Get all studios | Public |
| GET | `/api/studios/featured` | Get featured studios | Public |
| GET | `/api/studios/:id` | Get studio details | Public |
| GET | `/api/studios/my-listings` | Get logged-in user's listings | Protected |
| POST | `/api/studios` | Create a studio listing | Protected |
| PUT | `/api/studios/:id` | Update a studio listing | Protected |
| DELETE | `/api/studios/:id` | Delete a studio listing | Protected |

### Booking Endpoints

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/bookings` | Create a booking | Protected |
| GET | `/api/bookings/my-bookings` | Get logged-in user's bookings | Protected |
| PATCH | `/api/bookings/:id/cancel` | Cancel a booking | Protected |

## Authentication & Security

StudioSpace uses **Better Auth** for authentication and JWT-based verification for protected backend operations.

The backend authentication middleware:

- Retrieves authentication tokens from supported session cookies or Bearer tokens.
- Verifies JWT signatures using Better Auth's JWKS endpoint.
- Validates token issuer and audience.
- Checks session-cache JWT audience separately.
- Extracts verified user information.
- Rejects unauthorized requests with HTTP `401 Unauthorized`.

Protected operations require a valid authenticated session.

## Database

StudioSpace uses MongoDB Atlas for persistent data storage.

The database is named:

```text
studio-space
```

The backend uses
