# CampusFix – Futuristic UI Update

## What changed
- Removed the unreliable WebGL/Three.js login Repair Core that could appear blank.
- Restored the original CampusFix Fixy mechanic character directly in the login screen.
- Added a CSS/SVG animated Fixy login stage with glow rings, scanning signal, floating wrench, blinking eyes and subtle motion.
- Added a new **Fixy Observer** panel to the Report a Problem page.
- The observer visually watches the form, blinks, moves its head/eyes, writes notes with an animated pen, and updates live as the student enters the issue.
- Added live report indicators for category, location and captured issue details.
- Kept the existing CampusFix backend/API, authentication, complaints, history, admin deletion, staff assignment, chat and repair-photo workflow.
- No Three.js dependency is required for the updated UI.

## Run
```bash
npm install
npm start
```
Open `http://localhost:3000`.

## Demo accounts
- Admin: `admin@campus.com` / `admin123`
- Staff: `staff@campus.com` / `staff123`
- Student: `student@campus.com` / `student123`
