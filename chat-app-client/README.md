# Modern React Chat Application

A real-time chat application built with React, TypeScript, Vite, and Socket.IO. Features a modern UI with smooth animations using Framer Motion and styled-components.

## Features

- Real-time messaging using Socket.IO
- Modern and responsive UI with smooth animations
- User authentication
- User online/offline status
- Message history
- Dark theme
- TypeScript support
- Vite for fast development and building

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB (for the backend)

## Getting Started

1. Clone the repository:
```bash
git clone <repository-url>
cd chat-app-client
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (optional):
```env
VITE_API_URL=http://localhost:3000
```

4. Start the development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Project Structure

```
src/
├── components/      # Reusable components
├── pages/          # Page components
├── styles/         # Global styles and theme
├── App.tsx         # Main application component
└── main.tsx        # Application entry point
```

## Technologies Used

- React
- TypeScript
- Vite
- Socket.IO
- Framer Motion
- Styled Components
- React Router DOM
- React Icons

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
