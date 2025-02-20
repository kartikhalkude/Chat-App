# Chat Application

A real-time chat application with video calling capabilities built with React, Node.js, and MongoDB.

## Features

- Real-time messaging
- Video calling
- Message deletion and chat clearing
- User online/offline status
- Typing indicators
- Emoji support
- Dark theme

## Tech Stack

- Frontend: React, TypeScript, Vite, Styled Components
- Backend: Node.js, Express, Socket.IO
- Database: MongoDB Atlas
- Video Calls: WebRTC (simple-peer)

## Development

1. Install dependencies:

```bash
npm run install-all
```

2. Set up environment variables:
   Create a `.env` file in the chat-app-server directory with:

```
PORT=3000
MONGODB_URI=your_mongodb_atlas_uri
```

3. Run development servers:

```bash
npm run dev
```

## Deployment to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure the following:
   - Build Command: `npm install && npm run install-all && npm run build`
   - Start Command: `npm start`
4. Add environment variables:
   - `PORT`
   - `MONGODB_URI`
   - `NODE_ENV=production`

## Project Structure

```
/
├── chat-app-client/     # Frontend React application
├── chat-app-server/     # Backend Node.js server
└── package.json         # Root package.json for scripts
```

## License

MIT
