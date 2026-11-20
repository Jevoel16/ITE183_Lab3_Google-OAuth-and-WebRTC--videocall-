// Shape of public/config.js. Normally npm run config writes config.js from
// .env (see .env.example); copy this file by hand only if you don't use Node.
// Everything here is sent to the browser anyway, but config.js is gitignored
// so each developer can use their own Google, GitHub and TURN accounts.
window.JMEET_CONFIG = {
    // Google OAuth 2.0 Web client ID
    googleClientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",

    // GitHub sign-in helper (npm run auth). Leave empty to hide the GitHub button.
    githubAuthUrl: "http://localhost:8002/auth/github",

    // TURN relay for people on different networks. STUN alone often fails
    // or only carries audio one way across mobile data and home Wi-Fi.
    iceServers: [
        // { urls: "turn:YOUR_TURN_HOST:3478", username: "YOUR_USERNAME", credential: "YOUR_PASSWORD" },
        // { urls: "turns:YOUR_TURN_HOST:443?transport=tcp", username: "YOUR_USERNAME", credential: "YOUR_PASSWORD" }
    ]
};
