
# SM EARN

SM EARN is a tournament hosting and wallet management application built with React, Tailwind CSS, and Firebase.

## Features

- **Splash Screen**: Animated entry with slogan "Sab Milega, Trust Me".
- **Authentication**: Secure Login/Register flow with Firebase.
- **Wallet System**: Manage deposits, winnings, and withdrawals.
- **Tournaments**: Host and join Free Fire matches (BR Ranked, Clash Squad, Lone Wolf).
- **Social**: Real-time chat system with friends.
- **Admin Panel**: Comprehensive dashboard to manage users, matches, and transactions.

## Setup Instructions

### Prerequisites
- Node.js installed on your machine.
- A Firebase project configured.

### Uploading to GitHub

1.  **Initialize Git**:
    ```bash
    git init
    ```

2.  **Add Files**:
    ```bash
    git add .
    ```

3.  **Commit Changes**:
    ```bash
    git commit -m "Initial commit: SM EARN App"
    ```

4.  **Connect to GitHub**:
    - Create a new repository on GitHub (leave it empty, don't add README/gitignore during creation).
    - Run the command provided by GitHub:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
    ```

5.  **Push Code**:
    ```bash
    git push -u origin master
    ```

## Security Note

This project currently uses a `firebase.ts` file with visible API keys. For a production environment, ensure you restrict these keys in the Firebase Console to your specific domains, or move them to `.env` variables.
