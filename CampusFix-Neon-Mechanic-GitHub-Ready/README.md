# CampusFix – Neon Mechanic

CampusFix is a campus service-request and maintenance portal with a futuristic mechanic-themed interface. Students can report campus issues, while staff and administrators can manage requests through the application.

## Features

- Campus issue reporting and maintenance workflow
- Role-based demo experiences for students, staff, and administrators
- Categories for services such as electrical, plumbing, mechanical, transport, canteen, bathroom, and air-conditioning support
- Animated mechanic character and interactive reporting UI
- Request history and administrative workflows supported by the project

> This repository is a student project/demo. Review and harden authentication, secrets, and data storage before deploying it for real users.

## Tech stack

- HTML, CSS, JavaScript
- Node.js
- Express
- JSON file storage for local demo data
- `bcryptjs`, `jsonwebtoken`, and `ws`

## Requirements

- Node.js and npm

## Run locally

1. Download or clone this repository.
2. Open a terminal in the project directory.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Set a strong JWT secret before starting the server.

   PowerShell:

   ```powershell
   $env:JWT_SECRET = "replace-with-a-long-random-secret"
   npm start
   ```

   macOS/Linux:

   ```bash
   export JWT_SECRET="replace-with-a-long-random-secret"
   npm start
   ```

5. Open the local URL printed by the application. The project documentation previously used `http://localhost:3000`; check `server.js` if the port has changed.

The application creates a local `db.json` on first startup when one is not present. This generated file is intentionally excluded from this public repository so local/demo user data is not published.

## Demo accounts

The project documentation lists these local demo accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@campus.com` | `admin123` |
| Staff | `staff@campus.com` | `staff123` |
| Student | `student@campus.com` | `student123` |

These are demo-only credentials. Do not reuse them in a deployed or production environment.

## Security notes

- Do not commit `.env` files, API keys, real passwords, or private database exports.
- `db.json` is generated locally and should remain untracked.
- Configure `JWT_SECRET` using an environment variable before running the app.
- The demo authentication and JSON-file storage are not a substitute for a production security review.

## Project status

This repository presents the current CampusFix UI/demo project. Features and setup may evolve as development continues.
