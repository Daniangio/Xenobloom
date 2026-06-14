# Developer Documentation

This document provides an overview of the architecture and design patterns used in this web game template.

## Architecture

The application is designed as a modular monolith, with a Python backend and a React frontend. The backend is a FastAPI application that provides a RESTful API and a WebSocket gateway for real-time communication. The frontend is a single-page application built with React and Zustand for state management.

### Backend

The backend is organized into a series of services and routers. The main components are:

-   **`main.py`:** The main entry point for the FastAPI application. It initializes the database, Redis, and other services.
-   **`routers.py`:** Defines the main API routes for authentication and user management.
-   **`player_router.py`:** Defines the API routes for player-specific data, such as decks and collections.
-   **`admin_router.py`:** Defines the API routes for administrative tasks.
-   **`websocket_gateway.py`:** Handles WebSocket connections and real-time communication.
-   **`services/`:** Contains the business logic for the application, such as chat, presence, and friend management.
-   **`models/`:** Defines the data models for the application, including both database models (SQLAlchemy) and API models (Pydantic).

### Frontend

The frontend is a React application that uses Zustand for state management. The main components are:

-   **`App.jsx`:** The main entry point for the React application. It handles routing and the overall layout of the application.
-   **`store.js`:** The Zustand store, which manages the application's state.
-   **`pages/`:** Contains the main pages of the application, such as the lobby, profile, and friends pages.
-   **`components/`:** Contains reusable React components used throughout the application.
-   **`hooks/`:** Contains custom React hooks.
-   **`lib/`:** Contains utility functions and libraries.

## Design Patterns

### State Management

The frontend uses Zustand for state management. The store is organized into a series of slices, each of which manages a specific part of the application's state.

### Real-time Communication

The application uses WebSockets for real-time communication between the client and server. The backend uses a WebSocket gateway to handle connections and dispatch actions. The frontend uses a custom hook to manage the WebSocket connection and handle incoming messages.

### Asynchronous Operations

The application uses `async/await` for asynchronous operations, such as fetching data from the API and communicating with the WebSocket server.