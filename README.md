# 🍽️ AI-Based FoodShare

FoodShare is a real-time full-stack web platform that connects surplus food donors with NGOs and communities in need. By combining **Live Web Sockets**, **Machine Learning**, and **Geolocation**, FoodShare makes reducing food waste intelligent, secure, and instantaneous.

## ✨ Core Features

### 🤖 **Hybrid AI Quality Check & Intelligence**
- **MobileNet Image Recognition:** Runs directly in the browser using TensorFlow.js to scan food photos.
- **NLP Keyword Scanning:** Analyzes the food's title and description for keywords.
- **Smart Spoilage Detection:** Rejects submissions automatically if mold, insects, or rot are detected visually or textually.
- **Dynamic Freshness Engine:** Calculates a live decaying freshness score (0-100) using exponential decay math based on the specific food category's shelf life.

### 🔐 **Secure & Verified Pickups**
- **JWT Authentication:** Secure user registration and login.
- **OTP Verification:** When a receiver claims food, the system generates a 4-digit One Time Password (OTP). The receiver must show this to the donor in real life to verify the pickup and complete the transaction.

### 🗺️ **Live Map Tracking & Geolocation**
- **Interactive Leaflet Map:** Browse nearby surplus food on a live graphical map.
- **Live Receiver Tracking:** Once food is claimed, the donor can open a "Live Tracking" map dashboard and watch the receiver's GPS dot move in real-time as they approach the pickup address.

### ⚡ **Real-Time Ecosystem**
- **Socket.IO Integration:** Instant notifications pop up without refreshing the page.
- **Rich Claim Alerts:** Donors receive a full-screen, animated modal when someone claims their food, displaying the receiver's details and the required Pickup OTP instantly.

## 🛠️ Tech Stack

| Layer       | Technology                                                |
| ----------- | --------------------------------------------------------- |
| **Frontend**| HTML5, Vanilla JavaScript, CSS3 (Glassmorphism UI)        |
| **Backend** | Node.js, Express.js                                       |
| **Database**| MongoDB Atlas (NoSQL) + Mongoose                          |
| **Real-time**| Socket.IO                                                 |
| **AI / ML** | TensorFlow.js (MobileNet v2), Custom NLP Heuristics       |
| **Maps**    | Leaflet.js, OpenStreetMap CartoDB                         |
| **Auth**    | JSON Web Tokens (JWT), bcrypt.js                          |

---

## 🚀 Getting Started (Installation)

### Prerequisites
- Node.js (v16+)
- A MongoDB Atlas account (free tier is perfect)

### 1. Clone the Repository
```bash
git clone https://github.com/Keshav-tmk/AI-Based-FoodShare.git
cd AI-Based-FoodShare
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a file named `.env` in the root folder and add your configuration:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/foodshare?retryWrites=true&w=majority
PORT=5000
JWT_SECRET=your_super_secret_jwt_key
```

### 4. Start the Application
```bash
# Start the Node/Express server
node server.js
```
The application will launch. Open **http://localhost:5000** in your browser.

---

## 📁 Project Architecture

```
AI-Based-FoodShare/
├── index1.html          # Main Frontend Entry Point
├── styles.css           # Global Styles & Animations (Vanilla CSS)
├── script.js            # Frontend logic (TF.js, Sockets, Maps, Auth)
├── server.js            # Main Express Server & Socket.IO Setup
├── .env                 # Environment config (gitignored)
├── ml/
│   └── foodAI.js        # Server-side AI logic (NLP, Freshness, Recs)
├── middleware/
│   └── auth.js          # JWT Route Protection
├── models/
│   ├── User.js          # User Account Schema
│   ├── Food.js          # Food Listing Schema
│   └── Notification.js  # Socket Notification Schema
├── routes/
│   ├── auth.js          # Registration & Login endpoints
│   ├── food.js          # Food Listing, Claiming, and OTP Verification
│   ├── users.js         # User Profiles
│   ├── ai.js            # AI Analysis API Endpoints
│   └── notifications.js # History of alerts
└── uploads/             # Stores frontend image uploads
```

---

## 👥 Full App Workflow (How It Works)

### Step 1: Registration
- Users register an account and log in.

### Step 2: Sharing Food (Donor)
- The Donor clicks **"Share Food"** and uploads an image, title, and description.
- **AI Intervention:** TensorFlow.js scans the image. The NLP engine scans the text.
  - If it's spoiled or fake, it blocks the post.
  - If valid, it assigns a Freshness Score and Edibility Category.
- The food is pinned to the live map.

### Step 3: Claiming (Receiver)
- A Receiver logs in, browses the map, clicks the food item, and hits **"Claim"**.
- A **4-Digit OTP** is generated on the Receiver's screen.

### Step 4: Real-Time Alerts (Donor)
- The Donor instantly receives a **Rich Claim Alert** via WebSockets with the Receiver's details and the OTP.

### Step 5: Live Tracking
- The Receiver physically travels to the pickup location.
- The Donor clicks **"Track Caller"**, which opens a live GPS map showing the Receiver's dot moving toward the donor in real-time.

### Step 6: OTP Verification & Completion
- The Receiver arrives. The Donor types the Receiver's **4-digit OTP** into the tracking dashboard.
- The system verifies the code. If successful, both parties get a celebratory completion popup, the food leaves the active map, and impact statistics are updated globally!

---

## 🤝 Contributors
- [Keshav-tmk](https://github.com/Keshav-tmk) - Developer & Creator
- [Lohith-V-K](https://github.com/Lohith-V-K) - Developer & Creator
- [chirukori](https://github.com/chirukori) - Developer & Creator