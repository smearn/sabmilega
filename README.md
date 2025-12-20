
# SM EARN

SM EARN is a tournament hosting and wallet management application built with React, Tailwind CSS, and Firebase.

## Features

- **Splash Screen**: Animated entry with slogan "Sab Milega, Trust Me".
- **Authentication**: Secure Login/Register flow with Firebase.
- **Wallet System**: Manage deposits, winnings, and withdrawals.
- **Tournaments**: Host and join Free Fire matches (BR Ranked, Clash Squad, Lone Wolf).
- **Social**: Real-time chat system with friends.
- **Admin Panel**: Comprehensive dashboard to manage users, matches, and transactions.

## 🚀 How to Deploy (Make it Live)

The easiest way to host this app for free is using **Vercel**.

### Step 1: Upload to GitHub
1.  Initialize Git: `git init`
2.  Add files: `git add .`
3.  Commit: `git commit -m "Initial commit"`
4.  Push to your GitHub repository.

### Step 2: Deploy on Vercel
1.  Go to [vercel.com](https://vercel.com) and sign up with GitHub.
2.  Click **"Add New Project"** and select your `sm-earn` repository.
3.  **IMPORTANT**: In the "Configure Project" screen, find the **Environment Variables** section.
4.  You MUST add your Firebase keys here. Open your local `.env` file and copy-paste each key and value pair.
    *   Example: Name: `VITE_FIREBASE_API_KEY`, Value: `AIzaSy...`
5.  Click **Deploy**.

Your app will be live on a URL like `https://sm-earn.vercel.app`!

## Security Note

**GitHub Warning Fix**: This project is configured to use Environment Variables (`.env`) for Firebase keys.
*   **Do not** upload your `.env` file to GitHub.
*   The `.env` file is included in `.gitignore` to prevent this.
*   If you see a warning on GitHub, it might be from previous commits. Ensure your `firebase.ts` uses `import.meta.env` (already configured).

## Development

To run locally:
```bash
npm install
npm run dev
```
