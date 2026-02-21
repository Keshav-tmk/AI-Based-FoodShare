# 🍽️ AI-Based FoodShare

FoodShare is a real-time full-stack web platform that connects surplus food donors with NGOs and communities in need, reducing food waste and fighting hunger through secure, map-based instant food sharing.

## ✨ Features

- 🔐 **User Authentication** — Register & login with JWT-based auth
- 🍕 **Share Food** — Donors list surplus food with photos, descriptions & map locations
- 🗺️ **Interactive Map** — Browse food shares on a live Leaflet map
- ⚡ **Real-time Notifications** — Instant alerts via Socket.IO when food is claimed
- 📱 **Responsive Design** — Works on desktop, tablet & mobile
- 📊 **Impact Dashboard** — Track meals saved, active users & sustainability metrics

## 🛠️ Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | HTML, CSS, JavaScript             |
| Backend   | Node.js, Express.js               |
| Database  | MongoDB Atlas                     |
| Real-time | Socket.IO                         |
| Maps      | Leaflet.js + OpenStreetMap        |
| Auth      | JWT + bcrypt                      |
| Uploads   | Multer                            |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [MongoDB Atlas](https://www.mongodb.com/atlas) account (free tier works)

### 1. Clone the Repository

```bash
git clone https://github.com/Keshav-tmk/AI-Based-FoodShare.git
cd AI-Based-FoodShare
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Environment File

Create a `.env` file in the root directory:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/foodshare?retryWrites=true&w=majority
PORT=5000
JWT_SECRET=your_secret_key_here
```

> ⚠️ Replace `<username>`, `<password>`, and `<cluster>` with your MongoDB Atlas credentials. Ask the project admin for the shared connection string.

### 4. Start the Server

```bash
node server.js
```

### 5. Open in Browser

Go to **http://localhost:5000** — the app is live! 🎉

## 📁 Project Structure

```
AI-Based-FoodShare/
├── index1.html          # Main frontend (served by Express)
├── index2.html          # Standalone version (all-in-one)
├── styles.css           # All CSS styles
├── script.js            # Frontend JavaScript
├── server.js            # Express + Socket.IO server
├── .env                 # Environment variables (not in repo)
├── middleware/
│   └── auth.js          # JWT authentication middleware
├── models/
│   ├── User.js          # User schema
│   ├── Food.js          # Food listing schema
│   └── Notification.js  # Notification schema
├── routes/
│   ├── auth.js          # Login & register endpoints
│   ├── food.js          # CRUD for food listings
│   ├── users.js         # User profile & stats
│   └── notifications.js # Notification endpoints
└── uploads/             # Uploaded food photos
```

## 👥 How It Works

1. **Donors** sign up and list surplus food with a photo, description & pickup location
2. **Receivers** browse available food on the map or grid and claim items
3. **Donors get notified** in real-time when someone claims their food
4. **Pickup happens** and the donor marks it as completed

## 📝 Notes

- The `.env` file is **not pushed to GitHub** for security. Each contributor needs their own copy.
- Uploaded food photos are stored locally in `/uploads`. They won't sync across different machines.
- Make sure your MongoDB Atlas cluster has **Network Access** set to allow your IP address.

## 🤝 Contributors

- [Keshav-tmk](https://github.com/Keshav-tmk)
